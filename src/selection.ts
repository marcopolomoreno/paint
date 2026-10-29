import type { App } from "./app";
import { boundsOf, context2d, createCanvas, intersect, parseHex, snapRect, union, type Point, type Rect } from "./geometry";

const SVG_NS = "http://www.w3.org/2000/svg";
export const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
export type Handle = (typeof HANDLES)[number];

/**
 * Seleção retangular ou livre. Enquanto está "parada" é só uma área marcada;
 * ao mover, redimensionar, girar ou colar, os pixels vão para um canvas
 * flutuante, que só é aplicado à imagem (num único passo de desfazer) quando a
 * seleção é solta.
 */
export class Selection {
  /** Posição e tamanho atuais, em pixels da imagem. */
  rect: Rect | null = null;
  /** Contorno da seleção livre, nas coordenadas de `pathRect`. */
  private path: Point[] | null = null;
  private pathRect: Rect | null = null;
  /** Pixels levantados (no tamanho original; esticados até `rect` ao desenhar). */
  private floating: HTMLCanvasElement | null = null;
  /** De onde os pixels saíram e como era a imagem lá, para o desfazer. */
  private lifted: { rect: Rect; before: ImageData } | null = null;
  private keyed: { canvas: HTMLCanvasElement; key: string } | null = null;

  private readonly floatEl = document.createElement("canvas");
  private readonly svg = document.createElementNS(SVG_NS, "svg");
  private readonly outline = document.createElementNS(SVG_NS, "path");
  private readonly outlineDash = document.createElementNS(SVG_NS, "path");
  private readonly handles: HTMLElement[];
  private draft: Rect | Point[] | null = null;

  constructor(private app: App) {
    this.floatEl.className = "floating";
    this.svg.classList.add("sel-outline");
    this.outline.classList.add("sel-line");
    this.outlineDash.classList.add("sel-ants");
    this.svg.append(this.outline, this.outlineDash);
    this.handles = HANDLES.map((h) => {
      const el = document.createElement("div");
      el.className = `sel-handle ${h}`;
      el.dataset.selHandle = h;
      return el;
    });
    app.view.overlay.append(this.floatEl, this.svg, ...this.handles);
    this.render();
  }

  get active() {
    return this.rect !== null;
  }

  get isFloating() {
    return this.floating !== null;
  }

  /** Define uma nova área (retângulo ou contorno livre), soltando a anterior. */
  set(area: Rect | Point[]) {
    this.drop();
    const doc = this.app.doc;
    if (Array.isArray(area)) {
      if (area.length < 3) return this.clear();
      const rect = doc.clip(boundsOf(area));
      if (!rect) return this.clear();
      this.rect = rect;
      this.path = area;
      this.pathRect = { ...rect };
    } else {
      const rect = doc.clip(area);
      if (!rect) return this.clear();
      this.rect = rect;
    }
    this.render();
  }

  /** Mostra o contorno de uma seleção sendo desenhada. */
  showDraft(draft: Rect | Point[] | null) {
    this.draft = draft;
    this.render();
  }

  contains(p: Point): boolean {
    const r = this.rect;
    if (!r || p.x < r.x || p.y < r.y || p.x >= r.x + r.w || p.y >= r.y + r.h) return false;
    if (!this.path || this.floating) return true;
    const ctx = this.app.view.scratchCtx;
    return ctx.isPointInPath(this.pathObject(), p.x, p.y);
  }

  /** Esquece a seleção, aplicando antes os pixels flutuantes. */
  clear() {
    if (this.floating) this.drop();
    this.rect = null;
    this.path = null;
    this.pathRect = null;
    this.render();
  }

  /** Aplica os pixels flutuantes na imagem e encerra a seleção. */
  drop() {
    const floating = this.floating;
    const rect = this.rect;
    if (!floating || !rect) {
      this.rect = null;
      this.path = null;
      this.render();
      return;
    }
    const doc = this.app.doc;
    const lifted = this.lifted;
    const dest = doc.clip(rect);
    const area = dest && lifted ? union(dest, lifted.rect) : (dest ?? lifted?.rect ?? null);
    if (area) {
      // O "antes" é a imagem atual (com o buraco) com a origem restaurada.
      let before = doc.ctx.getImageData(area.x, area.y, area.w, area.h);
      if (lifted) {
        const tmp = context2d(createCanvas(area.w, area.h));
        tmp.putImageData(before, 0, 0);
        tmp.putImageData(lifted.before, lifted.rect.x - area.x, lifted.rect.y - area.y);
        before = tmp.getImageData(0, 0, area.w, area.h);
      }
      const ctx = doc.ctx;
      ctx.save();
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(this.display(), rect.x, rect.y, rect.w, rect.h);
      ctx.restore();
      doc.history.pushRegion(area, before);
      doc.changed();
    }
    this.floating = null;
    this.lifted = null;
    this.keyed = null;
    this.rect = null;
    this.path = null;
    this.render();
  }

