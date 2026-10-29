# Pincel

Editor de imagens simples, inspirado no Paint do Windows 11, para macOS (e Windows).
Feito com Tauri 2 + TypeScript + Vite, desenho em Canvas 2D.

## Desenvolvimento (Windows)

```bash
npm install
npm run tauri dev
```

- `npx tsc --noEmit` confere os tipos.
- `npm run dev` abre só a interface no navegador (sem arquivos nem área de transferência).

## Gerar o app para Mac

O `.dmg` é gerado pelo GitHub Actions (`.github/workflows/build-macos.yml`), numa
máquina Mac, com binário universal (Apple Silicon + Intel):

1. Na aba **Actions** do repositório, escolha **Build macOS** → **Run workflow**
   (ou crie uma tag `v0.1.0`).
2. Ao terminar, baixe o artefato **Pincel-macOS** e abra o `.dmg`.

### Primeira abertura no Mac

O app não é assinado nem autenticado pela Apple, então o macOS diz que ele "está
danificado" ou que "não pode ser aberto". Depois de arrastar o Pincel para
**Aplicativos**, rode no Terminal:

```bash
xattr -cr /Applications/Pincel.app
```

Isso remove a marca de "baixado da internet" (quarentena) que o macOS põe nos
arquivos baixados. Só é preciso fazer uma vez por versão instalada.

## Estrutura

- `src-tauri/src/lib.rs` — leitura/gravação de arquivos (bytes crus), codificação
  BMP/GIF com o crate `image`, área de transferência com imagens, instância única
  e arquivos abertos pelo Finder/Explorer.
- `src/app.ts` — estado do app e comandos.
- `src/doc.ts`, `src/history.ts` — a imagem e o histórico de desfazer (guarda só a
  região alterada; desfazer e refazer trocam o conteúdo guardado pelo atual).
- `src/view.ts` — área de desenho, zoom, rolagem, alças da tela.
- `src/selection.ts`, `src/tools/` — seleção e ferramentas.
- `src/commands.ts`, `src/ui/menus.ts` — lista única de comandos e atalhos; menu
  nativo no Mac e desenhado em HTML no Windows.
