import type { App, Options } from "./app";
import { backend } from "./backend";
import type { ToggleSetting } from "./commands";
import { makeLayer, type Layer } from "./doc";
import { decodeInWebview } from "./files";
import type { ToolId } from "./tools/tool";

interface SavedLayer {
  id: string;
  name: string;
  visible: boolean;
}

interface SessionData {
  version: 1;
  settings: {
    primary: string;
    secondary: string;
    customColors: string[];
    toggles: Partial<Record<ToggleSetting, boolean>>;
    opts: Options;
    tool: ToolId;
  };
  /** Camadas da imagem aberta (com alterações não salvas, se houver). */
  doc: {
    path: string | null;
    dirty: boolean;
    active: number;
    layers: SavedLayer[];
  } | null;
  /** Sem `doc`: arquivo a reabrir do disco (a imagem estava salva ou as alterações foram descartadas). */
  reopen: string | null;
}

/** Como a imagem deve ficar guardada. */
export type DocMode =
  /** Tudo, inclusive alterações não salvas (ao perder o foco, a cada tanto, ao salvar). */
  | "full"
  /** O usuário escolheu "Não salvar" ao fechar: na próxima vez reabre o arquivo como está no disco. */
  | "discard";

const isColor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

/**
 * Sessão: lembra as configurações e a imagem aberta (com camadas) entre uma
 * execução e outra. As gravações passam por uma fila — duas nunca disputam o
 * mesmo arquivo — e cada camada só é regravada quando mudou.
 */
export class Session {
  private queue: Promise<void> = Promise.resolve();
  /** Versão de cada camada já gravada em disco. */
  private savedRevs = new Map<string, number>();
  private lastJson = "";

  constructor(private app: App) {}

  /** Grava a sessão (fica na fila atrás das gravações anteriores). */
  save(mode: DocMode = "full"): Promise<void> {
    const run = () => this.write(mode).catch((err) => console.error("Falha ao gravar a sessão", err));
    this.queue = this.queue.then(run, run);
    return this.queue;
  }

  private async write(mode: DocMode) {
    const app = this.app;
    const doc = app.doc;
    const data: SessionData = {
      version: 1,
      settings: {
        primary: app.primary,
        secondary: app.secondary,
        customColors: app.customColors,
        toggles: { ...app.settings },
        opts: app.opts,
        tool: app.toolId === "picker" ? "pencil" : app.toolId,
      },
      doc: null,
      reopen: null,
    };

    // Imagem salva em disco, de uma camada só: basta lembrar o caminho.
    const fromDisk = !doc.dirty && doc.path && doc.layers.length === 1;
    if (mode === "discard" || fromDisk) {
      data.reopen = doc.path;
    } else {
      for (const layer of doc.layers) {
        if (this.savedRevs.get(layer.id) === layer.rev) continue;
        const rev = layer.rev;
        await backend.saveLayer(layer.id, await pngOf(layer));
        this.savedRevs.set(layer.id, rev);
      }
      data.doc = {
        path: doc.path,
        dirty: doc.dirty,
        active: doc.activeIndex,
        layers: doc.layers.map(({ id, name, visible }) => ({ id, name, visible })),
      };
    }

    const json = JSON.stringify(data);
    if (json !== this.lastJson) {
      await backend.saveSession(json);
      this.lastJson = json;
    }
    const keep = data.doc ? data.doc.layers.map((l) => l.id) : [];
    for (const id of this.savedRevs.keys()) if (!keep.includes(id)) this.savedRevs.delete(id);
    await backend.pruneLayers(keep);
  }

  /** Restaura configurações e imagem. Devolve false se não havia sessão. */
  async restore(): Promise<boolean> {
    let data: SessionData;
    try {
      const json = await backend.loadSession();
      if (!json) return false;
      data = JSON.parse(json);
      this.lastJson = json;
    } catch (err) {
      console.error("Sessão ilegível; começando do zero", err);
      return false;
    }
    this.applySettings(data.settings);
    // Réguas e painéis mudam o tamanho da área de desenho: aplica antes de ajustar o zoom da imagem.
    this.app.applySettings();

    if (data.doc?.layers.length) {
      try {
        const layers: Layer[] = [];
        for (const saved of data.doc.layers) {
          const canvas = await decodeInWebview(new Blob([await backend.loadLayer(saved.id)]));
          const layer = makeLayer(saved.name, canvas, saved.id);
          layer.visible = saved.visible !== false;
          layers.push(layer);
          this.savedRevs.set(layer.id, layer.rev);
        }
        this.app.restoreDocument(layers, data.doc.active, data.doc.path, data.doc.dirty);
        return true;
      } catch (err) {
        console.error("Não foi possível restaurar a imagem da sessão", err);
      }
    }
    if (data.reopen) await this.app.reopen(data.reopen);
    return true;
  }

  /** Aplica as configurações gravadas, ignorando valores estranhos. */
  private applySettings(s: Partial<SessionData["settings"]> | undefined) {
    if (!s) return;
    const app = this.app;
    if (isColor(s.primary)) app.primary = s.primary;
    if (isColor(s.secondary)) app.secondary = s.secondary;
    if (Array.isArray(s.customColors)) app.customColors = s.customColors.filter(isColor).slice(0, 10);
    for (const [key, value] of Object.entries(s.toggles ?? {})) {
      if (key in app.settings && typeof value === "boolean") app.settings[key as ToggleSetting] = value;
    }
    if (s.opts && typeof s.opts === "object") {
      const o = s.opts;
      app.opts = {
        ...app.opts,
        ...o,
        sizes: { ...app.opts.sizes, ...o.sizes },
        text: { ...app.opts.text, ...o.text },
      };
    }
    if (typeof s.tool === "string") app.toolId = s.tool;
  }
}

function pngOf(layer: Layer): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    layer.canvas.toBlob(async (blob) => {
      if (!blob) return reject(new Error("falha ao codificar a camada"));
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, "image/png"),
  );
}
