import type { App } from "./app";
import { clamp, context2d, type Point } from "./geometry";
import { MAX_SIDE } from "./platform";

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 8;
const ZOOM_STEPS = [0.02, 0.05, 0.1, 0.125, 0.25, 1 / 3, 0.5, 2 / 3, 1, 1.5, 2, 3, 4, 5, 6, 8];

/** Informações de um evento de ponteiro já convertidas para coordenadas da imagem. */
export interface PointerInfo extends Point {
  /** 0 = esquerdo (cor primária), 2 = direito (cor secundária). */
  button: number;
  shift: boolean;
  alt: boolean;
  mod: boolean;
  /** Alça de seleção sob o ponteiro, se houver. */
  handle?: string;
  event: PointerEvent;
}

/**
 * Área de desenho: um contêiner com rolagem nativa e, dentro dele, o "palco"
 * do tamanho da imagem × zoom, com as camadas empilhadas:
 * imagem → rascunho (traço/forma em andamento) → seleção → alças.
 */
export class View {
  zoom = 1;
  readonly viewport = document.getElementById("viewport")!;
  readonly wrap = document.createElement("div");
  readonly stage = document.createElement("div");
  /** Canvas das camadas, de baixo para cima, com o rascunho logo acima da ativa. */
  private readonly layersEl = document.createElement("div");
  /** Linhas de grade sobre a imagem. */
  readonly grid = document.createElement("div");
  /** Camada onde as ferramentas desenham antes de aplicar na imagem. */
  readonly scratch = document.createElement("canvas");
  readonly scratchCtx = context2d(this.scratch);
  /** Camada acima da imagem para seleção, caixa de texto etc. (em pixels de tela). */
  readonly overlay = document.createElement("div");
  private readonly resizePreview = document.createElement("div");
  onZoomChange: () => void = () => {};
  /** Posição do cursor na imagem (null fora da área de desenho). */
  onCursor: (p: Point | null) => void = () => {};
  private activePointer: number | null = null;

  constructor(private app: App) {
    this.wrap.id = "stage-wrap";
    this.stage.id = "stage";
    this.scratch.id = "scratch";
    this.overlay.id = "overlay";
    this.resizePreview.className = "resize-preview";
    this.resizePreview.hidden = true;
    this.layersEl.id = "layers";
    this.grid.id = "grid";
    this.grid.hidden = true;
    this.stage.append(this.layersEl, this.grid, this.overlay, this.resizePreview);
    for (const dir of ["e", "s", "se"]) {
      const handle = document.createElement("div");
      handle.className = `canvas-handle ${dir}`;
      handle.dataset.canvasHandle = dir;
      this.stage.append(handle);
    }
    this.wrap.append(this.stage);
    this.viewport.append(this.wrap);
    this.installPointer();
    this.installZoomGestures();
  }

  /** Põe na tela os canvas das camadas, na ordem e com a visibilidade atuais. */
  syncLayers() {
    const doc = this.app.doc;
    const children: HTMLElement[] = [];
    doc.layers.forEach((layer, i) => {
      layer.canvas.classList.add("layer");
      layer.canvas.hidden = !layer.visible;
      children.push(layer.canvas);
      if (i === doc.activeIndex) children.push(this.scratch);
    });
    const current = [...this.layersEl.children];
    if (current.length !== children.length || current.some((el, i) => el !== children[i])) {
      this.layersEl.replaceChildren(...children);
    }
  }

  /** Ajusta o palco ao tamanho da imagem e ao zoom. */
  layout() {
    this.syncLayers();
    const { width, height } = this.app.doc;
    if (this.scratch.width !== width || this.scratch.height !== height) {
      this.scratch.width = width;
      this.scratch.height = height;
    }
    this.stage.style.width = `${width * this.zoom}px`;
    this.stage.style.height = `${height * this.zoom}px`;
    // Pixels nítidos quando ampliado; suavizado quando reduzido.
    this.stage.classList.toggle("pixelated", this.zoom >= 2);
    this.app.sel.render();
    this.app.layoutOverlay();
    this.onLayout();
  }

