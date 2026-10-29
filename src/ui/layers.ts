import type { App } from "../app";
import type { Layer } from "../doc";

const THUMB_W = 56;
const THUMB_H = 42;

const EYE_OPEN =
  '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z"/><circle cx="10" cy="10" r="2.5"/></svg>';
const EYE_CLOSED =
  '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3 3l14 14M8.2 5a8.6 8.6 0 0 1 1.8-.2c5 0 8 5.2 8 5.2a14 14 0 0 1-2.2 2.8M5.3 6.4A13.6 13.6 0 0 0 2 10s3 5.5 8 5.5a8 8 0 0 0 3.6-.9"/></svg>';

interface Row {
  el: HTMLElement;
  thumb: HTMLCanvasElement;
  name: HTMLElement;
  eye: HTMLButtonElement;
  rev: number;
}

/**
 * Painel de camadas à direita, como no Paint do Windows 11: a camada de cima
 * aparece primeiro. Clique escolhe, o olho mostra/oculta, dois cliques
 * renomeiam e arrastar (com pointer events) muda a ordem.
 */
export function installLayersPanel(app: App, panel: HTMLElement) {
  panel.innerHTML = `
    <header class="lp-header">
      <span>Camadas</span>
      <button class="lp-button" data-cmd="newLayer" title="Nova camada">
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M10 4v12M4 10h12"/></svg>
      </button>
    </header>
    <div class="lp-list" role="listbox" aria-label="Camadas"></div>
    <footer class="lp-footer">
      <button class="lp-button" data-cmd="duplicateLayer" title="Duplicar camada">
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="6.5" y="6.5" width="10" height="10" rx="1.5"/><path d="M13.5 4.5v-1h-10v10h1"/></svg>
      </button>
      <button class="lp-button" data-cmd="layerUp" title="Mover para cima">
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 16V4M5 9l5-5 5 5"/></svg>
      </button>
      <button class="lp-button" data-cmd="layerDown" title="Mover para baixo">
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4v12M5 11l5 5 5-5"/></svg>
      </button>
      <button class="lp-button" data-cmd="mergeDown" title="Mesclar para baixo">
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v9M6 8l4 4 4-4M4 16h12"/></svg>
      </button>
      <button class="lp-button" data-cmd="deleteLayer" title="Excluir camada">
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10"/></svg>
      </button>
    </footer>`;
  const list = panel.querySelector<HTMLElement>(".lp-list")!;
  const rows = new Map<string, Row>();
  const buttons = new Map<string, HTMLButtonElement>();

  for (const b of panel.querySelectorAll<HTMLButtonElement>("[data-cmd]")) {
    buttons.set(b.dataset.cmd!, b);
    b.addEventListener("click", () => void app.run(b.dataset.cmd as Parameters<App["run"]>[0]));
  }

  const drawThumb = (row: Row, layer: Layer) => {
    const { width, height } = app.doc;
    const scale = Math.min(THUMB_W / width, THUMB_H / height);
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    if (row.thumb.width !== w || row.thumb.height !== h) {
      row.thumb.width = w;
      row.thumb.height = h;
    }
    const ctx = row.thumb.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(layer.canvas, 0, 0, w, h);
    row.rev = layer.rev;
  };

  const rowFor = (layer: Layer): Row => {
    let row = rows.get(layer.id);
    if (row) return row;
    const el = document.createElement("div");
    el.className = "lp-row";
    el.setAttribute("role", "option");
    const eye = document.createElement("button");
    eye.className = "lp-eye";
    const thumbBox = document.createElement("div");
    thumbBox.className = "lp-thumb";
    const thumb = document.createElement("canvas");
    thumbBox.append(thumb);
    const name = document.createElement("span");
    name.className = "lp-name";
    el.append(eye, thumbBox, name);
    row = { el, thumb, name, eye, rev: -1 };
    rows.set(layer.id, row);

    const indexOf = () => app.doc.layers.indexOf(layer);
    eye.addEventListener("click", (e) => {
      e.stopPropagation();
      app.doc.setVisible(indexOf(), !layer.visible);
    });
    eye.addEventListener("pointerdown", (e) => e.stopPropagation());
    name.addEventListener("dblclick", () => rename(layer, name));
    installDrag(el, indexOf);
    return row;
  };

  const rename = (layer: Layer, label: HTMLElement) => {
    const input = document.createElement("input");
    input.className = "lp-rename";
    input.value = layer.name;
    label.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (save: boolean) => {
      if (done) return;
      done = true;
      input.replaceWith(label);
      if (save) app.doc.rename(app.doc.layers.indexOf(layer), input.value);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") finish(true);
      else if (e.key === "Escape") finish(false);
      e.stopPropagation();
    });
    input.addEventListener("blur", () => finish(true));
  };

  /** Clique escolhe a camada; arrastar na vertical muda a posição dela. */
  const installDrag = (el: HTMLElement, indexOf: () => number) => {
    let start: { y: number; index: number } | null = null;
    let dragging = false;
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      start = { y: e.clientY, index: indexOf() };
      dragging = false;
      el.setPointerCapture(e.pointerId);
      app.setActiveLayer(start.index);
    });
    el.addEventListener("pointermove", (e) => {
      if (!start || !el.hasPointerCapture(e.pointerId)) return;
      if (!dragging && Math.abs(e.clientY - start.y) < 5) return;
      dragging = true;
      el.classList.add("dragging");
      el.style.transform = `translateY(${e.clientY - start.y}px)`;
    });
    const end = (e: PointerEvent) => {
      if (!start) return;
      el.classList.remove("dragging");
      el.style.transform = "";
      if (dragging) {
        // A lista mostra a camada de cima primeiro: descer na tela é ir para baixo na pilha.
        const rowHeight = el.getBoundingClientRect().height;
        const steps = Math.round((e.clientY - start.y) / rowHeight);
        if (steps) app.moveLayer(start.index, start.index - steps);
      }
      start = null;
      dragging = false;
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  };

  /** Atualiza a lista inteira (ordem, nomes, ativa, visibilidade). */
  const refresh = () => {
    const doc = app.doc;
    panel.hidden = !app.settings.layersPanel;
    if (panel.hidden) return;
    const ordered = [...doc.layers].reverse();
    for (const id of rows.keys()) if (!doc.layers.some((l) => l.id === id)) rows.delete(id);
    const els = ordered.map((layer) => {
        const row = rowFor(layer);
        const active = layer === doc.layer;
        row.el.classList.toggle("active", active);
        row.el.classList.toggle("hidden-layer", !layer.visible);
        row.el.setAttribute("aria-selected", String(active));
        row.name.textContent = layer.name;
        row.eye.innerHTML = layer.visible ? EYE_OPEN : EYE_CLOSED;
        row.eye.title = layer.visible ? "Ocultar camada" : "Mostrar camada";
        if (row.rev !== layer.rev) drawThumb(row, layer);
        return row.el;
    });
    // Reinserir uma linha (mesmo no mesmo lugar) cancelaria o arrasto em andamento.
    const current = [...list.children];
    if (current.length !== els.length || current.some((el, i) => el !== els[i])) list.replaceChildren(...els);
    const index = doc.activeIndex;
    buttons.get("layerUp")!.disabled = index >= doc.layers.length - 1;
    buttons.get("layerDown")!.disabled = index <= 0;
    buttons.get("mergeDown")!.disabled = index <= 0;
    buttons.get("deleteLayer")!.disabled = doc.layers.length < 2;
  };

  // Miniaturas: no máximo uma atualização por quadro, só das camadas que mudaram.
  let pending = false;
  const refreshThumbs = () => {
    if (pending || panel.hidden) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      for (const layer of app.doc.layers) {
        const row = rows.get(layer.id);
        if (row && row.rev !== layer.rev) drawThumb(row, layer);
      }
    });
  };

  app.onUi(refresh);
  app.onPixels(refreshThumbs);
  refresh();
}
