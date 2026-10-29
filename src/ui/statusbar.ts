import type { App } from "../app";
import type { Point } from "../geometry";
import { MAX_ZOOM, MIN_ZOOM } from "../view";
import { popupMenu } from "./dialogs";
import { icon } from "./icons";

const ZOOM_PRESETS = [0.125, 0.25, 0.5, 1, 2, 4, 8];

/** Giro da seleção em graus (0 a 359), se houver. */
const angleText = (a: number) => (a ? ` · ${(Math.round((a * 180) / Math.PI) + 360) % 360}°` : "");

const formatZoom = (z: number) => `${Math.round(z * 1000) / 10}%`;

/** Barra de status: posição do cursor, seleção, tamanho da imagem e zoom. */
export class StatusBar {
  private readonly cursor: HTMLElement;
  private readonly selection: HTMLElement;
  private readonly size: HTMLElement;
  private readonly slider: HTMLInputElement;
  private readonly zoomLabel: HTMLButtonElement;
  /** Tamanho mostrado durante um arrasto (seleção, redimensionar a tela). */
  private draftSize: [number, number] | null = null;

  constructor(
    private app: App,
    private root: HTMLElement,
  ) {
    root.innerHTML = `
      <span class="sb-item" title="Posição do cursor">${icon("cursor", 16)}<span id="sb-cursor"></span></span>
      <span class="sb-item" title="Tamanho da seleção">${icon("selection", 16)}<span id="sb-sel"></span></span>
      <span class="sb-item" title="Tamanho da imagem">${icon("imageSize", 16)}<span id="sb-size"></span></span>
      <span class="sb-spacer"></span>
      <button class="sb-button" id="sb-fit" title="Ajustar à janela">${icon("fit", 16)}</button>
      <button class="sb-button" id="sb-zoom-out" title="Reduzir">${icon("zoomOut", 16)}</button>
      <input id="sb-slider" type="range" min="0" max="1000" step="1" aria-label="Zoom" />
      <button class="sb-button" id="sb-zoom-in" title="Ampliar">${icon("zoomIn", 16)}</button>
      <button class="sb-zoom" id="sb-zoom" title="Escolher zoom"></button>`;
    this.cursor = root.querySelector("#sb-cursor")!;
    this.selection = root.querySelector("#sb-sel")!;
    this.size = root.querySelector("#sb-size")!;
    this.slider = root.querySelector("#sb-slider")!;
    this.zoomLabel = root.querySelector("#sb-zoom")!;

    const view = app.view;
    root.querySelector("#sb-fit")!.addEventListener("click", () => view.zoomFit());
    root.querySelector("#sb-zoom-out")!.addEventListener("click", () => view.zoomStep(-1));
    root.querySelector("#sb-zoom-in")!.addEventListener("click", () => view.zoomStep(1));
    // Escala logarítmica: o meio da barra fica perto de 100%.
    const lo = Math.log(MIN_ZOOM);
    const hi = Math.log(MAX_ZOOM);
    this.slider.addEventListener("input", () => {
      const z = Math.exp(lo + (Number(this.slider.value) / 1000) * (hi - lo));
      // Gruda em 100% para ser fácil voltar ao tamanho real.
      view.setZoom(Math.abs(z - 1) < 0.04 ? 1 : z);
    });
    this.toSlider = (z) => String(Math.round(((Math.log(z) - lo) / (hi - lo)) * 1000));
    this.zoomLabel.addEventListener("click", async () => {
      const choice = await popupMenu(
        this.zoomLabel,
        [
          ...ZOOM_PRESETS.map((z) => ({ label: formatZoom(z), value: z, checked: Math.abs(view.zoom - z) < 1e-6 })),
          { label: "Ajustar à janela", value: 0 },
        ],
        "above",
      );
      if (choice === 0) view.zoomFit();
      else if (choice) view.setZoom(choice);
    });
  }

  private toSlider: (z: number) => string;

  setVisible(visible: boolean) {
    this.root.hidden = !visible;
  }

  setCursor(p: Point | null) {
    this.cursor.textContent = p ? `${Math.floor(p.x)}, ${Math.floor(p.y)}px` : "";
  }

  showSize(w: number, h: number) {
    this.draftSize = [w, h];
    this.update();
  }

  update() {
    const app = this.app;
    const draft = this.draftSize;
    this.draftSize = null;
    const rect = app.sel.rect;
    this.selection.textContent = draft
      ? `${Math.round(draft[0])} × ${Math.round(draft[1])}px`
      : rect
        ? `${Math.round(rect.w)} × ${Math.round(rect.h)}px` + angleText(app.sel.angle)
        : "";
    this.size.textContent = `${app.doc.width} × ${app.doc.height}px`;
    this.zoomLabel.textContent = formatZoom(app.view.zoom);
    this.slider.value = this.toSlider(app.view.zoom);
  }
}
