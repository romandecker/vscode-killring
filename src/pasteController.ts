import * as vscode from "vscode";
import { KillRing } from "./killRing";
import { ClipboardWatcher } from "./clipboardWatcher";

const POST_PASTE_CONTEXT = "killring.justPasted";

interface Candidate {
  doc: vscode.TextDocument;
  start: vscode.Position;
  text: string;
}

/**
 * Drives paste-pop (`[p` / `]p`).
 *
 * Paste itself (`p`/`P`) is left to native VSCodeVim, which is the only thing
 * that knows a register's linewise/charwise mode (the system clipboard loses
 * it). We instead *observe* the most recent single-insertion edit and, when
 * paste-pop fires, verify it was a paste of the current ring entry and replace
 * it in place — mirroring the exact newline shape vim inserted so linewise
 * pastes stay linewise as you cycle.
 *
 * The cycle window is deterministic: `[p`/`]p` only act while the cursor is
 * still inside the just-pasted range. Move away or edit, and they become
 * no-ops (emacs-strict in spirit, no timers).
 */
export class PasteController implements vscode.Disposable {
  private candidate: Candidate | undefined;
  private inCycle = false;
  private cycleEditor: vscode.TextEditor | undefined;
  private cycleStart: vscode.Position | undefined;
  private cycleText = "";
  private leadingNL = false;
  private trailingNL = false;
  private applyingEdit = false;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly ring: KillRing,
    private readonly watcher: ClipboardWatcher,
  ) {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => this.onDocChange(e)),
      vscode.window.onDidChangeActiveTextEditor(() => this.endCycle()),
    );
  }

  async pastePop(): Promise<void> {
    await this.cycle(() => this.ring.popBackward());
  }

  async pastePopNext(): Promise<void> {
    await this.cycle(() => this.ring.popForward());
  }

  /**
   * Insert a specific entry at the cursor (used by the ring picker) and arm the
   * cycle so `[p`/`]p` can immediately correct it. Charwise unless the entry
   * ends in a newline.
   */
  async insertEntry(text: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || text === "") {
      return;
    }
    const linewise = text.endsWith("\n");
    const base = stripOneTrailingNewline(text);
    const active = editor.selection.active;
    let start: vscode.Position;
    let insertString: string;
    if (linewise) {
      const lineLen = editor.document.lineAt(active.line).text.length;
      start = new vscode.Position(active.line, lineLen);
      insertString = "\n" + base;
    } else {
      start = active;
      insertString = base;
    }
    await this.applyEdit(editor, (eb) => eb.insert(start, insertString));
    this.candidate = { doc: editor.document, start, text: insertString };
    this.placeCursor(editor, start, insertString, linewise, false);
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  private onDocChange(e: vscode.TextDocumentChangeEvent): void {
    if (this.applyingEdit) {
      return;
    }
    // Track single insertions as paste candidates; anything else clears it.
    if (e.contentChanges.length === 1) {
      const c = e.contentChanges[0];
      if (c.rangeLength === 0 && c.text.length > 0) {
        this.candidate = {
          doc: e.document,
          start: c.range.start,
          text: c.text,
        };
      } else {
        this.candidate = undefined;
      }
    } else {
      this.candidate = undefined;
    }
    // A non-extension edit to the cycle document ends the cycle.
    if (
      this.inCycle &&
      this.cycleEditor &&
      e.document === this.cycleEditor.document
    ) {
      this.endCycle();
    }
  }

  private async cycle(move: () => string | undefined): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    // Make sure the ring front reflects whatever was just pasted.
    await this.watcher.ingest();
    if (!this.ensureCycle(editor)) {
      return;
    }
    const entry = move();
    if (entry === undefined || entry === "") {
      return;
    }
    await this.applyReplace(editor, entry);
  }

  /** Either continue an active cycle or start one from the last paste. */
  private ensureCycle(editor: vscode.TextEditor): boolean {
    if (
      this.inCycle &&
      this.cycleEditor === editor &&
      this.cursorWithin(editor, this.cycleStart, this.cycleText)
    ) {
      return true;
    }

    const cand = this.candidate;
    if (!cand || cand.doc !== editor.document) {
      return false;
    }
    if (!this.cursorWithin(editor, cand.start, cand.text)) {
      return false;
    }
    // Confirm the last insertion was a paste of the current ring entry
    // (comparing ignoring the newline vim may have added for linewise).
    const current = this.ring.current();
    if (current === undefined || normalizeNL(cand.text) !== normalizeNL(current)) {
      return false;
    }

    this.cycleEditor = editor;
    this.cycleStart = cand.start;
    this.cycleText = cand.text;
    this.leadingNL = cand.text.startsWith("\n");
    this.trailingNL = !this.leadingNL && cand.text.endsWith("\n");
    this.inCycle = true;
    this.setContext(true);
    return true;
  }

  private async applyReplace(
    editor: vscode.TextEditor,
    entry: string,
  ): Promise<void> {
    const start = this.cycleStart!;
    const oldEnd = offsetEnd(start, this.cycleText);
    const insertString = renderShape(entry, this.leadingNL, this.trailingNL);

    await this.applyEdit(editor, (eb) =>
      eb.replace(new vscode.Range(start, oldEnd), insertString),
    );

    this.cycleText = insertString;
    const linewise = this.leadingNL || this.trailingNL;
    this.placeCursor(editor, start, insertString, linewise, this.trailingNL);
    // Keep the clipboard consistent with what is now shown.
    await this.watcher.write(entry);
  }

  private async applyEdit(
    editor: vscode.TextEditor,
    cb: (eb: vscode.TextEditorEdit) => void,
  ): Promise<void> {
    this.applyingEdit = true;
    try {
      await editor.edit(cb, { undoStopBefore: true, undoStopAfter: false });
    } finally {
      this.applyingEdit = false;
    }
  }

  private cursorWithin(
    editor: vscode.TextEditor,
    start: vscode.Position | undefined,
    text: string,
  ): boolean {
    if (!start) {
      return false;
    }
    const end = offsetEnd(start, text);
    const pos = editor.selection.active;
    return pos.isAfterOrEqual(start) && pos.isBeforeOrEqual(end);
  }

  private placeCursor(
    editor: vscode.TextEditor,
    start: vscode.Position,
    inserted: string,
    linewise: boolean,
    trailingNL: boolean,
  ): void {
    let cursor: vscode.Position;
    if (linewise) {
      const contentLine = trailingNL ? start.line : start.line + 1;
      const firstLine = inserted.replace(/^\n/, "").split("\n")[0] ?? "";
      cursor = new vscode.Position(contentLine, firstNonWhitespace(firstLine));
    } else {
      const end = offsetEnd(start, inserted);
      cursor =
        inserted.length > 0 && end.character > 0
          ? new vscode.Position(end.line, end.character - 1)
          : end;
    }
    editor.selection = new vscode.Selection(cursor, cursor);
    editor.revealRange(new vscode.Range(cursor, cursor));
  }

  private endCycle(): void {
    if (!this.inCycle) {
      return;
    }
    this.inCycle = false;
    this.cycleEditor = undefined;
    this.cycleStart = undefined;
    this.cycleText = "";
    this.setContext(false);
  }

  private setContext(value: boolean): void {
    void vscode.commands.executeCommand(
      "setContext",
      POST_PASTE_CONTEXT,
      value,
    );
  }
}

/** Render an entry to match the newline shape of the observed paste. */
function renderShape(
  entry: string,
  leadingNL: boolean,
  trailingNL: boolean,
): string {
  const base = stripOneTrailingNewline(entry);
  if (leadingNL) {
    return "\n" + base;
  }
  if (trailingNL) {
    return base + "\n";
  }
  return base;
}

/** Position at the end of `inserted` when placed at `start`. */
function offsetEnd(start: vscode.Position, inserted: string): vscode.Position {
  const lines = inserted.split("\n");
  if (lines.length === 1) {
    return new vscode.Position(start.line, start.character + inserted.length);
  }
  const last = lines[lines.length - 1];
  return new vscode.Position(start.line + lines.length - 1, last.length);
}

function normalizeNL(s: string): string {
  return s.replace(/^\n/, "").replace(/\n$/, "");
}

function stripOneTrailingNewline(s: string): string {
  return s.endsWith("\n") ? s.slice(0, -1) : s;
}

function firstNonWhitespace(line: string): number {
  const m = line.match(/\S/);
  return m && m.index !== undefined ? m.index : 0;
}