  /**
   * Levanta os pixels da área para movê-los. Sem `copy`, o lugar de onde
   * saíram é preenchido com a cor secundária, como no Paint.
   */
  lift(copy = false) {
    const rect = this.rect;
    if (this.floating || !rect) return;
    const doc = this.app.doc;
    const canvas = createCanvas(rect.w, rect.h);
    const ctx = context2d(canvas);
    if (this.path) {
      ctx.translate(-rect.x, -rect.y);
      ctx.clip(this.pathObject());
      ctx.drawImage(doc.canvas, 0, 0);
    } else {
      ctx.drawImage(doc.canvas, -rect.x, -rect.y);
    }
    this.floating = canvas;
    this.keyed = null;
    this.lifted = null;
    if (!copy) {
      this.lifted = { rect: { ...rect }, before: doc.ctx.getImageData(rect.x, rect.y, rect.w, rect.h) };
      doc.ctx.save();
      doc.ctx.fillStyle = this.app.secondary;
      if (this.path) doc.ctx.fill(this.pathObject());
      else doc.ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      doc.ctx.restore();
      doc.changed();
    }
    this.render();
  }

  /** Coloca uma imagem colada como seleção flutuante em `at`. */
  paste(source: HTMLCanvasElement, at: Point) {
    this.drop();
    this.floating = source;
    this.lifted = null;
    this.keyed = null;
    this.rect = { x: at.x, y: at.y, w: source.width, h: source.height };
    this.render();
  }

  moveTo(x: number, y: number) {
    if (!this.rect) return;
    this.rect = { ...this.rect, x: Math.round(x), y: Math.round(y) };
    this.render();
  }

  resizeTo(rect: Rect) {
    this.rect = snapRect(rect);
    this.render();
  }

  /** Aplica uma transformação (girar, inverter…) aos pixels selecionados. */
  transform(fn: (source: HTMLCanvasElement) => HTMLCanvasElement) {
    if (!this.rect) return;
    this.lift();
    const result = fn(this.bakedFloating());
    // O contorno livre não acompanha a transformação; a transparência já guarda o formato.
    this.path = null;
    this.floating = result;
    this.keyed = null;
    this.rect = { x: this.rect.x, y: this.rect.y, w: result.width, h: result.height };
    this.render();
  }

  /** Apaga o conteúdo selecionado (preenche com a cor secundária). */
  deleteContents() {
    const rect = this.rect;
    if (!rect) return;
    const doc = this.app.doc;
    if (this.floating) {
      // Os pixels flutuantes somem; o buraco de onde saíram fica.
      if (this.lifted) {
        doc.history.pushRegion(this.lifted.rect, this.lifted.before);
        doc.changed();
      }
      this.floating = null;
      this.lifted = null;
    } else {
      const path = this.path && this.pathObject();
      doc.edit(rect, (ctx) => {
        ctx.fillStyle = this.app.secondary;
        if (path) ctx.fill(path);
        else ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      });
    }
    this.rect = null;
    this.path = null;
    this.render();
  }

  /** Pixels selecionados, como aparecem na tela (para copiar). */
  pixels(): ImageData | null {
    const rect = this.rect;
    if (!rect) return null;
    if (this.floating) {
      const canvas = createCanvas(rect.w, rect.h);
      const ctx = context2d(canvas);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(this.display(), 0, 0, rect.w, rect.h);
      return ctx.getImageData(0, 0, rect.w, rect.h);
    }
    const doc = this.app.doc;
    const area = intersect(rect, doc.bounds);
    if (!area) return null;
    if (!this.path) return doc.ctx.getImageData(area.x, area.y, area.w, area.h);
    const ctx = context2d(createCanvas(area.w, area.h));
    ctx.translate(-area.x, -area.y);
    ctx.clip(this.pathObject());
    ctx.drawImage(doc.canvas, 0, 0);
    return ctx.getImageData(0, 0, area.w, area.h);
  }

