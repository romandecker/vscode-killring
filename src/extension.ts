import * as vscode from "vscode";
import { KillRing } from "./killRing";
import { ClipboardWatcher } from "./clipboardWatcher";
import { PasteController } from "./pasteController";
import { showRing } from "./showRing";

const CONFIG_SECTION = "killring";

export function activate(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const maxSize = config.get<number>("maxSize", 60);
  const pollInterval = config.get<number>("pollInterval", 250);

  const ring = new KillRing(maxSize);
  const watcher = new ClipboardWatcher(ring, pollInterval);
  const paste = new PasteController(ring, watcher);

  void watcher.start();

  context.subscriptions.push(
    watcher,
    paste,
    vscode.commands.registerCommand("killring.pastePop", () =>
      paste.pastePop(),
    ),
    vscode.commands.registerCommand("killring.pastePopNext", () =>
      paste.pastePopNext(),
    ),
    vscode.commands.registerCommand("killring.showRing", () =>
      showRing(ring, watcher, paste),
    ),
    vscode.commands.registerCommand("killring.clear", () => {
      ring.clear();
      void vscode.window.showInformationMessage("Kill ring cleared.");
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration(CONFIG_SECTION)) {
        return;
      }
      const updated = vscode.workspace.getConfiguration(CONFIG_SECTION);
      ring.setMaxSize(updated.get<number>("maxSize", 60));
      watcher.setInterval(updated.get<number>("pollInterval", 250));
    }),
  );
}

export function deactivate(): void {
  /* subscriptions are disposed by VSCode */
}
