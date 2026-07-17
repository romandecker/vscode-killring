/**
 * Pure kill-ring data structure with emacs-style yank-pointer semantics.
 *
 * No VSCode dependencies live here on purpose: this is the fiddly logic
 * (pointer movement, wrapping, consecutive dedup, eviction) and it is unit
 * tested in isolation.
 *
 * Model:
 *   - `entries[0]` is the most-recently captured text ("front" of the ring).
 *   - A "yank pointer" indexes into `entries`; a plain paste reads the entry
 *     at the pointer.
 *   - A new capture resets the pointer to the front.
 *   - Paste-pop moves the pointer to older entries (wrapping); paste-pop-next
 *     moves it back toward newer entries.
 */
export class KillRing {
  private entries: string[] = [];
  private pointer = 0;
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = Math.max(1, Math.floor(maxSize));
  }

  get size(): number {
    return this.entries.length;
  }

  isEmpty(): boolean {
    return this.entries.length === 0;
  }

  /** Snapshot of entries, most-recent first. */
  getEntries(): readonly string[] {
    return this.entries.slice();
  }

  /** Current pointer index (mainly for tests/inspection). */
  getPointer(): number {
    return this.pointer;
  }

  setMaxSize(maxSize: number): void {
    this.maxSize = Math.max(1, Math.floor(maxSize));
    this.truncate();
  }

  /**
   * Capture new text into the ring.
   *
   * - Empty strings are ignored.
   * - If the text equals the current front, it is treated as a consecutive
   *   duplicate: no new entry is added, but the pointer is reset to the front.
   * - Otherwise the text becomes the new front and the pointer resets.
   *
   * Returns true if a new entry was actually added.
   */
  push(text: string): boolean {
    if (text === "") {
      return false;
    }
    if (this.entries.length > 0 && this.entries[0] === text) {
      // Consecutive duplicate: don't grow the ring, but a fresh capture still
      // means "the front is what you want next", so reset the pointer.
      this.pointer = 0;
      return false;
    }
    this.entries.unshift(text);
    this.truncate();
    this.pointer = 0;
    return true;
  }

  /** The entry the pointer currently references, or undefined if empty. */
  current(): string | undefined {
    return this.entries[this.pointer];
  }

  /** Move the pointer to an older entry (wrapping) and return it. */
  popBackward(): string | undefined {
    if (this.entries.length === 0) {
      return undefined;
    }
    this.pointer = (this.pointer + 1) % this.entries.length;
    return this.current();
  }

  /** Move the pointer to a newer entry (wrapping) and return it. */
  popForward(): string | undefined {
    if (this.entries.length === 0) {
      return undefined;
    }
    this.pointer =
      (this.pointer - 1 + this.entries.length) % this.entries.length;
    return this.current();
  }

  /**
   * Select a specific index as the current entry (used by the ring picker).
   * The chosen entry is moved to the front so a subsequent plain paste repeats
   * it, matching the "you just picked this" expectation.
   */
  selectIndex(index: number): string | undefined {
    if (index < 0 || index >= this.entries.length) {
      return undefined;
    }
    const [text] = this.entries.splice(index, 1);
    this.entries.unshift(text);
    this.pointer = 0;
    return text;
  }

  clear(): void {
    this.entries = [];
    this.pointer = 0;
  }

  private truncate(): void {
    if (this.entries.length > this.maxSize) {
      this.entries.length = this.maxSize;
    }
    if (this.pointer >= this.entries.length) {
      this.pointer = 0;
    }
  }
}