  /** Avisado depois de cada mudança de zoom, tamanho ou rolagem (réguas e grade). */
  onLayout: () => void = () => {};

  setZoom(zoom: number, anchor?: Point) {
    zoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    const vr = this.viewport.getBoundingClientRect();
    const ax = anchor?.x ?? vr.left + this.viewport.clientWidth / 2;
    const ay = anchor?.y ?? vr.top + this.viewport.clientHeight / 2;
    const before = this.toDoc(ax, ay);
    this.zoom = zoom;
    this.layout();
    // Mantém sob o cursor (ou no centro) o mesmo ponto da imagem.
    const sr = this.stage.getBoundingClientRect();
    this.viewport.scrollLeft += sr.left + before.x * zoom - ax;
    this.viewport.scrollTop += sr.top + before.y * zoom - ay;
    this.onZoomChange();
  }

  zoomStep(direction: 1 | -1) {
    const z = this.zoom;
    const next =
      direction > 0 ? ZOOM_STEPS.find((s) => s > z * 1.001) : [...ZOOM_STEPS].reverse().find((s) => s < z * 0.999);
    this.setZoom(next ?? z);
  }

  /** Zoom que faz a imagem caber na janela (sem passar de 100%). */
  fitZoom(): number {
    const margin = 48;
    const w = this.viewport.clientWidth - margin;
    const h = this.viewport.clientHeight - margin;
    return clamp(Math.min(w / this.app.doc.width, h / this.app.doc.height, 1), MIN_ZOOM, 1);
  }

  zoomFit() {
    this.setZoom(this.fitZoom());
    this.viewport.scrollLeft = 0;
    this.viewport.scrollTop = 0;
  }

  /** Coordenadas da janela → coordenadas da imagem. */
  toDoc(clientX: number, clientY: number): Point {
    const r = this.stage.getBoundingClientRect();
    return { x: (clientX - r.left) / this.zoom, y: (clientY - r.top) / this.zoom };
  }

  /** Parte da imagem visível na janela. */
  visibleOrigin(): Point {
    const vr = this.viewport.getBoundingClientRect();
    const p = this.toDoc(vr.left, vr.top);
    return { x: Math.max(0, Math.floor(p.x)), y: Math.max(0, Math.floor(p.y)) };
  }

  setCursor(cursor: string) {
    this.wrap.style.cursor = cursor;
  }

  clearScratch() {
    this.scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.scratchCtx.globalAlpha = 1;
    this.scratchCtx.globalCompositeOperation = "source-over";
    this.scratchCtx.clearRect(0, 0, this.scratch.width, this.scratch.height);
    this.scratch.style.opacity = "";
  }

  private info(e: PointerEvent): PointerInfo {
    const p = this.toDoc(e.clientX, e.clientY);
    const target = e.target as HTMLElement;
    return {
      ...p,
      button: this.activePointer !== null ? this.pressedButton : e.button,
      shift: e.shiftKey,
      alt: e.altKey,
      mod: e.metaKey || e.ctrlKey,
      handle: target.dataset?.selHandle,
      event: e,
    };
  }

  private pressedButton = 0;

