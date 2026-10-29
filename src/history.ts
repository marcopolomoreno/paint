import type { Rect } from "./geometry";
import type { Layer, LayerMeta, PaintDoc } from "./doc";

/**
 * Cada passo guarda só UM estado: o "outro lado" da mudança. Desfazer troca o
 * conteúdo guardado pelo que está no documento, e refazer troca de volta.
 * Assim a região alterada ocupa memória uma vez só, em vez de antes + depois.
 */
export type Entry =
  /** Pixels de uma região de uma camada. */
  | { kind: "region"; layer: Layer; x: number; y: number; data: ImageData }
  /** Canvas inteiros das camadas (girar, redimensionar, cortar): só referências, sem cópias. */
  | { kind: "canvases"; items: { layer: Layer; canvas: HTMLCanvasElement }[]; width: number; height: number }
  /** Lista de camadas, camada ativa, nomes e visibilidade. */
  | { kind: "structure"; layers: Layer[]; active: number; meta: LayerMeta[] }
  /** Vários passos que se desfazem juntos. */
  | { kind: "group"; entries: Entry[] };

function bytesOf(e: Entry): number {
  switch (e.kind) {
    case "region":
      return e.data.data.byteLength;
    case "canvases":
      return e.items.reduce((sum, i) => sum + i.canvas.width * i.canvas.height * 4, 0);
    case "structure":
      return 1024;
    case "group":
      return e.entries.reduce((sum, i) => sum + bytesOf(i), 0);
  }
}

/** Memória máxima do histórico; os passos mais antigos são descartados. */
const MAX_BYTES = 768 * 1024 * 1024;
const MAX_ENTRIES = 1000;

export class History {
  private undoStack: Entry[] = [];
  private redoStack: Entry[] = [];
  private bytes = 0;
  onChange: () => void = () => {};

  constructor(private doc: PaintDoc) {}

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  /** Registra uma mudança já feita em `rect`; `before` é o conteúdo anterior. */
  pushRegion(rect: Rect, before: ImageData, layer = this.doc.layer) {
    this.push({ kind: "region", layer, x: rect.x, y: rect.y, data: before });
  }

  push(entry: Entry) {
    for (const e of this.redoStack) this.bytes -= bytesOf(e);
    this.redoStack = [];
    this.undoStack.push(entry);
    this.bytes += bytesOf(entry);
    while (this.undoStack.length > 1 && (this.bytes > MAX_BYTES || this.undoStack.length > MAX_ENTRIES)) {
      this.bytes -= bytesOf(this.undoStack.shift()!);
    }
    this.onChange();
  }

  undo(): boolean {
    return this.move(this.undoStack, this.redoStack, true);
  }

  redo(): boolean {
    return this.move(this.redoStack, this.undoStack, false);
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.bytes = 0;
    this.onChange();
  }

  private move(from: Entry[], to: Entry[], undo: boolean): boolean {
    const entry = from.pop();
    if (!entry) return false;
    this.bytes -= bytesOf(entry);
    this.swap(entry, undo);
    this.bytes += bytesOf(entry);
    to.push(entry);
    this.onChange();
    return true;
  }

  private swap(entry: Entry, undo: boolean) {
    const doc = this.doc;
    switch (entry.kind) {
      case "region": {
        const { width, height } = entry.data;
        const ctx = entry.layer.ctx;
        const current = ctx.getImageData(entry.x, entry.y, width, height);
        ctx.putImageData(entry.data, entry.x, entry.y);
        entry.data = current;
        doc.changed(false, entry.layer);
        break;
      }
      case "canvases": {
        const current = entry.items.map(({ layer }) => ({ layer, canvas: layer.canvas }));
        const size = { width: doc.width, height: doc.height };
        doc.setCanvases(entry.items, entry.width, entry.height);
        entry.items = current;
        entry.width = size.width;
        entry.height = size.height;
        break;
      }
      case "structure": {
        const current = doc.structure();
        doc.restoreStructure(entry);
        Object.assign(entry, current);
        break;
      }
      case "group": {
        const entries = undo ? [...entry.entries].reverse() : entry.entries;
        for (const e of entries) this.swap(e, undo);
        break;
      }
    }
  }
}
