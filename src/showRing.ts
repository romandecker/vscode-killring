import * as vscode from "vscode";
import { KillRing } from "./killRing";
import { ClipboardWatcher } from "./clipboardWatcher";
import { PasteController } from "./pasteController";

/**
 * Show a QuickPick of the whole ring; selecting an entry moves it to the front
 * and pastes it (so you can then correct it with `[p`/`]p` like any paste).
 */
export async function showRing(
  ring: KillRing,
  watcher: ClipboardWatcher,
  paste: PasteController,
): Promise<void> {
  // Make sure anything freshly copied is present before showing the list.
  await watcher.ingest();

  const entries = ring.getEntries();
  if (entries.length === 0) {
    void vscode.window.showInformationMessage("Kill ring is empty.");
    return;
  }

  const items: (vscode.QuickPickItem & { index: number })[] = entries.map(
    (text, index) => ({
      label: preview(text),
      description: describe(text),
      index,
    }),
  );

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Select a kill-ring entry to paste",
    matchOnDescription: true,
  });
  if (!picked) {
    return;
  }

  ring.selectIndex(picked.index);
  const text = ring.current();
  if (text !== undefined) {
    await watcher.write(text);
    await paste.insertEntry(text);
  }
}

function preview(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  const max = 80;
  const shown = collapsed.length > max ? collapsed.slice(0, max) + "…" : collapsed;
  return shown === "" ? "(whitespace)" : shown;
}

function describe(text: string): string {
  const lines = text.split("\n").length;
  const chars = text.length;
  const linePart = lines > 1 ? `${lines} lines, ` : "";
  return `${linePart}${chars} chars`;
}
