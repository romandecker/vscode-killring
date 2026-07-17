# Changelog

## 0.1.1

- Paste (`p`/`P`) is now left to native VSCodeVim instead of being remapped, so
  linewise/charwise behavior, counts, and dot-repeat are exactly vim's. The
  system clipboard cannot carry vim's register mode, so owning paste broke
  linewise pastes.
- `[p`/`]p` now work by observing the last paste and replacing it in place,
  mirroring the newline shape vim inserted. The cycle window is deterministic
  (active while the cursor is inside the pasted text) — no more settle timer.
- Removed the now-unused `killring.paste` / `killring.pasteBefore` commands.

## 0.1.0

Initial release.

- Emacs-style kill ring with yank-pointer semantics.
- `killring.paste` / `killring.pasteBefore` — extension-owned paste that tracks
  the inserted range (charwise + linewise-by-newline heuristic).
- `killring.pastePop` / `killring.pastePopNext` — cycle backward/forward through
  the ring in the post-paste window, correcting the paste in place.
- `killring.showRing` — QuickPick browser of the ring.
- `killring.clear` — empty the ring.
- Capture via clipboard polling (`killring.pollInterval`) plus lazy ingest at
  paste time, so staged and external copies are all remembered.
- Configurable ring size (`killring.maxSize`, default 60) with consecutive-dup
  collapsing.
