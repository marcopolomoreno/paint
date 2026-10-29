import { context2d, createCanvas, intersect, snapRect, type Rect } from "./geometry";
import { History, type Entry } from "./history";

export interface Layer {
  readonly id: string;
  name: string;
  visible: boolean;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Aumenta a cada mudança de pixels (miniaturas e sessão comparam com isto). */
  rev: number;
}

export type LayerMeta = Pick<Layer, "name" | "visible">;

let nextLayerId = 1;
const newLayerId = () => `l${Date.now().toString(36)}${(nextLayerId++).toString(36)}`;

export function makeLayer(name: string, canvas: HTMLCanvasElement, id = newLayerId()): Layer {
  return { id, name, visible: true, canvas, ctx: context2d(canvas), rev: 1 };
}

/**
 * A imagem sendo editada: uma pilha de camadas (a primeira é o fundo), cada
 * uma com um canvas na resolução real da imagem. Os mesmos elementos são
 * mostrados na tela, escalados por CSS pelo zoom. `canvas` e `ctx` são os da
 * camada ativa, onde as ferramentas desenham.
 */
export class PaintDoc {
  layers: Layer[] = [];
  activeIndex = 0;
  width = 1;
  height = 1;
  readonly history = new History(this);
  path: string | null = null;
  dirty = false;
  /** Chamado quando os pixels mudam; `resized` quando muda o tamanho. */
  onChange: (resized: boolean) => void = () => {};
  /** Chamado quando a lista de camadas, a ativa, nomes ou visibilidade mudam. */
  onLayersChange: () => void = () => {};

  get layer(): Layer {
    return this.layers[this.activeIndex];
  }

  get canvas() {
    return this.layer.canvas;
  }

  get ctx() {
    return this.layer.ctx;
  }

  /** A camada ativa é o fundo (borracha e buracos usam a cor secundária, não transparência). */
  get onBackground() {
    return this.activeIndex === 0;
  }

  get bounds(): Rect {
    return { x: 0, y: 0, w: this.width, h: this.height };
  }

  /** Canvas vazio do tamanho da imagem. */
  blank(): HTMLCanvasElement {
    return createCanvas(this.width, this.height);
  }

  /** Imagem nova com uma só camada, preenchida com uma cor. */
  reset(width: number, height: number, color: string) {
    const canvas = createCanvas(width, height);
    const ctx = context2d(canvas);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
    this.load([makeLayer("Plano de fundo", canvas)], 0);
    this.path = null;
    this.dirty = false;
  }

  /** Troca o documento inteiro (abrir arquivo, restaurar sessão). Limpa o histórico. */
  load(layers: Layer[], active: number) {
    this.layers = layers;
    this.activeIndex = Math.min(Math.max(0, active), layers.length - 1);
    this.width = layers[0].canvas.width;
    this.height = layers[0].canvas.height;
    this.history.clear();
    this.onLayersChange();
    this.onChange(true);
  }

  /** As camadas visíveis juntas, como a imagem é salva. */
  composite(): HTMLCanvasElement {
    const out = this.blank();
    const ctx = context2d(out);
    for (const layer of this.layers) if (layer.visible) ctx.drawImage(layer.canvas, 0, 0);
    return out;
  }

  /** Cor de um pixel na imagem como ela aparece (todas as camadas visíveis). */
  compositePixel(x: number, y: number): Uint8ClampedArray {
    const ctx = context2d(createCanvas(1, 1));
    for (const layer of this.layers) if (layer.visible) ctx.drawImage(layer.canvas, -x, -y);
    return ctx.getImageData(0, 0, 1, 1).data;
  }

  /** Parte de `rect` que fica dentro da imagem, com cantos inteiros. */
  clip(rect: Rect): Rect | null {
    return intersect(snapRect(rect), this.bounds);
  }

  /**
   * Faz uma alteração restrita a `rect` na camada ativa, registrando o passo
   * de desfazer. Nada fora de `rect` pode mudar.
   */
  edit(rect: Rect, draw: (ctx: CanvasRenderingContext2D, area: Rect) => void) {
    const area = this.clip(rect);
    if (!area) return;
    const before = this.ctx.getImageData(area.x, area.y, area.w, area.h);
    this.ctx.save();
    draw(this.ctx, area);
    this.ctx.restore();
    this.history.pushRegion(area, before);
    this.changed();
  }

  /**
   * Substitui o canvas de cada camada pelo resultado de `fn` (girar,
   * redimensionar…), registrando um passo de desfazer.
   */
  transformAll(fn: (source: HTMLCanvasElement, layer: Layer, index: number) => HTMLCanvasElement) {
    const before = this.layers.map((layer) => ({ layer, canvas: layer.canvas }));
    const results = this.layers.map((layer, i) => ({ layer, canvas: fn(layer.canvas, layer, i) }));
    this.history.push({ kind: "canvases", items: before, width: this.width, height: this.height });
    this.setCanvases(results, results[0].canvas.width, results[0].canvas.height);
  }

