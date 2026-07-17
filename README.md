# Kill Ring

Emacs-style **kill-ring** for VSCode that is designed to work *with*
[VSCodeVim](https://marketplace.visualstudio.com/items?itemName=vscodevim.vim).

Paste the most recent thing you copied with `p`, and — immediately after — cycle
backward and forward through your clipboard history with `[p` / `]p` to *correct*
the paste in place. It is the emacs `yank` / `yank-pop` workflow, wired for vim
keybindings.

## What it does

- Every copy/cut/yank (from vim, from VSCode, or from any other application) is
  captured into a ring of recent entries.
- `p` / `P` paste the current ring entry.
- Right after a paste, `[p` walks to **older** entries and `]p` walks back toward
  **newer** ones, replacing the just-pasted text each time. This lets you "fix" a
  paste without deleting and re-pasting.
- A picker (`killring.showRing`, bound to `Alt+Y` by default) lists the whole
  ring so you can jump straight to any entry.

## Requirements

This extension captures whatever lands on the **system clipboard**. For your vim
yanks and cuts to be captured, VSCodeVim must route the unnamed register through
the system clipboard:

```jsonc
// settings.json
"vim.useSystemClipboard": true
```

## Setup with VSCodeVim

An extension cannot inject bindings into `vim.normalModeKeyBindings`, so add the
recommended wiring to your own `settings.json`. Paste (`p`/`P`) stays **native**
so vim keeps its linewise/charwise behavior; you only bind the cycle chords:

```jsonc
// settings.json
"vim.normalModeKeyBindings": [
  { "before": ["[", "p"], "commands": ["killring.pastePop"] },
  { "before": ["]", "p"], "commands": ["killring.pastePopNext"] }
]
```

`[p` / `]p` only do anything while the cursor is still inside the text you just
pasted; anywhere else they are no-ops (they will not shadow other bindings).

### Rebinding

The commands are plain VSCode commands, so bind them however you like:

| Command                  | Purpose                              |
| ------------------------ | ------------------------------------ |
| `killring.pastePop`      | Cycle to older entry (`yank-pop`)    |
| `killring.pastePopNext`  | Cycle to newer entry                 |
| `killring.showRing`      | Open the ring picker                 |
| `killring.clear`         | Empty the ring                       |

## How capture works

VSCode has no "clipboard changed" event, so the ring is filled two ways:

1. **Polling** the clipboard on a timer (`killring.pollInterval`, default
   `250ms`) — this catches copies you *stage but never paste*, and copies made in
   other apps.
2. **Lazy ingest at paste time** — guarantees the value you are about to paste is
   in the ring.

Together these mean anything you copy is remembered, whether or not you ever
paste it. (The only theoretical gap is two distinct copies made within a single
poll interval that are *both* never pasted.)

## Settings

| Setting                 | Default | Description                                                        |
| ----------------------- | ------- | ------------------------------------------------------------------ |
| `killring.maxSize`      | `60`    | Maximum entries kept in the ring; oldest are evicted first.        |
| `killring.pollInterval` | `250`   | Clipboard poll interval in ms. `0` disables polling.               |

## Behavior notes

- **Pointer semantics** match emacs: a fresh copy resets to the newest entry; a
  plain `p` pastes from wherever the pointer is; popping moves the pointer and
  wraps at the ends. So after popping to an older entry (without copying
  anything new), the next `p` repeats that older entry.
- **Consecutive duplicates** are collapsed — copying the same text twice in a row
  does not create two entries.
- **Linewise vs charwise**: paste is native vim, so linewise/charwise behavior
  is exactly vim's. When you *cycle* with `[p`/`]p`, the replacement mirrors the
  newline shape of the paste it replaces, so a linewise paste stays linewise as
  you cycle.

## How paste-pop works

Paste (`p`/`P`) is left to native VSCodeVim — the system clipboard loses vim's
linewise/charwise register mode, so only vim can paste it correctly. The
extension *observes* the last single-insertion edit; when you press `[p`/`]p`
while the cursor is still inside that inserted text, it confirms the text was a
paste of the current ring entry and swaps it for the previous/next entry.

## Known limitations (v1)

- **Paste-pop only follows a plain `p`/`P`.** Because paste is native, `3p` and
  `.`-repeat work normally — but a multi-insertion paste (a **blockwise**
  `Ctrl-v` paste, or a counted `3p`) produces several edits at once, which the
  observer skips; those can be pasted but not cycled.
- Paste-pop starts only while the cursor is **still inside the just-pasted
  text**; move away and `[p`/`]p` become no-ops.
- **Visual-mode** and **insert-mode** pastes are left to native vim/VSCode; the
  ring still captures their clipboard effects, but `[p`/`]p` only correct a
  normal-mode paste.
- The ring is **in-memory only** — it is not persisted across restarts and is not
  shared live between windows.

## License

MIT
