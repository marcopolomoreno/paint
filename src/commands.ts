import { isMac } from "./platform";

export type CommandId =
  | "new"
  | "open"
  | "save"
  | "saveAs"
  | "properties"
  | "close"
  | "quit"
  | "undo"
  | "redo"
  | "cut"
  | "copy"
  | "paste"
  | "delete"
  | "selectAll"
  | "toggleTransparent"
  | "crop"
  | "resize"
  | "rotateRight"
  | "rotateLeft"
  | "rotate180"
  | "flipH"
  | "flipV"
  | "invertColors"
  | "removeBackground"
  | "newLayer"
  | "duplicateLayer"
  | "deleteLayer"
  | "mergeDown"
  | "layerUp"
  | "layerDown"
  | "flattenImage"
  | "toggleLayers"
  | "toggleRulers"
  | "toggleGrid"
  | "zoomIn"
  | "zoomOut"
  | "zoomReset"
  | "zoomFit"
  | "toggleStatusBar";

export type ToggleSetting = "statusBar" | "transparentSelection" | "layersPanel" | "rulers" | "grid";

export interface CommandItem {
  id: CommandId;
  label: string;
  /** Atalho no formato "Mod+Shift+S"; Mod é Cmd no Mac e Ctrl no Windows. */
  keys?: string;
  toggle?: ToggleSetting;
  /** Em campos de texto o atalho fica com o próprio campo (desfazer, copiar…). */
  textEdit?: boolean;
}

export type MenuEntry = CommandItem | "-";

export interface MenuDef {
  label: string;
  items: MenuEntry[];
}

export const MENUS: MenuDef[] = [
  {
    label: "Arquivo",
    items: [
      { id: "new", label: "Novo", keys: "Mod+N" },
      { id: "open", label: "Abrir…", keys: "Mod+O" },
      "-",
      // No Windows Ctrl+W é "Redimensionar", como no Paint.
      ...(isMac ? [{ id: "close", label: "Fechar", keys: "Mod+W" } as const] : []),
      { id: "save", label: "Salvar", keys: "Mod+S" },
      { id: "saveAs", label: "Salvar como…", keys: "Mod+Shift+S" },
      "-",
      { id: "properties", label: "Propriedades da imagem…", keys: "Mod+E" },
      // No Mac, "Encerrar" fica no menu do aplicativo.
      ...(isMac ? [] : (["-", { id: "quit", label: "Sair" }] as const)),
    ],
  },
  {
    label: "Editar",
    items: [
      { id: "undo", label: "Desfazer", keys: "Mod+Z", textEdit: true },
      { id: "redo", label: "Refazer", keys: isMac ? "Mod+Shift+Z" : "Mod+Y", textEdit: true },
      "-",
      { id: "cut", label: "Recortar", keys: "Mod+X", textEdit: true },
      { id: "copy", label: "Copiar", keys: "Mod+C", textEdit: true },
      { id: "paste", label: "Colar", keys: "Mod+V", textEdit: true },
      { id: "delete", label: "Excluir seleção", keys: "Delete", textEdit: true },
      "-",
      { id: "selectAll", label: "Selecionar tudo", keys: "Mod+A", textEdit: true },
      { id: "toggleTransparent", label: "Seleção transparente", toggle: "transparentSelection" },
    ],
  },
  {
    label: "Imagem",
    items: [
      { id: "crop", label: "Cortar na seleção", keys: "Mod+Shift+X" },
      { id: "resize", label: "Redimensionar e inclinar…", keys: isMac ? "Mod+Alt+I" : "Mod+W" },
      "-",
      // No Mac, Cmd+R/Cmd+L giram como no Visualizador; no Windows Ctrl+R são as réguas, como no Paint.
      { id: "rotateRight", label: "Girar 90° à direita", keys: isMac ? "Mod+R" : undefined },
      { id: "rotateLeft", label: "Girar 90° à esquerda", keys: isMac ? "Mod+L" : undefined },
      { id: "rotate180", label: "Girar 180°" },
      "-",
      { id: "flipH", label: "Inverter na horizontal" },
      { id: "flipV", label: "Inverter na vertical" },
      "-",
      { id: "invertColors", label: "Inverter cores", keys: "Mod+Shift+I" },
      { id: "removeBackground", label: "Remover fundo" },
    ],
  },
  {
    label: "Camadas",
    items: [
      { id: "newLayer", label: "Nova camada", keys: "Mod+Shift+N" },
      { id: "duplicateLayer", label: "Duplicar camada", keys: "Mod+J" },
      { id: "deleteLayer", label: "Excluir camada" },
      "-",
      { id: "layerUp", label: "Mover para cima", keys: "Mod+]" },
      { id: "layerDown", label: "Mover para baixo", keys: "Mod+[" },
      "-",
      { id: "mergeDown", label: "Mesclar para baixo", keys: "Mod+Shift+E" },
      { id: "flattenImage", label: "Achatar imagem" },
      "-",
      { id: "toggleLayers", label: "Painel de camadas", toggle: "layersPanel" },
    ],
  },
  {
    label: "Exibir",
    items: [
      { id: "zoomIn", label: "Ampliar", keys: "Mod+=" },
      { id: "zoomOut", label: "Reduzir", keys: "Mod+-" },
      { id: "zoomReset", label: "Tamanho real (100%)", keys: "Mod+0" },
      { id: "zoomFit", label: "Ajustar à janela", keys: "Mod+9" },
      "-",
      { id: "toggleRulers", label: "Réguas", keys: isMac ? "Mod+Alt+R" : "Mod+R", toggle: "rulers" },
      { id: "toggleGrid", label: "Linhas de grade", keys: isMac ? "Mod+Alt+G" : "Mod+G", toggle: "grid" },
      { id: "toggleStatusBar", label: "Barra de status", toggle: "statusBar" },
    ],
  },
];

