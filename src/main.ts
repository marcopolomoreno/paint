import "./styles.css";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { App, inTauri } from "./app";
import { isMac } from "./platform";
import { installHtmlMenu, installKeyboard, installNativeMenu } from "./ui/menus";
import { installLayersPanel } from "./ui/layers";
import { Rulers } from "./ui/rulers";
import { StatusBar } from "./ui/statusbar";
import { installToolbar } from "./ui/toolbar";

async function start() {
  document.body.classList.toggle("mac", isMac);

  const app = new App();
  app.status = new StatusBar(app, document.getElementById("statusbar")!);
  installToolbar(app, document.getElementById("ribbon")!, document.getElementById("contextbar")!);
  installTitleButtons(app);
  installLayersPanel(app, document.getElementById("layers-panel")!);
  app.rulers = new Rulers(
    app,
    document.getElementById("canvas-area")!,
    document.getElementById("ruler-top") as HTMLCanvasElement,
    document.getElementById("ruler-left") as HTMLCanvasElement,
  );
  installKeyboard(app);
  app.init();
  if (import.meta.env.DEV) Object.assign(window, { app });

  if (isMac && inTauri) await installNativeMenu(app).catch((err) => console.error("Falha ao criar o menu", err));
  else installHtmlMenu(app, document.getElementById("menubar")!);

  // Menu de contexto do navegador não faz sentido no app (exceto em campos de texto).
  window.addEventListener("contextmenu", (e) => {
    if (!(e.target as HTMLElement).closest("input, textarea")) e.preventDefault();
  });

  if (!inTauri) return;

  // Arquivos abertos pelo Finder/Explorer, pela linha de comando ou arrastados para a janela.
  await listen("open-files", () => void app.openPending());
  await getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type === "drop") void app.openFiles(event.payload.paths);
  });
  await app.openPending();

  // Fechar a janela pergunta se quer salvar as alterações.
  const win = getCurrentWindow();
  await win.onCloseRequested(async (event) => {
    event.preventDefault();
    if (await app.confirmDiscard()) await win.destroy();
  });
}

function installTitleButtons(app: App) {
  const undo = document.getElementById("tb-undo") as HTMLButtonElement;
  const redo = document.getElementById("tb-redo") as HTMLButtonElement;
  undo.addEventListener("click", () => void app.run("undo"));
  redo.addEventListener("click", () => void app.run("redo"));
  app.onUi(() => {
    undo.disabled = !app.doc.history.canUndo && !app.sel.isFloating;
    redo.disabled = !app.doc.history.canRedo;
  });
}

start().catch((err) => console.error(err));
