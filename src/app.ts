import { getCurrentWindow } from "@tauri-apps/api/window";
import { backend } from "./backend";
import { TEXT_EDIT_COMMANDS, type CommandId, type ToggleSetting } from "./commands";
import { PaintDoc, makeLayer, type Layer } from "./doc";
import type { DocMode, Session } from "./session";
import { askOpenPath, askSavePath, fileName, isImagePath, loadImage, saveImage } from "./files";
import { clamp, context2d, createCanvas, type Rect } from "./geometry";
import * as ops from "./imageops";
import { APP_NAME, DEFAULT_HEIGHT, DEFAULT_WIDTH, MAX_SIDE } from "./platform";
import { Selection } from "./selection";
import { BrushTool, type BrushKind } from "./tools/brush";
import { FillTool, PickerTool } from "./tools/fill";
import { PencilTool } from "./tools/pencil";
import { SelectTool, type SelectMode } from "./tools/select";
import { ShapeTool, type ShapeKind } from "./tools/shapes";
import { TextTool, type TextOptions } from "./tools/text";
import type { Tool, ToolId } from "./tools/tool";
import { ZoomTool } from "./tools/zoom";
import { askToSave, showBusy, showMessage } from "./ui/dialogs";
import { imageSizeDialog, resizeDialog } from "./ui/imagedialogs";
import type { StatusBar } from "./ui/statusbar";
import { Rulers, stepFor } from "./ui/rulers";
import { View, type PointerInfo } from "./view";

export const inTauri = "__TAURI_INTERNALS__" in window;

export type SizeKey = "pencil" | "brush" | "eraser" | "shape";

export interface Options {
  selectMode: SelectMode;
  brush: BrushKind;
  shape: ShapeKind;
  outline: "solid" | "none";
  fill: "solid" | "none";
  sizes: Record<SizeKey, number>;
  text: TextOptions;
}

export type CommandSource = "menu" | "key" | "ui";

export class App {
  readonly doc = new PaintDoc();
  readonly view = new View(this);
  readonly sel = new Selection(this);
  // Antes das ferramentas, que se inscrevem nelas.
  private uiListeners: (() => void)[] = [];
  private pixelListeners: (() => void)[] = [];
  status!: StatusBar;

  primary = "#000000";
  secondary = "#ffffff";
  /** Qual cor os cliques na paleta mudam. */
  activeSlot: 1 | 2 = 1;
  customColors: string[] = [];
  settings: Record<ToggleSetting, boolean> = {
    statusBar: true,
    transparentSelection: false,
    layersPanel: true,
    rulers: false,
    grid: false,
  };
  rulers?: Rulers;
  session?: Session;
  opts: Options = {
    selectMode: "rect",
    brush: "round",
    shape: "rect",
    outline: "solid",
    fill: "none",
    sizes: { pencil: 1, brush: 5, eraser: 10, shape: 3 },
    text: { font: "Arial", size: 18, bold: false, italic: false, underline: false, opaque: false },
  };

  toolId: ToolId = "pencil";
  private previousTool: ToolId = "pencil";
  readonly text = new TextTool(this);
  readonly shapes = new ShapeTool(this);
  private readonly tools: Record<ToolId, Tool> = {
    select: new SelectTool(this),
    pencil: new PencilTool(this, false),
    brush: new BrushTool(this),
    eraser: new PencilTool(this, true),
    fill: new FillTool(this),
    picker: new PickerTool(this),
    text: this.text,
    shape: this.shapes,
    zoom: new ZoomTool(this),
  };
  private readonly brushCursor = document.createElement("div");
  private lastTitle = "";
  private lastCommand = { id: "", source: "", time: 0 };
  /** Usado pelo menu nativo para atualizar as marcas de opção. */
  onSettingsChange: () => void = () => {};

  constructor() {
    this.brushCursor.className = "brush-cursor";
    this.brushCursor.hidden = true;
    this.view.overlay.append(this.brushCursor);
    this.doc.onChange = (resized) => {
      if (resized) this.view.layout();
      this.updateTitle();
      this.status?.update();
      for (const listener of this.pixelListeners) listener();
    };
    this.doc.onLayersChange = () => {
      this.view.syncLayers();
      this.notify();
    };
    this.doc.history.onChange = () => this.notify();
    this.view.onCursor = (p) => {
      this.status?.setCursor(p);
      this.rulers?.setCursor(p);
      this.updateBrushCursor(p);
    };
    this.view.onLayout = () => {
      this.updateGrid();
      this.rulers?.schedule();
    };
    this.view.onZoomChange = () => {
      this.status?.update();
      this.notify();
    };
  }

