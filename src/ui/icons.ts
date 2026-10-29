/** Ícones de traço simples (20×20) que herdam a cor do texto. */
const PATHS = {
  selectRect: '<rect x="3" y="4" width="14" height="12" rx="1" stroke-dasharray="2.5 2"/>',
  selectFree:
    '<path d="M6 4c4-2 10-1 10 3s-5 3-6 6-4 4-6 2-2-9 2-11z" stroke-dasharray="2.5 2"/>',
  crop: '<path d="M6 2v12h12M2 6h12v12"/>',
  resize: '<rect x="3" y="7" width="10" height="10" rx="1"/><path d="M10 3h7v7M17 3l-6 6"/>',
  rotate: '<path d="M4 10a6 6 0 1 0 2-4.5"/><path d="M3 3v4h4"/>',
  rotateRight: '<path d="M16 10a6 6 0 1 1-2-4.5"/><path d="M17 3v4h-4"/>',
  rotateLeft: '<path d="M4 10a6 6 0 1 0 2-4.5"/><path d="M3 3v4h4"/>',
  flipH: '<path d="M10 2v16"/><path d="M7 5 2 15h5zM13 5l5 10h-5z"/>',
  flipV: '<path d="M2 10h16"/><path d="M5 7 15 2v5zM5 13l10 5v-5z"/>',
  pencil: '<path d="M13.5 3.5l3 3L7 16H4v-3z"/><path d="M11.5 5.5l3 3"/>',
  fill: '<path d="M9 3 3.5 8.5a1.5 1.5 0 0 0 0 2l5 5a1.5 1.5 0 0 0 2 0L16 10z"/><path d="M4 9h11"/><path d="M17 13s1.5 2 1.5 3a1.5 1.5 0 0 1-3 0c0-1 1.5-3 1.5-3z"/>',
  text: '<path d="M4 17 9.5 3h1L16 17M6.3 12h7.4"/>',
  eraser: '<path d="M8 17h9"/><path d="M11.5 3.5 17 9l-7.5 7.5H6L3 13.5z"/><path d="M7.5 7.5 13 13"/>',
  picker: '<path d="M14 2.5a2.1 2.1 0 0 1 3 3L15 7.5l1 1-1.5 1.5-5-5L11 3.5l1 1z"/><path d="m10 6-6.5 6.5L3 17l4.5-.5L14 10"/>',
  brush: '<path d="M17 3 9 11"/><path d="M8.5 11.5c-2-1-4 0-4.5 2S3 17 2.5 17.5c2 .5 5 0 6-1.5s1-3 0-4.5z"/>',
  shapes: '<rect x="2.5" y="8.5" width="9" height="9" rx="1"/><circle cx="13" cy="7" r="4.5"/>',
  outline: '<rect x="3" y="3" width="14" height="14" rx="2"/>',
  shapeFill: '<rect x="3" y="3" width="14" height="14" rx="2" fill="currentColor" fill-opacity=".35"/>',
  size: '<path d="M3 5h14" stroke-width="1"/><path d="M3 10h14" stroke-width="2.2"/><path d="M3 15.5h14" stroke-width="3.5"/>',
  undo: '<path d="M8 4 4 8l4 4"/><path d="M4 8h8a4 4 0 0 1 0 8H9"/>',
  redo: '<path d="m12 4 4 4-4 4"/><path d="M16 8H8a4 4 0 0 0 0 8h3"/>',
  zoomIn: '<path d="M5 10h10M10 5v10"/>',
  zoomOut: '<path d="M5 10h10"/>',
  fit: '<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/>',
  chevron: '<path d="m5 8 5 5 5-5"/>',
  palette:
    '<circle cx="10" cy="10" r="7.5"/><circle cx="7" cy="7.5" r="1.2" fill="currentColor"/><circle cx="11" cy="6" r="1.2" fill="currentColor"/><circle cx="14" cy="9" r="1.2" fill="currentColor"/><path d="M10 17.5c-1.5 0-2-1.5-1-2.5s0-3 2-3h3"/>',
  imageSize: '<rect x="2.5" y="4.5" width="15" height="11" rx="1"/><path d="m2.5 13 4-4 3 3 2-2 6 5"/>',
  cursor: '<path d="M5 3v12l3.5-3.5L11 17l2-1-2.5-5H15z"/>',
  selection: '<rect x="3" y="4" width="14" height="12" rx="1" stroke-dasharray="2.5 2"/>',
};

export type IconName = keyof typeof PATHS;

export function icon(name: IconName, size = 20): string {
  return `<svg class="icon" viewBox="0 0 20 20" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
}