  private installPointer() {
    const wrap = this.wrap;
    let canvasResize: { dir: string; start: Point } | null = null;
    let pan: { x: number; y: number; left: number; top: number } | null = null;

    wrap.addEventListener("pointerdown", (e) => {
      if (this.activePointer !== null) return;
      const target = e.target as HTMLElement;
      // Clique em campos (caixa de texto) segue o comportamento normal.
      if (target.closest("textarea, input, select, button")) return;
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur?.();
      if (e.button === 1) {
        pan = { x: e.clientX, y: e.clientY, left: this.viewport.scrollLeft, top: this.viewport.scrollTop };
      } else if (e.button !== 0 && e.button !== 2) {
        return;
      } else if (target.dataset.canvasHandle) {
        this.app.commitPending();
        canvasResize = { dir: target.dataset.canvasHandle, start: this.toDoc(e.clientX, e.clientY) };
      }
      this.activePointer = e.pointerId;
      this.pressedButton = e.button;
      wrap.setPointerCapture(e.pointerId);
      if (!pan && !canvasResize) this.app.pointerDown(this.info(e));
    });

    wrap.addEventListener("pointermove", (e) => {
      if (this.activePointer !== null && e.pointerId !== this.activePointer) return;
      const p = this.toDoc(e.clientX, e.clientY);
      this.onCursor(this.insideDoc(p) ? p : null);
      if (pan) {
        this.viewport.scrollLeft = pan.left - (e.clientX - pan.x);
        this.viewport.scrollTop = pan.top - (e.clientY - pan.y);
      } else if (canvasResize) {
        const size = this.canvasResizeSize(canvasResize.dir, p);
        Object.assign(this.resizePreview.style, {
          width: `${size.w * this.zoom}px`,
          height: `${size.h * this.zoom}px`,
        });
        this.resizePreview.hidden = false;
        this.app.status.showSize(size.w, size.h);
      } else if (this.activePointer !== null) {
        // Eventos agrupados pelo navegador deixam o traço mais fiel em movimentos rápidos.
        const events = e.getCoalescedEvents?.() ?? [];
        for (const ce of events.length ? events : [e]) this.app.pointerMove(this.info(ce));
      } else {
        this.app.pointerHover(this.info(e));
      }
    });

    const finish = (e: PointerEvent, cancelled: boolean) => {
      if (e.pointerId !== this.activePointer) return;
      this.activePointer = null;
      if (wrap.hasPointerCapture(e.pointerId)) wrap.releasePointerCapture(e.pointerId);
      if (pan) {
        pan = null;
      } else if (canvasResize) {
        const size = this.canvasResizeSize(canvasResize.dir, this.toDoc(e.clientX, e.clientY));
        canvasResize = null;
        this.resizePreview.hidden = true;
        this.app.status.update();
        if (!cancelled) this.app.resizeCanvas(size.w, size.h);
      } else if (cancelled) {
        this.app.pointerCancel();
      } else {
        this.app.pointerUp(this.info(e));
      }
    };
    wrap.addEventListener("pointerup", (e) => finish(e, false));
    wrap.addEventListener("pointercancel", (e) => finish(e, true));
    wrap.addEventListener("pointerleave", () => this.activePointer === null && this.onCursor(null));
    wrap.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private insideDoc(p: Point) {
    return p.x >= 0 && p.y >= 0 && p.x < this.app.doc.width && p.y < this.app.doc.height;
  }

  private canvasResizeSize(dir: string, p: Point) {
    const { width, height } = this.app.doc;
    return {
      w: dir.includes("e") ? clamp(Math.round(p.x), 1, MAX_SIDE) : width,
      h: dir.includes("s") ? clamp(Math.round(p.y), 1, MAX_SIDE) : height,
    };
  }

  /** Cmd/Ctrl + roda e pinça no trackpad ampliam em torno do cursor. */
  private installZoomGestures() {
    this.viewport.addEventListener(
      "wheel",
      (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        // Pinça chega como roda com Ctrl e passos pequenos; a roda do mouse, com passos grandes.
        const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        const factor = Math.exp(-clamp(delta, -100, 100) * 0.01);
        this.setZoom(this.zoom * factor, { x: e.clientX, y: e.clientY });
      },
      { passive: false },
    );

    // WebKit (macOS) entrega a pinça como GestureEvent.
    let startZoom = 1;
    type GestureEvent = UIEvent & { scale: number; clientX: number; clientY: number };
    this.viewport.addEventListener("gesturestart", (e) => {
      e.preventDefault();
      startZoom = this.zoom;
    });
    this.viewport.addEventListener("gesturechange", (e) => {
      e.preventDefault();
      const g = e as GestureEvent;
      this.setZoom(startZoom * g.scale, { x: g.clientX, y: g.clientY });
    });
    this.viewport.addEventListener("gestureend", (e) => e.preventDefault());
  }
}
