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

## Sessão

O Pincel lembra a imagem aberta (com camadas) e as configurações entre uma
execução e outra, em `session/` dentro da pasta de dados do app:

- ao perder o foco e a cada minuto, grava tudo, inclusive alterações não salvas
  (se o app cair, elas voltam na próxima abertura);
- ao fechar, pergunta se quer salvar; com **Não salvar**, a próxima abertura
  reabre o arquivo como está no disco (ou uma imagem em branco);
- uma imagem salva de uma camada só é guardada apenas pelo caminho.

## Remover fundo

Roda localmente, sem internet, com o modelo **U²-Netp** (licença Apache-2.0,
de [U-2-Net](https://github.com/xuebinqin/U-2-Net), arquivo distribuído pelo
[rembg](https://github.com/danielgatis/rembg)) executado pelo
[tract](https://github.com/sonos/tract), em Rust puro. O modelo (~4,5 MB) vai
dentro do executável (`src-tauri/models/u2netp.onnx`). Funciona melhor com um
objeto principal bem definido; contornos finos (cabelo) ficam aproximados.

## Estrutura

- `src-tauri/src/lib.rs` — leitura/gravação de arquivos (bytes crus), codificação
  BMP/GIF com o crate `image`, área de transferência com imagens, instância única
  e arquivos abertos pelo Finder/Explorer.
- `src/app.ts` — estado do app e comandos.
- `src/doc.ts`, `src/history.ts` — a imagem (pilha de camadas) e o histórico de desfazer (guarda só a
  região alterada; desfazer e refazer trocam o conteúdo guardado pelo atual).
- `src/view.ts`, `src/ui/rulers.ts` — área de desenho, zoom, rolagem, alças da tela, réguas e grade.
- `src/ui/layers.ts` — painel de camadas.
- `src/session.ts` — sessão e configurações (gravação em fila, só o que mudou).
- `src-tauri/src/removebg.rs` — remover fundo.
- `src/selection.ts`, `src/tools/` — seleção e ferramentas.
- `src/commands.ts`, `src/ui/menus.ts` — lista única de comandos e atalhos; menu
  nativo no Mac e desenhado em HTML no Windows.
