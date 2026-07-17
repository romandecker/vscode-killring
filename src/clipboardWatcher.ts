import * as vscode from "vscode";
import { KillRing } from "./killRing";

/**
 * Watches the system clipboard and feeds changes into the kill ring.
 *
 * VSCode exposes no clipboard-change event, so capture works two ways:
 *   1. Polling on a timer (default 250ms) — this catches copies you never
 *      paste (staged kills) and copies made in other applications.
 *   2. Lazy ingest at paste time (`ingest()` is called by the paste command)
 *      — guarantees the value about to be pasted is in the ring.
 *
 * To avoid a feedback loop, every value the extension itself writes to the
 * clipboard is recorded in `lastSeen`, so the poll does not re-capture it.
 */
export class ClipboardWatcher {
  private lastSeen: string | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(
    private readonly ring: KillRing,
    private interval: number,
  ) {}

  async start(): Promise<void> {
    // Seed with whatever is already on the clipboard so the ring starts useful.
    try {
      const initial = await vscode.env.clipboard.readText();
      this.lastSeen = initial;
      this.ring.push(initial);
    } catch {
      /* clipboard unavailable — ignore */
    }
    this.schedule();
  }

  setInterval(interval: number): void {
    this.interval = interval;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.schedule();
  }

  /**
   * Read the clipboard and, if it changed since we last saw it, push it onto
   * the ring. Returns the current clipboard text. Safe to call directly (used
   * for lazy ingest at paste time).
   */
  async ingest(): Promise<string> {
    let text: string;
    try {
      text = await vscode.env.clipboard.readText();
    } catch {
      return this.lastSeen ?? "";
    }
    if (text !== this.lastSeen) {
      this.lastSeen = text;
      this.ring.push(text);
    }
    return text;
  }

  /**
   * Write text to the clipboard on behalf of the extension, recording it so
   * the poll does not treat it as a fresh external copy.
   */
  async write(text: string): Promise<void> {
    this.lastSeen = text;
    try {
      await vscode.env.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private schedule(): void {
    if (this.disposed || this.interval <= 0) {
      return;
    }
    // Chained setTimeout (not setInterval) so ticks never overlap.
    this.timer = setTimeout(async () => {
      await this.ingest();
      this.schedule();
    }, this.interval);
  }
}
