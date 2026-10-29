import type { App } from "../app";
import { BRUSHES } from "../tools/brush";
import { SHAPES, shapeIconPath } from "../tools/shapes";
import { FONTS, FONT_SIZES } from "../tools/text";
import type { ToolId } from "../tools/tool";
import { menuItem, menuSeparator, openPopover } from "./dialogs";
import { pickColor } from "./colorpicker";
import { icon, type IconName } from "./icons";

/** Paleta básica (duas linhas de dez). */
const PALETTE = [
  "#000000", "#7f7f7f", "#880015", "#ed1c24", "#ff7f27", "#fff200", "#22b14c", "#00a2e8", "#3f48cc", "#a349a4",
  "#ffffff", "#c3c3c3", "#b97a57", "#ffaec9", "#ffc90e", "#efe4b0", "#b5e61d", "#99d9ea", "#7092be", "#c8bfe7",
];

const SIZE_PRESETS = [1, 2, 3, 5, 8, 12, 20, 30, 50];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", html = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html) e.innerHTML = html;
  return e;
}

function button(iconName: IconName | null, title: string, onClick: (b: HTMLButtonElement) => void, label = "") {
  const b = el("button", "tb-button", (iconName ? icon(iconName) : "") + (label ? `<span>${label}</span>` : ""));
  b.title = title;
  b.setAttribute("aria-label", title);
  b.addEventListener("click", () => onClick(b));
  return b;
}

function group(label: string, ...children: HTMLElement[]) {
  const g = el("div", "tb-group");
  const body = el("div", "tb-group-body");
  body.append(...children);
  g.append(body, el("div", "tb-group-label", label));
  return g;
}

/** Abre um menu de itens abaixo de um botão. */
function dropdown(anchor: HTMLElement, build: (close: () => void) => HTMLElement[]) {
  const menu = el("div", "popup-menu");
  menu.setAttribute("role", "menu");
  anchor.classList.add("open");
  const close = openPopover(anchor, menu, "below", () => anchor.classList.remove("open"));
  menu.append(...build(close));
}