  /** Atualiza a seleção na tela (posição, zoom, transparência). */
  render() {
    const zoom = this.app.view.zoom;
    const rect = this.rect;
    const floating = this.floating;

    this.floatEl.hidden = !floating || !rect;
    if (floating && rect) {
      const shown = this.display();
      if (this.floatEl.width !== shown.width || this.floatEl.height !== shown.height) {
        this.floatEl.width = shown.width;
        this.floatEl.height = shown.height;
      }
      const ctx = this.floatEl.getContext("2d")!;
      ctx.clearRect(0, 0, shown.width, shown.height);
      ctx.drawImage(shown, 0, 0);
      Object.assign(this.floatEl.style, {
        left: `${rect.x * zoom}px`,
        top: `${rect.y * zoom}px`,
        width: `${rect.w * zoom}px`,
        height: `${rect.h * zoom}px`,
      });
    }

    const d = this.outlinePath(zoom);
    this.outline.setAttribute("d", d);
    this.outlineDash.setAttribute("d", d);
    this.svg.style.display = d ? "" : "none";

    const showHandles = !!rect && !this.draft;
    this.handles.forEach((el, i) => {
      el.hidden = !showHandles;
      if (!showHandles) return;
      const h = HANDLES[i];
      const x = h.includes("w") ? rect!.x : h.includes("e") ? rect!.x + rect!.w : rect!.x + rect!.w / 2;
      const y = h.includes("n") ? rect!.y : h.includes("s") ? rect!.y + rect!.h : rect!.y + rect!.h / 2;
      el.style.left = `${x * zoom}px`;
      el.style.top = `${y * zoom}px`;
    });
    this.app.status?.update();
  }

  /** Contorno na tela, em pixels de tela relativos ao palco. */
  private outlinePath(zoom: number): string {
    const f = (n: number) => (Math.round(n * zoom) + 0.5).toFixed(1);
    const poly = (points: Point[]) =>
      points.map((p, i) => `${i ? "L" : "M"}${f(p.x)} ${f(p.y)}`).join("") + (points.length > 2 ? "Z" : "");
    const box = (r: Rect) =>
      `M${f(r.x)} ${f(r.y)}H${f(r.x + r.w)}V${f(r.y + r.h)}H${f(r.x)}Z`;
    if (this.draft) return Array.isArray(this.draft) ? poly(this.draft) : box(this.draft);
    if (!this.rect) return "";
    if (this.path && this.pathRect && !this.floating) return poly(this.path);
    if (this.path && this.pathRect) return poly(this.mapPath());
    return box(this.rect);
  }

  /** Contorno livre levado para a posição/tamanho atuais. */
  private mapPath(): Point[] {
    const from = this.pathRect!;
    const to = this.rect!;
    const sx = to.w / from.w;
    const sy = to.h / from.h;
    return this.path!.map((p) => ({ x: to.x + (p.x - from.x) * sx, y: to.y + (p.y - from.y) * sy }));
  }

  private pathObject(): Path2D {
    const path = new Path2D();
    this.path!.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)));
    path.closePath();
    return path;
  }

  /** Pixels flutuantes já no tamanho atual da seleção. */
  private bakedFloating(): HTMLCanvasElement {
    const floating = this.floating!;
    const rect = this.rect!;
    if (floating.width === rect.w && floating.height === rect.h) return floating;
    const canvas = createCanvas(rect.w, rect.h);
    const ctx = context2d(canvas);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(floating, 0, 0, rect.w, rect.h);
    return canvas;
  }

  /**
   * O que é mostrado e aplicado: com "seleção transparente", os pixels da cor
   * secundária ficam transparentes.
   */
  private display(): HTMLCanvasElement {
    const floating = this.floating!;
    if (!this.app.settings.transparentSelection) return floating;
    const key = this.app.secondary;
    if (this.keyed?.key === key) return this.keyed.canvas;
    const canvas = createCanvas(floating.width, floating.height);
    const ctx = context2d(canvas);
    ctx.drawImage(floating, 0, 0);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const [r, g, b] = parseHex(key);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] === r && d[i + 1] === g && d[i + 2] === b) d[i + 3] = 0;
    }
    ctx.putImageData(img, 0, 0);
    this.keyed = { canvas, key };
    return canvas;
  }

  /** Recalcula a transparência (mudou a cor secundária ou a opção). */
  refreshKey() {
    this.keyed = null;
    this.render();
  }
}