  get tool(): Tool {
    return this.tools[this.toolId];
  }

  /** Avisa a interface (barra de ferramentas, cores) de que algo mudou. */
  onUi(listener: () => void) {
    this.uiListeners.push(listener);
  }

  notify() {
    for (const listener of this.uiListeners) listener();
  }

  /** Avisa quando os pixels mudam (miniaturas das camadas, sessão). */
  onPixels(listener: () => void) {
    this.pixelListeners.push(listener);
  }

  /** Começa com uma imagem em branco. */
  init() {
    this.doc.reset(DEFAULT_WIDTH, DEFAULT_HEIGHT, "#ffffff");
    this.view.layout();
    this.setTool("pencil");
    this.fitWhenReady();
  }

  /**
   * Ajusta o zoom à janela. A área de desenho só tem tamanho depois do
   * primeiro layout; até lá, espera.
   */
  private fitWhenReady() {
    if (this.view.viewport.clientWidth >= 100) {
      this.view.setZoom(this.view.fitZoom());
      return;
    }
    const observer = new ResizeObserver(() => {
      if (this.view.viewport.clientWidth < 100) return;
      observer.disconnect();
      this.view.setZoom(this.view.fitZoom());
    });
    observer.observe(this.view.viewport);
  }

  /** Aplica na interface as configurações restauradas da sessão. */
  applySettings() {
    const id = this.toolId;
    this.toolId = "pencil";
    this.setTool(id in this.tools ? id : "pencil");
    this.status.setVisible(this.settings.statusBar);
    this.rulers?.setVisible(this.settings.rulers);
    this.updateGrid();
    this.sel.refreshKey();
    this.onSettingsChange();
    this.notify();
  }

  /** Imagem restaurada da sessão. */
  restoreDocument(layers: Layer[], active: number, path: string | null, dirty: boolean) {
    this.discardPending();
    this.doc.load(layers, active);
    this.doc.path = path;
    this.doc.dirty = dirty;
    this.updateTitle();
    this.fitWhenReady();
  }

  /** Reabre o arquivo da sessão anterior; se ele sumiu, fica a imagem em branco. */
  async reopen(path: string) {
    try {
      const canvas = await loadImage(path);
      this.restoreDocument([makeLayer("Plano de fundo", canvas)], 0, path, false);
    } catch (err) {
      console.warn("Arquivo da sessão anterior não abriu", err);
    }
  }

  // ------------------------------------------------------------------------
  // Ferramentas e cores
  // ------------------------------------------------------------------------

  setTool(id: ToolId) {
    if (id === "picker" && this.toolId !== "picker") this.previousTool = this.toolId;
    if (id !== this.toolId) {
      this.tool.commit?.();
      if (this.toolId === "select") this.sel.drop();
    }
    this.toolId = id;
    this.view.setCursor(this.tool.cursor);
    this.brushCursor.hidden = true;
    this.notify();
  }

  restorePreviousTool() {
    this.setTool(this.previousTool);
  }

  colorFor(button: number) {
    return button === 2 ? this.secondary : this.primary;
  }

  setColor(slot: 1 | 2, color: string) {
    if (slot === 1) this.primary = color;
    else {
      this.secondary = color;
      if (this.settings.transparentSelection) this.sel.refreshKey();
    }
    this.text.layout();
    this.notify();
  }

  addCustomColor(color: string) {
    this.customColors = [color, ...this.customColors.filter((c) => c !== color)].slice(0, 10);
    this.notify();
  }

  setOption<K extends keyof Options>(key: K, value: Options[K]) {
    this.opts[key] = value;
    this.text.layout();
    this.notify();
  }

  /** Qual tamanho a barra "Tamanho" controla na ferramenta atual. */
  get sizeKey(): SizeKey {
    const id = this.toolId;
    return id === "pencil" || id === "eraser" || id === "shape" ? id : "brush";
  }

  setSize(size: number) {
    this.opts.sizes[this.sizeKey] = clamp(Math.round(size), 1, 100);
    this.notify();
  }

  // ------------------------------------------------------------------------
  // Ponteiro (chamado pela View)
  // ------------------------------------------------------------------------