/** Faixa de ferramentas no estilo do Paint do Windows 11. */
export function installToolbar(app: App, root: HTMLElement, contextBar: HTMLElement) {
  /** Funções que atualizam os botões quando o estado muda. */
  const refreshers: (() => void)[] = [];
  const toolButton = (id: ToolId, iconName: IconName, title: string) => {
    const b = button(iconName, title, () => app.setTool(id));
    refreshers.push(() => b.classList.toggle("active", app.toolId === id));
    return b;
  };

  // --- Seleção ---------------------------------------------------------
  const selMain = button("selectRect", "Seleção", () => app.setTool("select"));
  selMain.classList.add("tb-large");
  const selArrow = button("chevron", "Opções de seleção", (b) =>
    dropdown(b, (close) => [
      menuItem("Seleção retangular", () => {
        close();
        app.setOption("selectMode", "rect");
        app.setTool("select");
      }, app.opts.selectMode === "rect"),
      menuItem("Seleção livre", () => {
        close();
        app.setOption("selectMode", "free");
        app.setTool("select");
      }, app.opts.selectMode === "free"),
      menuSeparator(),
      menuItem("Selecionar tudo", () => (close(), void app.run("selectAll"))),
      menuItem("Excluir seleção", () => (close(), void app.run("delete"))),
      menuItem("Seleção transparente", () => (close(), void app.run("toggleTransparent")), app.settings.transparentSelection),
    ]),
  );
  selArrow.classList.add("tb-arrow");
  refreshers.push(() => {
    selMain.innerHTML = icon(app.opts.selectMode === "free" ? "selectFree" : "selectRect", 24);
    selMain.classList.toggle("active", app.toolId === "select");
  });
  const selSplit = el("div", "tb-split");
  selSplit.append(selMain, selArrow);

  // --- Imagem ----------------------------------------------------------
  const rotateButton = button("rotate", "Girar e inverter", (b) =>
    dropdown(b, (close) => {
      const run = (id: Parameters<App["run"]>[0]) => () => (close(), void app.run(id));
      return [
        menuItem("Girar 90° à direita", run("rotateRight")),
        menuItem("Girar 90° à esquerda", run("rotateLeft")),
        menuItem("Girar 180°", run("rotate180")),
        menuSeparator(),
        menuItem("Inverter na horizontal", run("flipH")),
        menuItem("Inverter na vertical", run("flipV")),
      ];
    }),
  );
  const imageGrid = el("div", "tb-grid cols-1");
  imageGrid.append(
    button("crop", "Cortar na seleção", () => void app.run("crop")),
    button("resize", "Redimensionar e inclinar", () => void app.run("resize")),
    rotateButton,
  );
  const removeBg = button("removeBg", "Remover fundo", () => void app.run("removeBackground"), "Remover fundo");
  removeBg.classList.add("tb-wide");
  const imageBody = el("div", "tb-row");
  imageBody.append(imageGrid, removeBg);

  // --- Ferramentas -----------------------------------------------------
  const toolsGrid = el("div", "tb-grid cols-3");
  toolsGrid.append(
    toolButton("pencil", "pencil", "Lápis"),
    toolButton("fill", "fill", "Balde de tinta"),
    toolButton("text", "text", "Texto"),
    toolButton("eraser", "eraser", "Borracha"),
    toolButton("picker", "picker", "Seletor de cor"),
    toolButton("zoom", "zoomIn", "Lupa"),
  );
  // A lupa usa um ícone próprio.
  toolsGrid.lastElementChild!.innerHTML =
    '<svg class="icon" viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4.5 4.5"/></svg>';

  // --- Pincéis ---------------------------------------------------------
  const brushMain = button("brush", "Pincel", () => app.setTool("brush"));
  brushMain.classList.add("tb-large");
  const brushArrow = button("chevron", "Tipos de pincel", (b) =>
    dropdown(b, (close) =>
      BRUSHES.map((brush) =>
        menuItem(brush.label, () => {
          close();
          app.setOption("brush", brush.id);
          app.setTool("brush");
        }, app.opts.brush === brush.id),
      ),
    ),
  );
  brushArrow.classList.add("tb-arrow");
  refreshers.push(() => {
    brushMain.classList.toggle("active", app.toolId === "brush");
    brushMain.title = BRUSHES.find((b) => b.id === app.opts.brush)!.label;
  });
  const brushSplit = el("div", "tb-split");
  brushSplit.append(brushMain, brushArrow);

  // --- Formas ----------------------------------------------------------
  const shapesGrid = el("div", "tb-shapes");
  for (const shape of SHAPES) {
    const b = el(
      "button",
      "tb-button tb-shape",
      `<svg class="icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"><path d="${shapeIconPath(shape.id)}"/></svg>`,
    );
    b.title = shape.label;
    b.addEventListener("click", () => {
      app.setOption("shape", shape.id);
      app.setTool("shape");
    });
    refreshers.push(() => b.classList.toggle("active", app.toolId === "shape" && app.opts.shape === shape.id));
    shapesGrid.append(b);
  }
  const optionMenu = (iconName: IconName, title: string, key: "outline" | "fill", labels: [string, string]) =>
    button(iconName, title, (b) =>
      dropdown(b, (close) =>
        (["none", "solid"] as const).map((value, i) =>
          menuItem(labels[i], () => {
            close();
            app.setOption(key, value);
          }, app.opts[key] === value),
        ),
      ),
    );
  const shapeOptions = el("div", "tb-grid cols-1");
  shapeOptions.append(
    optionMenu("outline", "Contorno", "outline", ["Sem contorno", "Contorno sólido (cor 1)"]),
    optionMenu("shapeFill", "Preenchimento", "fill", ["Sem preenchimento", "Preenchimento sólido (cor 2)"]),
  );
  const shapesBody = el("div", "tb-row");
  shapesBody.append(shapesGrid, shapeOptions);

  // --- Tamanho ---------------------------------------------------------
  const sizeButton = button("size", "Tamanho", (b) => {
    const panel = el("div", "popup-menu size-panel");
    const value = el("div", "size-value");
    const slider = el("input") as HTMLInputElement;
    Object.assign(slider, { type: "range", min: "1", max: "100", value: String(app.opts.sizes[app.sizeKey]) });
    const update = () => (value.textContent = `${app.opts.sizes[app.sizeKey]} px`);
    slider.addEventListener("input", () => {
      app.setSize(Number(slider.value));
      update();
    });
    const presets = el("div", "size-presets");
    for (const size of SIZE_PRESETS) {
      const p = el("button", "size-preset", `<span style="height:${Math.min(size, 14)}px"></span><em>${size}</em>`);
      p.title = `${size} px`;
      p.addEventListener("click", () => {
        app.setSize(size);
        slider.value = String(size);
        update();
      });
      presets.append(p);
    }
    update();
    panel.append(value, slider, presets);
    b.classList.add("open");
    openPopover(b, panel, "below", () => b.classList.remove("open"));
  });
  sizeButton.classList.add("tb-large");

  // --- Camadas ---------------------------------------------------------
  const layersButton = button("layers", "Painel de camadas", () => void app.run("toggleLayers"));
  layersButton.classList.add("tb-large");
  refreshers.push(() => layersButton.classList.toggle("active", app.settings.layersPanel));

  // --- Cores -----------------------------------------------------------
  const slot = (n: 1 | 2) => {
    const b = el("button", "color-slot", `<span class="swatch"></span><span class="slot-label">Cor ${n}</span>`);
    b.title = n === 1 ? "Cor 1 (botão esquerdo)" : "Cor 2 (botão direito e fundo)";
    b.addEventListener("click", () => {
      app.activeSlot = n;
      app.notify();
    });
    refreshers.push(() => {
      b.classList.toggle("active", app.activeSlot === n);
      (b.firstElementChild as HTMLElement).style.background = n === 1 ? app.primary : app.secondary;
    });
    return b;
  };
  const swatch = (color: string | null) => {
    const b = el("button", "palette-swatch");
    if (color) {
      b.style.background = color;
      b.title = color.toUpperCase();
      b.addEventListener("click", () => app.setColor(app.activeSlot, color));
      b.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        app.setColor(2, color);
      });
    } else {
      b.classList.add("empty");
      b.disabled = true;
    }
    return b;
  };
  const palette = el("div", "palette");
  const customRow = el("div", "palette custom");
  palette.append(...PALETTE.map(swatch));
  refreshers.push(() => {
    const colors = [...app.customColors, ...Array(10).fill(null)].slice(0, 10);
    customRow.replaceChildren(...colors.map(swatch));
  });
  const editColors = button("palette", "Editar cores", async () => {
    const current = app.activeSlot === 1 ? app.primary : app.secondary;
    const color = await pickColor(current);
    if (!color) return;
    app.addCustomColor(color);
    app.setColor(app.activeSlot, color);
  });
  editColors.classList.add("tb-large");
  const slots = el("div", "color-slots");
  slots.append(slot(1), slot(2));
  const palettes = el("div", "palettes");
  palettes.append(palette, customRow);
  const colorsBody = el("div", "tb-row");
  colorsBody.append(slots, palettes, editColors);

  root.append(
    group("Seleção", selSplit),
    group("Imagem", imageBody),
    group("Ferramentas", toolsGrid),
    group("Pincéis", brushSplit),
    group("Formas", shapesBody),
    group("Tamanho", sizeButton),
    group("Cores", colorsBody),
    group("Camadas", layersButton),
  );

  installTextBar(app, contextBar, refreshers);

  const refresh = () => refreshers.forEach((r) => r());
  app.onUi(refresh);
  refresh();
}

