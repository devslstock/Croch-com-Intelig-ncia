# Tramado (Crochê com Inteligência)

App web, pensado primeiro para o celular, que transforma fotos em gráficos de crochê.
Nome de trabalho: **Tramado** (nome e domínio ainda por confirmar).

## O que já existe (MVP, parte 1)

- Envio de foto com correção de orientação (EXIF) e limite de 1.600 px no lado maior.
- Recorte manual (arrastar), foto inteira ou 3:4.
- Motor foto → gráfico em **Web Worker**, determinístico (mesma foto e parâmetros = mesmo gráfico):
  redução por média de área, k-means++ em Lab com semente fixa, cores de destaque (até +2),
  limpeza de pontos soltos, paleta ordenada do mais claro ao mais escuro (A, B, C…).
- Parâmetros: largura 20–150 (padrão 70), cores 2–24 (padrão 10), Realista / Preto e branco,
  limpar pontos soltos, lado em que a carreira 1 começa (direita/esquerda).
- Gráfico em canvas: carreiras de baixo para cima, linhas grossas a cada 10, números nos 4 lados,
  símbolos nos pontos, zoom, legenda com contagem de pontos.
- Exportação em PNG (gráfico + legenda).

## Rodar

```bash
npm install
npm run dev      # desenvolvimento
npm test         # testes do motor
npm run build    # typecheck + build de produção
```

## Estrutura

```
src/engine/   motor (color, kmeans, pipeline, worker, client) + testes
src/chart/    desenho do gráfico em canvas (tela e PNG)
src/components/, src/App.tsx, src/styles.css   interface
```

## Próximos passos (do relatório)

1. Cartela de fios (Círculo etc.) com 3 alternativas por cor e lista de compras.
2. Editor ponto a ponto (lápis, balde, conta-gotas, texto, desfazer/refazer).
3. Visão "Como fica em crochê", modo Crochetar, PDF.
4. Conta e gráficos na nuvem (Supabase), planos e pagamento.

## Cuidados

- Marca, desenhos, modelos e textos devem ser **próprios**; nada da Crocheia é reaproveitado.
- A foto da cliente é processada no aparelho e não é enviada nem guardada (LGPD).