  pointerDown(p: PointerInfo) {
    this.tool.down(p);
    this.updateBrushCursor(p);
  }

  pointerMove(p: PointerInfo) {
    this.tool.move(p);
    this.updateBrushCursor(p);
  }

  pointerUp(p: PointerInfo) {
    // A posição de soltar conta como último movimento (eventos rápidos podem pular movimentos).
    this.tool.move(p);
    this.tool.up(p);
  }

  pointerHover(p: PointerInfo) {
    if (this.tool.hover) this.tool.hover(p);
    else this.view.setCursor(this.tool.cursor);
  }

  pointerCancel() {
    this.tool.cancel?.();
  }

  /** Aplica o rascunho na imagem (um passo de desfazer). */
  commitScratch(rect: Rect, alpha = 1) {
    const scratch = this.view.scratch;
    this.doc.edit(rect, (ctx, area) => {
      ctx.globalAlpha = alpha;
      ctx.drawImage(scratch, area.x, area.y, area.w, area.h, area.x, area.y, area.w, area.h);
    });
    this.view.clearScratch();
  }

  /** Conclui o que estiver pendente (texto sendo digitado, forma recém-desenhada, seleção flutuante). */
  commitPending() {
    this.commitDrawing();
    if (this.sel.isFloating) this.sel.drop();
  }

  /** Aplica o texto sendo digitado e a forma recém-desenhada. */
  commitDrawing() {
    this.text.commit();
    this.shapes.commit();
  }

  /** Há algo ainda não aplicado à imagem (desfazer o descarta). */
  get hasPending() {
    return this.sel.isFloating || this.shapes.isPending;
  }

  layoutOverlay() {
    this.text.layout();
    this.shapes.layout();
  }

  /** Troca a camada ativa (a seleção flutuante é aplicada antes, na camada dela). */
  setActiveLayer(index: number) {
    if (index === this.doc.activeIndex) return;
    this.commitPending();
    this.doc.setActive(index);
  }

  moveLayer(from: number, to: number) {
    this.commitPending();
    this.doc.moveLayer(from, to);
  }

  /** Linhas de grade: espaçamento em pixels da imagem que fique legível no zoom atual. */
  updateGrid() {
    const grid = this.view.grid;
    const step = stepFor(this.view.zoom, 8);
    grid.hidden = !this.settings.grid;
    grid.style.backgroundSize = `${step * this.view.zoom}px ${step * this.view.zoom}px`;
  }