/** Barra de opções de texto, visível com a ferramenta Texto. */
function installTextBar(app: App, bar: HTMLElement, refreshers: (() => void)[]) {
  const font = el("select") as HTMLSelectElement;
  font.title = "Fonte";
  for (const name of FONTS) {
    const option = el("option") as HTMLOptionElement;
    option.value = option.textContent = name;
    option.style.fontFamily = name;
    font.append(option);
  }
  const size = el("select") as HTMLSelectElement;
  size.title = "Tamanho da fonte";
  for (const s of FONT_SIZES) {
    const option = el("option") as HTMLOptionElement;
    option.value = option.textContent = String(s);
    size.append(option);
  }
  const update = (patch: Partial<App["opts"]["text"]>) => app.setOption("text", { ...app.opts.text, ...patch });
  // Mudar as opções não pode tirar o foco da caixa de texto.
  const keepFocus = (e: Event) => e.preventDefault();
  font.addEventListener("change", () => update({ font: font.value }));
  size.addEventListener("change", () => update({ size: Number(size.value) }));

  const toggle = (label: string, title: string, key: "bold" | "italic" | "underline") => {
    const b = el("button", `tb-button text-toggle ${key}`, label);
    b.title = title;
    b.addEventListener("mousedown", keepFocus);
    b.addEventListener("click", () => update({ [key]: !app.opts.text[key] }));
    refreshers.push(() => b.classList.toggle("active", app.opts.text[key]));
    return b;
  };
  const background = (opaque: boolean, label: string) => {
    const b = el("button", "tb-button text-bg", label);
    b.addEventListener("mousedown", keepFocus);
    b.addEventListener("click", () => update({ opaque }));
    refreshers.push(() => b.classList.toggle("active", app.opts.text.opaque === opaque));
    return b;
  };

  bar.append(
    el("span", "ctx-label", "Texto"),
    font,
    size,
    toggle("<b>N</b>", "Negrito", "bold"),
    toggle("<i>I</i>", "Itálico", "italic"),
    toggle("<u>S</u>", "Sublinhado", "underline"),
    el("span", "ctx-sep"),
    background(false, "Fundo transparente"),
    background(true, "Fundo opaco"),
  );
  refreshers.push(() => {
    bar.hidden = app.toolId !== "text";
    font.value = app.opts.text.font;
    size.value = String(app.opts.text.size);
  });
}
