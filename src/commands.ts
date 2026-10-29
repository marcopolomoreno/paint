import { isMac } from "./platform";

export type CommandId =
  | "new"
  | "open"
  | "save"
  | "saveAs"
  | "properties"
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
  | "zoomIn"
  | "zoomOut"
  | "zoomReset"
  | "zoomFit"
  | "toggleStatusBar";

export type ToggleSetting = "statusBar" | "transparentSelection";

export interface CommandItem {
  id: CommandId;
  label: string;
  /** Atalho no formato "Mod+Shift+S"; Mod é Cmd no Mac e Ctrl no Windows. */
  keys?: string;
  toggle?: ToggleSetting;
  /** Fora do Mac; no Mac o item fica no menu do aplicativo. */
  notMac?: boolean;
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
      { id: "save", label: "Salvar", keys: "Mod+S" },
      { id: "saveAs", label: "Salvar como…", keys: "Mod+Shift+S" },
      "-",
      { id: "properties", label: "Propriedades da imagem…", keys: "Mod+E" },
      "-",
      { id: "quit", label: "Sair", notMac: true },
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
      { id: "rotateRight", label: "Girar 90° à direita", keys: "Mod+R" },
      { id: "rotateLeft", label: "Girar 90° à esquerda", keys: "Mod+L" },
      { id: "rotate180", label: "Girar 180°" },
      "-",
      { id: "flipH", label: "Inverter na horizontal" },
      { id: "flipV", label: "Inverter na vertical" },
      "-",
      { id: "invertColors", label: "Inverter cores", keys: "Mod+Shift+I" },
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
export const BLOCKED_KEYS = ["Mod+Shift+R", "Mod+P", "Mod+F", "Mod+G", "F5", "F7"];

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
