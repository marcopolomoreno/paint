import { centerOf, rotateAround, rotatedCorners, type Point, type Rect } from "./geometry";

const SVG_NS = "http://www.w3.org/2000/svg";
export const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
export type Handle = (typeof HANDLES)[number];
/** Nome da alça de girar (acima do lado de cima). */
export const ROTATE = "rotate";
/** Distância, em pixels de tela, entre o lado de cima e a alça de girar. */
const ROTATE_GAP = 24;
const CURSORS = ["ns-resize", "nesw-resize", "ew-resize", "nwse-resize"];
/** Direção de cada alça em oitavos de volta, a partir de cima. */
const HANDLE_DIR: Record<Handle, number> = { n: 0, ne: 1, e: 2, se: 3, s: 4, sw: 5, w: 6, nw: 7 };

const ROTATE_ICON =
  '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="8.5"/><path d="M13.5 8.5a4 4 0 1 0-.2 3.6"/><path d="M14 5.5v3h-3"/><circle cx="10" cy="10" r=".9" fill="currentColor" stroke="none"/></svg>';

/** Ponto da alça no retângulo sem giro. */
function handlePoint(r: Rect, h: Handle): Point {
  return {
    x: h.includes("w") ? r.x : h.includes("e") ? r.x + r.w : r.x + r.w / 2,
    y: h.includes("n") ? r.y : h.includes("s") ? r.y + r.h : r.y + r.h / 2,
  };
}

/** Novo retângulo ao arrastar uma alça (sem giro). Shift mantém a proporção. */
export function resizeRect(r: Rect, handle: Handle, dx: number, dy: number, keepRatio: boolean): Rect {
  let left = r.x;
  let top = r.y;
  let right = r.x + r.w;
  let bottom = r.y + r.h;
  if (handle.includes("w")) left += dx;
  if (handle.includes("e")) right += dx;
  if (handle.includes("n")) top += dy;
  if (handle.includes("s")) bottom += dy;
  let w = Math.max(1, Math.abs(right - left));
  let h = Math.max(1, Math.abs(bottom - top));
  if (keepRatio && handle.length === 2 && r.w > 0 && r.h > 0) {
    const scale = Math.max(w / r.w, h / r.h);
    w = Math.max(1, r.w * scale);
    h = Math.max(1, r.h * scale);
    if (handle.includes("w")) left = right - w;
    if (handle.includes("n")) top = bottom - h;
  }
  return { x: Math.min(left, right), y: Math.min(top, bottom), w, h };
}

/**
 * Novo retângulo (antes do giro) ao arrastar uma alça de um retângulo girado
 * de `start` até `p`: o lado oposto fica parado na tela.
 */
export function resizeRotated(origin: Rect, angle: number, handle: Handle, start: Point, p: Point, keepRatio: boolean): Rect {
  const d = rotateAround({ x: p.x - start.x, y: p.y - start.y }, { x: 0, y: 0 }, -angle);
  const r = resizeRect(origin, handle, d.x, d.y, keepRatio);
  if (!angle) return r;
  const c = rotateAround(centerOf(r), centerOf(origin), angle);
  return { x: c.x - r.w / 2, y: c.y - r.h / 2, w: r.w, h: r.h };
}

/** Ângulo ao arrastar a alça de girar em torno de `c`. Shift gira de 15 em 15 graus. */
export function dragAngle(c: Point, start: Point, p: Point, angle0: number, snap: boolean): number {
  let a = angle0 + Math.atan2(p.y - c.y, p.x - c.x) - Math.atan2(start.y - c.y, start.x - c.x);
  if (snap) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
  a = Math.atan2(Math.sin(a), Math.cos(a));
  return Math.abs(a) < 1e-6 ? 0 : a;
}

/** `p` no sistema do retângulo antes do giro. */
export function unrotate(p: Point, r: Rect, angle: number): Point {
  return angle ? rotateAround(p, centerOf(r), -angle) : p;
}

/**
 * Alças de transformação na camada de cima da área de desenho: as oito de
 * redimensionar, a de girar e, opcionalmente, o contorno tracejado. Também
 * serve para as duas pontas de uma linha. Cada alça tem `data-sel-handle`,
 * que a View repassa às ferramentas.
 */
export class TransformBox {
  private readonly handles: HTMLElement[];
  private readonly rotateEl = document.createElement("div");
  private readonly ends: HTMLElement[];
  private readonly svg = document.createElementNS(SVG_NS, "svg");
  private readonly line = document.createElementNS(SVG_NS, "path");
  private readonly dash = document.createElementNS(SVG_NS, "path");

  constructor(overlay: HTMLElement, private withOutline: boolean) {
    this.handles = HANDLES.map((h) => this.handle(`sel-handle ${h}`, h));
    this.ends = [0, 1].map((i) => this.handle("sel-handle end", `p${i}`));
    this.rotateEl.className = "sel-rotate";
    this.rotateEl.dataset.selHandle = ROTATE;
    this.rotateEl.title = "Girar (Shift: de 15 em 15°)";
    this.rotateEl.innerHTML = ROTATE_ICON;
    this.svg.classList.add("sel-outline");
    this.line.classList.add("sel-line");
    this.dash.classList.add("sel-ants");
    this.svg.append(this.line, this.dash);
    overlay.append(this.svg, ...this.handles, ...this.ends, this.rotateEl);
    this.hide();
  }

  private handle(className: string, name: string) {
    const el = document.createElement("div");
    el.className = className;
    el.dataset.selHandle = name;
    return el;
  }

  /** Alças de um retângulo (em pixels da imagem) girado `angle` radianos em torno do centro. */
  showBox(r: Rect, angle: number, zoom: number) {
    const c = centerOf(r);
    const at = (el: HTMLElement, p: Point) => {
      el.hidden = false;
      el.style.left = `${p.x * zoom}px`;
      el.style.top = `${p.y * zoom}px`;
    };
    const turn = Math.round(angle / (Math.PI / 4));
    HANDLES.forEach((h, i) => {
      const el = this.handles[i];
      at(el, rotateAround(handlePoint(r, h), c, angle));
      el.style.cursor = CURSORS[(((HANDLE_DIR[h] + turn) % 8) + 8) % 4];
    });
    const top = rotateAround(handlePoint(r, "n"), c, angle);
    const gap = ROTATE_GAP / zoom;
    at(this.rotateEl, { x: top.x + Math.sin(angle) * gap, y: top.y - Math.cos(angle) * gap });
    for (const el of this.ends) el.hidden = true;

    this.svg.style.display = this.withOutline ? "" : "none";
    if (this.withOutline) {
      const f = (n: number) => (Math.round(n * zoom) + 0.5).toFixed(1);
      const d = rotatedCorners(r, angle).map((p, i) => `${i ? "L" : "M"}${f(p.x)} ${f(p.y)}`).join("") + "Z";
      this.line.setAttribute("d", d);
      this.dash.setAttribute("d", d);
    }
  }

  /** Alças nas pontas de uma linha. */
  showEnds(points: [Point, Point], zoom: number) {
    this.hide();
    points.forEach((p, i) => {
      const el = this.ends[i];
      el.hidden = false;
      el.style.left = `${p.x * zoom}px`;
      el.style.top = `${p.y * zoom}px`;
    });
  }

  hide() {
    for (const el of [...this.handles, ...this.ends, this.rotateEl]) el.hidden = true;
    this.svg.style.display = "none";
  }
}