  private updateBrushCursor(p: { x: number; y: number } | null) {
    const outline = p && this.tool.outline?.();
    const el = this.brushCursor;
    el.hidden = !outline;
    if (!outline || !p) return;
    const zoom = this.view.zoom;
    const size = outline.size * zoom;
    // Quadrados ficam alinhados aos pixels, como o carimbo da borracha.
    const offset = Math.floor((outline.size - 1) / 2);
    const x = outline.round ? p.x * zoom - size / 2 : (Math.floor(p.x) - offset) * zoom;
    const y = outline.round ? p.y * zoom - size / 2 : (Math.floor(p.y) - offset) * zoom;
    el.classList.toggle("round", outline.round);
    Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${size}px`, height: `${size}px` });
  }

  // ------------------------------------------------------------------------
  // Comandos (menus, atalhos e botões)
  // ------------------------------------------------------------------------

  async run(id: CommandId, source: CommandSource = "ui") {
    // No Mac o mesmo atalho chega pelo menu nativo e pelo teclado.
    const now = performance.now();
    const last = this.lastCommand;
    if (source !== "ui" && last.id === id && last.source !== source && now - last.time < 120) return;
    this.lastCommand = { id, source, time: now };

    const field = focusedTextField();
    if (field && TEXT_EDIT_COMMANDS.has(id)) return this.textFieldCommand(field, id);

    try {
      await this.execute(id);
    } catch (err) {
      console.error(err);
      await showMessage(APP_NAME, String(err instanceof Error ? err.message : err));
    }
  }

  private async execute(id: CommandId) {
    switch (id) {
      case "new":
        return this.newImage();
      case "open":
        return this.open();
      case "save":
        return void (await this.save());
      case "saveAs":
        return void (await this.save(true));
      case "properties":
        return this.imageProperties();
      case "quit":
        return this.quit();
      case "undo":
        this.text.cancel();
        this.commitPending();
        this.doc.history.undo();
        return;
      case "redo":
        this.text.cancel();
        this.commitPending();
        this.doc.history.redo();
        return;
      case "copy":
        return this.copy();
      case "cut":
        if (await this.copy()) this.sel.deleteContents();
        return;
      case "paste":
        return this.paste();
      case "delete":
        return this.sel.deleteContents();
      case "selectAll":
        this.commitPending();
        this.setTool("select");
        this.sel.set(this.doc.bounds);
        return;
      case "toggleTransparent":
        return this.toggle("transparentSelection");
      case "crop":
        return this.crop();
      case "resize":
        return this.resizeImage();
      case "rotateRight":
        return this.imageOp((c) => ops.rotate(c, 1));
      case "rotateLeft":
        return this.imageOp((c) => ops.rotate(c, 3));
      case "rotate180":
        return this.imageOp((c) => ops.rotate(c, 2));
      case "flipH":
        return this.imageOp((c) => ops.flip(c, true));
      case "flipV":
        return this.imageOp((c) => ops.flip(c, false));
      case "invertColors":
        return this.imageOp(ops.invertColors);
      case "zoomIn":
        return this.view.zoomStep(1);
      case "zoomOut":
        return this.view.zoomStep(-1);
      case "zoomReset":
        return this.view.setZoom(1);
      case "zoomFit":
        return this.view.zoomFit();
      case "toggleStatusBar":
        return this.toggle("statusBar");
      case "toggleRulers":
        return this.toggle("rulers");
      case "toggleGrid":
        return this.toggle("grid");
      case "toggleLayers":
        return this.toggle("layersPanel");
      case "removeBackground":
        return this.removeBackground();
      case "newLayer":
        this.commitPending();
        this.doc.addLayer();
        if (!this.settings.layersPanel) this.toggle("layersPanel");
        return;
      case "duplicateLayer":
        this.commitPending();
        return this.doc.duplicateLayer();
      case "deleteLayer":
        this.commitPending();
        return this.doc.deleteLayer();
      case "mergeDown":
        this.commitPending();
        return this.doc.mergeDown();
      case "flattenImage":
        this.commitPending();
        return this.doc.flatten();
      case "layerUp":
        return this.moveLayer(this.doc.activeIndex, this.doc.activeIndex + 1);
      case "layerDown":
        return this.moveLayer(this.doc.activeIndex, this.doc.activeIndex - 1);
    }
  }

  toggle(setting: ToggleSetting) {
    this.settings[setting] = !this.settings[setting];
    if (setting === "transparentSelection") this.sel.refreshKey();
    if (setting === "statusBar") this.status.setVisible(this.settings.statusBar);
    if (setting === "rulers") this.rulers?.setVisible(this.settings.rulers);
    if (setting === "grid") this.updateGrid();
    this.onSettingsChange();
    this.notify();
  }

  /** Teclas que não são comandos de menu. Devolve true se tratou a tecla. */
  handleKey(e: KeyboardEvent): boolean {
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    if (e.key === "Escape") {
      this.tool.cancel?.();
      this.shapes.commit();
      this.sel.drop();
      return true;
    }
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const dir = arrows[e.key];
    if (dir && this.sel.active) {
      const step = e.shiftKey ? 10 : 1;
      this.sel.lift();
      this.sel.moveTo(this.sel.rect!.x + dir[0] * step, this.sel.rect!.y + dir[1] * step);
      return true;
    }
    return false;
  }

  /** Atalhos de edição dentro de campos de texto (caixa de texto, diálogos). */
  private async textFieldCommand(field: HTMLInputElement | HTMLTextAreaElement, id: CommandId) {
    const selected = field.value.slice(field.selectionStart ?? 0, field.selectionEnd ?? 0);
    switch (id) {
      case "undo":
      case "redo":
        document.execCommand(id);
        break;
      case "copy":
      case "cut":
        if (selected) await backend.clipboardWriteText(selected).catch(() => document.execCommand("copy"));
        if (id === "cut" && selected) document.execCommand("delete");
        break;
      case "paste": {
        const text = await backend.clipboardReadText().catch(() => null);
        if (text && !document.execCommand("insertText", false, text)) {
          field.setRangeText(text, field.selectionStart ?? 0, field.selectionEnd ?? 0, "end");
          field.dispatchEvent(new Event("input"));
        }
        break;
      }
      case "selectAll":
        field.select();
        break;
      case "delete":
        document.execCommand("forwardDelete");
        break;
    }
  }

  // ------------------------------------------------------------------------
  // Arquivos
  // ------------------------------------------------------------------------

  get docName() {
    return this.doc.path ? fileName(this.doc.path) : "Sem título";
  }

  updateTitle() {
    const title = `${this.doc.dirty ? "*" : ""}${this.docName} - ${APP_NAME}`;
    if (title === this.lastTitle) return;
    this.lastTitle = title;
    document.title = title;
    const el = document.getElementById("doc-title");
    if (el) el.textContent = `${this.docName}${this.doc.dirty ? " •" : ""}`;
    if (inTauri) void getCurrentWindow().setTitle(title).catch(() => {});
  }

  /** Pergunta se quer salvar as alterações. Devolve false se o usuário cancelou. */
  async confirmDiscard(): Promise<boolean> {
    this.commitPending();
    if (!this.doc.dirty) return true;
    const choice = await askToSave(this.docName);
    if (choice === "cancel") return false;
    if (choice === "save") return this.save();
    return true;
  }

  private discardPending() {
    this.text.cancel();
    this.shapes.discard();
    this.tool.cancel?.();
    this.sel.clear();
  }

  async newImage() {
    if (!(await this.confirmDiscard())) return;
    this.discardPending();
    this.doc.reset(DEFAULT_WIDTH, DEFAULT_HEIGHT, "#ffffff");
    this.view.setZoom(this.view.fitZoom());
    this.updateTitle();
  }

  async open() {
    if (!(await this.confirmDiscard())) return;
    const path = await askOpenPath();
    if (path) await this.openPath(path, false);
  }

  /** Abre arquivos vindos do sistema ou arrastados (só o primeiro, como no Paint). */
  async openFiles(paths: string[]) {
    const path = paths.find(isImagePath) ?? paths[0];
    if (!path) return;
    await this.openPath(path, true);
  }

  async openPending() {
    if (!inTauri) return;
    const paths = await backend.takePendingFiles();
    if (paths.length) await this.openFiles(paths);
  }

  private async openPath(path: string, confirm: boolean) {
    if (confirm && !(await this.confirmDiscard())) return;
    let canvas: HTMLCanvasElement;
    try {
      canvas = await loadImage(path);
    } catch (err) {
      await showMessage(APP_NAME, `Não foi possível abrir "${fileName(path)}".\n\n${err instanceof Error ? err.message : err}`);
      return;
    }
    this.discardPending();
    this.doc.load([makeLayer("Plano de fundo", canvas)], 0);
    this.doc.path = path;
    this.doc.dirty = false;
    this.view.setZoom(this.view.fitZoom());
    this.view.viewport.scrollTo(0, 0);
    this.updateTitle();
    if (inTauri) void getCurrentWindow().setFocus().catch(() => {});
  }

  /** Salva (ou "salvar como"). Devolve true se gravou. */
  async save(as = false): Promise<boolean> {
    this.commitPending();
    let path = this.doc.path;
    if (as || !path) path = await askSavePath(this.doc.path);
    if (!path) return false;
    try {
      await saveImage(path, this.doc.composite());
    } catch (err) {
      await showMessage(APP_NAME, `Não foi possível salvar "${fileName(path)}".\n\n${err instanceof Error ? err.message : err}`);
      return false;
    }
    this.doc.path = path;
    this.doc.dirty = false;
    this.updateTitle();
    return true;
  }

  /**
   * Antes de fechar: pergunta se quer salvar e grava a sessão. Com "Não
   * salvar", a próxima abertura reabre o arquivo como está no disco (ou uma
   * imagem em branco). Devolve false se o usuário cancelou.
   */
  async prepareToClose(): Promise<boolean> {
    this.commitPending();
    let mode: DocMode = "full";
    if (this.doc.dirty) {
      const choice = await askToSave(this.docName);
      if (choice === "cancel") return false;
      if (choice === "save" && !(await this.save())) return false;
      if (choice === "discard") mode = "discard";
    }
    await this.session?.save(mode);
    return true;
  }

  async quit() {
    if (await this.prepareToClose()) await backend.quit();
  }

  // ------------------------------------------------------------------------
  // Área de transferência
  // ------------------------------------------------------------------------

  private async copy(): Promise<boolean> {
    this.commitDrawing();
    const pixels = this.sel.pixels();
    if (!pixels) return false;
    await backend.clipboardWriteImage(pixels);
    return true;
  }

  private async paste() {
    const image = await backend.clipboardReadImage();
    if (!image) return;
    this.commitPending();
    // Como no Paint, a tela cresce se a imagem colada for maior.
    if (image.width > this.doc.width || image.height > this.doc.height) {
      this.resizeCanvas(Math.max(image.width, this.doc.width), Math.max(image.height, this.doc.height));
    }
    this.setTool("select");
    const origin = this.view.visibleOrigin();
    const at = {
      x: clamp(origin.x, 0, this.doc.width - image.width),
      y: clamp(origin.y, 0, this.doc.height - image.height),
    };
    this.sel.paste(ops.canvasFromImageData(image), at);
  }

  // ------------------------------------------------------------------------
  // Imagem
  // ------------------------------------------------------------------------

  /**
   * Aplica uma transformação à seleção, se houver, ou a todas as camadas.
   * `background` é a cor das áreas novas: a secundária no fundo, transparente nas outras camadas.
   */
  private imageOp(fn: (source: HTMLCanvasElement, background: string | null) => HTMLCanvasElement) {
    this.commitDrawing();
    if (this.sel.active) {
      this.sel.transform((source) => fn(source, null));
      return;
    }
    this.doc.transformAll((source, _layer, i) => fn(source, i === 0 ? this.secondary : null));
  }

  /** Muda o tamanho da tela; o conteúdo vai para (`offsetX`, `offsetY`) — negativo corta à esquerda/em cima. */
  resizeCanvas(width: number, height: number, offsetX = 0, offsetY = 0) {
    this.commitPending();
    width = clamp(Math.round(width), 1, MAX_SIDE);
    height = clamp(Math.round(height), 1, MAX_SIDE);
    if (width === this.doc.width && height === this.doc.height && !offsetX && !offsetY) return;
    this.doc.transformAll((source, _layer, i) =>
      ops.resizeCanvas(source, width, height, i === 0 ? this.secondary : null, offsetX, offsetY),
    );
  }

  private crop() {
    if (!this.sel.active) return;
    const area = this.doc.clip(this.sel.bounds()!);
    this.sel.drop();
    this.sel.clear();
    if (!area) return;
    this.doc.transformAll((source) => {
      const canvas = createCanvas(area.w, area.h);
      context2d(canvas).drawImage(source, -area.x, -area.y);
      return canvas;
    });
  }

  private async resizeImage() {
    this.commitDrawing();
    const target = this.sel.bounds() ?? this.doc.bounds;
    const result = await resizeDialog(target.w, target.h);
    if (!result) return;
    const { width, height, skewH, skewV } = result;
    this.imageOp((source, background) => {
      const resized = width === source.width && height === source.height ? source : ops.resample(source, width, height);
      return ops.skew(resized, skewH, skewV, background);
    });
  }

  /**
   * Remove o fundo da camada ativa (ou só da área selecionada) com o modelo
   * local: os pixels de fundo ficam transparentes.
   */
  private async removeBackground() {
    if (!inTauri) {
      await showMessage(APP_NAME, "Remover fundo só funciona no aplicativo.");
      return;
    }
    const selected = this.sel.rect;
    this.commitPending();
    const area = this.doc.clip(selected ?? this.doc.bounds);
    if (!area) return;
    this.sel.clear();
    const layer = this.doc.layer;
    const pixels = layer.ctx.getImageData(area.x, area.y, area.w, area.h);
    const done = showBusy("Removendo o fundo…");
    let mask: Uint8Array;
    try {
      mask = await backend.removeBackground(pixels);
    } finally {
      done();
    }
    if (layer !== this.doc.layer) return;
    const d = pixels.data;
    for (let i = 0; i < mask.length; i++) d[i * 4 + 3] = Math.round((d[i * 4 + 3] * mask[i]) / 255);
    this.doc.edit(area, (ctx) => ctx.putImageData(pixels, area.x, area.y));
  }

  private async imageProperties() {
    this.commitPending();
    const size = await imageSizeDialog(this.doc.width, this.doc.height);
    if (size) this.resizeCanvas(size.width, size.height);
  }
}

function focusedTextField(): HTMLInputElement | HTMLTextAreaElement | null {
  const el = document.activeElement;
  if (el instanceof HTMLTextAreaElement) return el;
  if (el instanceof HTMLInputElement && /^(text|number|search)$/.test(el.type)) return el;
  return null;
}
