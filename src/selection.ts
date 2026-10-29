import type { App } from "./app";
import {
  boundsOf,
  centerOf,
  context2d,
  createCanvas,
  intersect,
  parseHex,
  pointInRect,
  rotateAround,
  rotatedBounds,
  rotatedCorners,
  snapRect,
  union,
  type Point,
  type Rect,
} from "./geometry";
import { TransformBox, unrotate } from "./transform";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Seleção retangular ou livre. Enquanto está "parada" é só uma área marcada;
 * ao mover, redimensionar, girar ou colar, os pixels vão para um canvas
 * flutuante, que só é aplicado à imagem (num único passo de desfazer) quando a
 * seleção é solta.
 */
export class Selection {
  /** Posição e tamanho atuais (antes do giro), em pixels da imagem. */
  rect: Rect | null = null;
  /** Giro livre dos pixels flutuantes em torno do centro de `rect`, em radianos. */
  angle = 0;
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
  private readonly box: TransformBox;
  private draft: Rect | Point[] | null = null;

  constructor(private app: App) {
    this.floatEl.className = "floating";
    this.svg.classList.add("sel-outline");
    this.outline.classList.add("sel-line");
    this.outlineDash.classList.add("sel-ants");
    this.svg.append(this.outline, this.outlineDash);
    app.view.overlay.append(this.floatEl, this.svg);
    this.box = new TransformBox(app.view.overlay, false);
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
    this.angle = 0;
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
    if (!r || !pointInRect(unrotate(p, r, this.angle), r)) return false;
    if (!this.path || this.floating) return true;
    const ctx = this.app.view.scratchCtx;
    return ctx.isPointInPath(this.pathObject(), p.x, p.y);
  }

  /** Esquece a seleção, aplicando antes os pixels flutuantes. */
  clear() {
    if (this.floating) this.drop();
    this.rect = null;
    this.angle = 0;
    this.path = null;
    this.pathRect = null;
    this.render();
  }

  /** Retângulo de cantos inteiros que contém a seleção (já girada). */
  bounds(): Rect | null {
    return this.rect && rotatedBounds(this.rect, this.angle);
  }

  /** Aplica os pixels flutuantes na imagem e encerra a seleção. */
  drop() {
    const floating = this.floating;
    const rect = this.rect;
    if (!floating || !rect) {
      this.rect = null;
      this.angle = 0;
      this.path = null;
      this.render();
      return;
    }
    const doc = this.app.doc;
    const lifted = this.lifted;
    const dest = doc.clip(this.bounds()!);
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
      this.drawFloating(ctx, this.display());
      ctx.restore();
      doc.history.pushRegion(area, before);
      doc.changed();
    }
    this.floating = null;
    this.lifted = null;
    this.keyed = null;
    this.rect = null;
    this.angle = 0;
    this.path = null;
    this.render();
  }

  /** Desenha `source` esticado até `rect` e girado em torno do centro, em coordenadas da imagem. */
  private drawFloating(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement) {
    const r = this.rect!;
    const c = centerOf(r);
    ctx.imageSmoothingQuality = "high";
    ctx.translate(c.x, c.y);
    ctx.rotate(this.angle);
    ctx.drawImage(source, -r.w / 2, -r.h / 2, r.w, r.h);
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
      this.clearArea(doc.ctx, rect);
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
    this.angle = 0;
    this.rect = { x: at.x, y: at.y, w: source.width, h: source.height };
    this.render();
  }

  moveTo(x: number, y: number) {
    if (!this.rect) return;
    // Girada, a posição não precisa cair em pixel inteiro.
    const snap = this.angle ? (n: number) => n : Math.round;
    this.rect = { ...this.rect, x: snap(x), y: snap(y) };
    this.render();
  }

  resizeTo(rect: Rect) {
    this.rect = this.angle ? rect : snapRect(rect);
    this.render();
  }

  /** Gira os pixels selecionados (levantando-os, se preciso). */
  rotateTo(angle: number) {
    if (!this.rect) return;
    this.lift();
    if (!angle) this.rect = snapRect(this.rect);
    this.angle = angle;
    this.render();
  }

  /** Aplica uma transformação (girar, inverter…) aos pixels selecionados. */
  transform(fn: (source: HTMLCanvasElement) => HTMLCanvasElement) {
    if (!this.rect) return;
    this.lift();
    this.bakeRotation();
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
      doc.edit(rect, (ctx) => this.clearArea(ctx, rect));
    }
    this.rect = null;
    this.angle = 0;
    this.path = null;
    this.render();
  }

  /**
   * Apaga a área selecionada: no fundo preenche com a cor secundária (como no
   * Paint); nas outras camadas deixa transparente.
   */
  private clearArea(ctx: CanvasRenderingContext2D, rect: Rect) {
    if (this.app.doc.onBackground) {
      ctx.fillStyle = this.app.secondary;
    } else {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "#000";
    }
    if (this.path) ctx.fill(this.pathObject());
    else ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  /** Pixels selecionados, como aparecem na tela (para copiar). */
  pixels(): ImageData | null {
    const rect = this.rect;
    if (!rect) return null;
    if (this.floating) {
      const b = this.bounds()!;
      const ctx = context2d(createCanvas(b.w, b.h));
      ctx.translate(-b.x, -b.y);
      this.drawFloating(ctx, this.display());
      return ctx.getImageData(0, 0, b.w, b.h);
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
        transform: this.angle ? `rotate(${this.angle}rad)` : "",
      });
    }

    const d = this.outlinePath(zoom);
    this.outline.setAttribute("d", d);
    this.outlineDash.setAttribute("d", d);
    this.svg.style.display = d ? "" : "none";

    if (rect && !this.draft) this.box.showBox(rect, this.angle, zoom);
    else this.box.hide();
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
    if (this.angle) return poly(rotatedCorners(this.rect, this.angle));
    return box(this.rect);
  }

  /** Contorno livre levado para a posição, o tamanho e o giro atuais. */
  private mapPath(): Point[] {
    const from = this.pathRect!;
    const to = this.rect!;
    const sx = to.w / from.w;
    const sy = to.h / from.h;
    const c = centerOf(to);
    return this.path!.map((p) =>
      rotateAround({ x: to.x + (p.x - from.x) * sx, y: to.y + (p.y - from.y) * sy }, c, this.angle),
    );
  }

  private pathObject(): Path2D {
    const path = new Path2D();
    this.path!.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)));
    path.closePath();
    return path;
  }

  /** Passa o giro para os pixels: a seleção vira o retângulo que contém a imagem girada. */
  private bakeRotation() {
    if (!this.angle || !this.floating) return;
    const b = this.bounds()!;
    const ctx = context2d(createCanvas(b.w, b.h));
    ctx.translate(-b.x, -b.y);
    this.drawFloating(ctx, this.floating);
    this.floating = ctx.canvas;
    this.keyed = null;
    this.path = null;
    this.rect = b;
    this.angle = 0;
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