  /** Troca os canvas das camadas indicadas (usado pelo histórico). */
  setCanvases(items: { layer: Layer; canvas: HTMLCanvasElement }[], width: number, height: number) {
    for (const { layer, canvas } of items) {
      layer.canvas = canvas;
      layer.ctx = context2d(canvas);
      layer.rev++;
    }
    const resized = width !== this.width || height !== this.height;
    this.width = width;
    this.height = height;
    this.onLayersChange();
    this.changed(resized);
  }

  // ------------------------------------------------------------------------
  // Camadas
  // ------------------------------------------------------------------------

  structure(): Extract<Entry, { kind: "structure" }> {
    return {
      kind: "structure",
      layers: [...this.layers],
      active: this.activeIndex,
      meta: this.layers.map(({ name, visible }) => ({ name, visible })),
    };
  }

  restoreStructure(state: { layers: Layer[]; active: number; meta: LayerMeta[] }) {
    this.layers = [...state.layers];
    this.layers.forEach((layer, i) => Object.assign(layer, state.meta[i]));
    this.activeIndex = state.active;
    this.onLayersChange();
    this.changed();
  }

  /** Muda a lista de camadas registrando um passo de desfazer. */
  private restructure(change: () => void) {
    const before = this.structure();
    change();
    this.history.push(before);
    this.onLayersChange();
    this.changed();
  }

  setActive(index: number) {
    if (index === this.activeIndex || !this.layers[index]) return;
    this.activeIndex = index;
    this.onLayersChange();
  }

  setVisible(index: number, visible: boolean) {
    const layer = this.layers[index];
    if (!layer || layer.visible === visible) return;
    // Mostrar/ocultar não entra no histórico, como no Paint, mas muda a imagem salva.
    layer.visible = visible;
    this.onLayersChange();
    this.changed();
  }

  rename(index: number, name: string) {
    const layer = this.layers[index];
    if (!layer || !name.trim() || layer.name === name) return;
    this.restructure(() => (layer.name = name.trim()));
  }

  addLayer() {
    const number = this.layers.length + 1;
    this.restructure(() => {
      this.layers.splice(this.activeIndex + 1, 0, makeLayer(`Camada ${number}`, this.blank()));
      this.activeIndex++;
    });
  }

  duplicateLayer(index = this.activeIndex) {
    const source = this.layers[index];
    const canvas = this.blank();
    context2d(canvas).drawImage(source.canvas, 0, 0);
    const copy = makeLayer(`${source.name} (cópia)`, canvas);
    copy.visible = source.visible;
    this.restructure(() => {
      this.layers.splice(index + 1, 0, copy);
      this.activeIndex = index + 1;
    });
  }

  deleteLayer(index = this.activeIndex) {
    if (this.layers.length < 2) return;
    this.restructure(() => {
      this.layers.splice(index, 1);
      this.activeIndex = Math.min(this.activeIndex, this.layers.length - 1);
      if (index < this.activeIndex) this.activeIndex--;
    });
  }

  /** Move uma camada para outra posição (0 = fundo). */
  moveLayer(from: number, to: number) {
    to = Math.min(Math.max(0, to), this.layers.length - 1);
    if (from === to) return;
    const active = this.layers[this.activeIndex];
    this.restructure(() => {
      const [layer] = this.layers.splice(from, 1);
      this.layers.splice(to, 0, layer);
      this.activeIndex = this.layers.indexOf(active);
    });
  }

  /** Junta a camada com a de baixo (um único passo de desfazer). */
  mergeDown(index = this.activeIndex) {
    if (index < 1) return;
    const upper = this.layers[index];
    const lower = this.layers[index - 1];
    const before = lower.ctx.getImageData(0, 0, this.width, this.height);
    const structure = this.structure();
    if (upper.visible) lower.ctx.drawImage(upper.canvas, 0, 0);
    lower.rev++;
    this.layers.splice(index, 1);
    this.activeIndex = index - 1;
    this.history.push({
      kind: "group",
      entries: [{ kind: "region", layer: lower, x: 0, y: 0, data: before }, structure],
    });
    this.onLayersChange();
    this.changed();
  }

  /** Junta todas as camadas visíveis numa só. */
  flatten() {
    if (this.layers.length < 2) return;
    const merged = makeLayer(this.layers[0].name, this.composite());
    this.restructure(() => {
      this.layers = [merged];
      this.activeIndex = 0;
    });
  }

  /** Marca o documento como alterado; sem `layer`, todas as camadas contam como mudadas. */
  changed(resized = false, layer?: Layer) {
    this.dirty = true;
    if (layer) layer.rev++;
    else if (resized) this.layers.forEach((l) => l.rev++);
    else this.layer.rev++;
    this.onChange(resized);
  }
}