/** Atalhos que não aparecem nos menus. */
const EXTRA_KEYS: [string, CommandId][] = [
  ["Mod+Shift+=", "zoomIn"],
  ["Mod+Shift+-", "zoomOut"],
  ["Backspace", "delete"],
  ...(isMac ? [] : ([["Mod+Shift+Z", "redo"]] as [string, CommandId][])),
];

/** Atalhos do navegador embutido que não fazem sentido no app. */
export const BLOCKED_KEYS = ["Mod+Shift+R", "Mod+P", "Mod+F", "F5", "F7"];

export const KEY_BINDINGS: [string, CommandId][] = [
  ...MENUS.flatMap((menu) =>
    menu.items.flatMap((item): [string, CommandId][] => (item !== "-" && item.keys ? [[item.keys, item.id]] : [])),
  ),
  ...EXTRA_KEYS,
];

/** Comandos cujos atalhos ficam com o campo de texto que estiver em foco. */
export const TEXT_EDIT_COMMANDS = new Set<CommandId>(
  MENUS.flatMap((menu) => menu.items.flatMap((item) => (item !== "-" && item.textEdit ? [item.id] : []))),
);

const CODES: Record<string, string> = {
  "=": "Equal",
  "-": "Minus",
  "[": "BracketLeft",
  "]": "BracketRight",
};

function keyCode(key: string): string {
  if (/^[A-Z]$/.test(key)) return `Key${key}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  return CODES[key] ?? key;
}

function parse(keys: string) {
  const parts = keys.split("+");
  const key = parts.pop()!;
  return {
    key,
    mod: parts.includes("Mod"),
    ctrl: parts.includes("Ctrl"),
    shift: parts.includes("Shift"),
    alt: parts.includes("Alt"),
  };
}

export function matchesKeys(keys: string, e: KeyboardEvent): boolean {
  const k = parse(keys);
  if (isMac) {
    if (k.mod !== e.metaKey || k.ctrl !== e.ctrlKey) return false;
  } else if ((k.mod || k.ctrl) !== e.ctrlKey || e.metaKey) {
    return false;
  }
  // O teclado numérico também amplia/reduz.
  const code = e.code === "NumpadAdd" ? "Equal" : e.code === "NumpadSubtract" ? "Minus" : e.code;
  const shiftOk = k.shift === e.shiftKey || (code !== e.code && !k.shift);
  return shiftOk && k.alt === e.altKey && code === keyCode(k.key);
}

/** Converte para o formato de atalho dos menus nativos do Tauri. */
export function toAccelerator(keys: string): string {
  return keys.replace("Mod", "CmdOrCtrl");
}

const KEY_NAMES: Record<string, string> = { "=": "+", "-": "-", Delete: "Del" };

/** Texto do atalho nos menus desenhados em HTML (Windows/Linux). */
export function formatKeys(keys: string): string {
  const { key, mod, ctrl, shift, alt } = parse(keys);
  return [mod || ctrl ? "Ctrl" : "", alt ? "Alt" : "", shift ? "Shift" : "", KEY_NAMES[key] ?? key]
    .filter(Boolean)
    .join("+");
}
