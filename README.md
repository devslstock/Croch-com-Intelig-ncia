# Tramado

App web, pensado primeiro para o celular, que transforma fotos em gráficos de crochê.
Nome do site: **Tramado** (definido em `src/brand.ts`). Tema claro com cores pastéis (`src/styles.css`, variáveis no topo).

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

## Login e página inicial

- Primeira tela: **Entrar / Criar conta** (e-mail e senha; Google opcional). Depois do login: página inicial
  com atalhos (Foto em gráfico e Modelos), as **Ferramentas** (assistente de vendas e calculadora de preço) e **Meus gráficos**.
- O login usa Supabase Auth. Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (veja `.env.example`).
  Sem essas variáveis o app abre em **modo demonstração** (nada vai para a nuvem).
- "Meus gráficos": com login real grava na tabela `charts` do Supabase (`src/storage/supabaseCharts.ts`);
  em modo demonstração fica só no navegador (`src/storage/charts.ts`). A estrutura do banco e o passo a passo
  de ativação estão em `supabase/` (`supabase/README.md`). `npm run test:db` valida o SQL localmente.

## Modelos

Tela **Modelos** (início → Modelos): 21 modelos **desenhados do zero** (nada copiado de outros apps), em formas geométricas
(`src/models/library.ts`) que são rasterizadas no tamanho pedido (`src/models/shapes.ts`, `compose.ts`):

- **Bebê** (ursinho, coelhinho, patinho, leãozinho, baleinha, pandinha, raposinha, coruja, elefantinho),
  **Pet** (gatinho, cachorrinho, passarinho), **Casal** (coração, corações apaixonados, alianças),
  **Gráficos prontos** (estrela, flor, sol, coroa) e **Receitas** (alfabeto e números).
- Personalização: nome, data (opcional), cor das letras (com seletor), tamanho (30–110 pontos) e fundo colorido.
  O gráfico fica com letras em pontos, e **Criar gráfico** abre o editor.
- Para criar mais modelos, acrescente um item em `MODELS` com `colors` e `art` (caixa de 100 × 100).

## Editor e modo Crochetar

Na tela de foto, só se ajusta o gráfico (estilo, tamanho, cores, recorte, fio); o mapa de cores, a lista de compras e o
baixar PNG ficam no editor. Depois de **Salvar gráfico**, abre o editor (`src/pages/Editor.tsx`):

- **Ferramentas:** lápis (arrastar), balde, pegar cor, texto (alfabeto de 7 carreiras, com acentos, Ç e `<3`),
  paleta, desfazer/refazer (Ctrl+Z / Ctrl+Y), zoom, símbolos (letras nos pontos), "Como fica em crochê",
  baixar imagem, imprimir e lista de compras. Tocar na amostra de uma cor abre o ajuste manual (R, G, B, hex).
- **Salvamento automático** (indicador "Salvo" no topo).
- **Crochetar ▶:** carreira atual, lado em que ela vai (idas e vindas, opcional), contador de pontos (−1/+1),
  pontos seguidos por cor com o número do fio, carreira anterior/feita, pular para uma carreira. O progresso é salvo.
  Na imagem, a carreira do progresso fica destacada (faixa amarela, contorno vermelho, número nas duas margens e o
  próximo ponto marcado), as carreiras feitas ficam esmaecidas e a imagem rola sozinha até ela. No celular o gráfico
  fica fixo no topo.
- A lógica pura (alfabeto, pintura, balde, histórico, carreiras) está em `src/editor/` e tem testes.

## Assinaturas e painel de gestão

- **Planos:** *Básico* (usar a plataforma, até 12 imagens novas por mês) e *Plus* (imagens ilimitadas + Calculadora de preço + Assistente de vendas).
  Mensal ou anual (anual = 2 mensalidades de desconto). Os valores (exemplo: R$ 19,90 e R$ 39,90) e o limite ficam no painel.
- **Pagamento:** Mercado Pago, com cartão ou Pix (`supabase/functions/mp-checkout`, `mp-webhook`). O webhook libera e renova o plano sozinho.
- **Login sem senha:** Google, Apple e WhatsApp (código de 6 dígitos); e-mail e senha continua como opção.
- **Painel de gestão** (`src/pages/Admin.tsx`, só para administradoras): resumo, busca e filtros, ativar/desativar, mudar plano e vencimento
  (+30 dias, +1 ano, sem vencimento), anotações, pagamentos de cada pessoa, preços/limites e histórico de mudanças.
- Cota e acesso valem **no banco** (gatilho em `charts`), não só na tela. Configuração e passo a passo em `supabase/README.md`.
- Em **modo demonstração** tudo isso funciona no navegador com pagamento simulado e usuárias de mentira, para testar as telas.

## Ferramentas

- **Calculadora de preço** (`src/pages/PriceCalculator.tsx`, lógica em `src/tools/pricing.ts`): fio (preço e peso do novelo, gramas
  gastas, novelos inteiros), outros materiais, horas e valor da hora, imprevistos, taxas, impostos, lucro e arredondamento.
  O lucro e as taxas são calculados sobre o **preço final** (preço = custo ÷ (1 − taxas − impostos − lucro)). Mostra preço sugerido,
  lucro, preço mínimo sem prejuízo, sinal e restante, para onde vai o dinheiro e um simulador de desconto. Dá para partir de um
  gráfico salvo (pontos → gramas e horas, pelo seu ritmo). Os orçamentos salvos alimentam o assistente. Os valores iniciais
  (R$ 15 por novelo de 125 g, R$ 15 por hora, 1,8 g a cada 100 pontos, 200 pontos por hora…) são **só exemplos**: ajuste aos seus.
- **Assistente de vendas** (`src/pages/SalesAssistant.tsx`, lógica em `src/tools/chat.ts`): cola a conversa (exportação do WhatsApp,
  "Nome: texto" ou texto solto), reconhece o que a cliente quer (preço, prazo, envio, desconto, pagamento, personalização, problema…),
  e monta respostas (completa, curta e para fechar agora) em 3 tons, com ou sem emoji, editáveis, com copiar e abrir no WhatsApp.
  O desconto respeita o preço mínimo e o prazo pedido é comparado com o seu. É feito por **regras no aparelho, sem IA**, e a
  conversa não sai do navegador. Traz também respostas rápidas e "Seus dados" (Pix, prazo, sinal, envio, trocas).
- Preferências, dados e orçamentos ficam neste aparelho (`src/tools/storage.ts`, `localStorage`); ainda não vão para o Supabase.

## Celular

O app é pensado primeiro para o celular. Conferido em 390, 360 e 320 px de largura (emulação de toque): nenhuma tela tem
rolagem lateral, os botões têm pelo menos 40 px, os campos têm 16 px (sem zoom automático no iPhone) e o toque com o dedo
pinta um ponto, enquanto arrastar o dedo rola a imagem. Foto em gráfico, Modelos e Crochetar mantêm o gráfico fixo no topo
enquanto o resto rola; o editor usa 3 fileiras de ferramentas que deslizam para o lado. Ainda **não** foi testado em aparelho
real (iOS Safari/Chrome Android).

### PDF e instalação como app (PWA)

- **Baixar PDF** (editor): uma página A4 com o gráfico e a legenda, em retrato ou paisagem conforme a proporção
  (`src/chart/pdf.ts`, gerador próprio, sem dependências). Gráficos muito largos ficam com pontos pequenos na página.
- **PWA:** `public/manifest.webmanifest`, ícones em `public/` (gerados por `node scripts/gerar-icones.mjs`) e service worker
  `public/sw.js` (registrado só em produção). Os arquivos do app ficam em cache e a tela abre sem internet; login, nuvem e
  pagamento continuam precisando de conexão e nunca passam pelo cache. No Android o Chrome oferece "Instalar app"; no iPhone,
  Safari → Compartilhar → Adicionar à Tela de Início.

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
3. Visão "Como fica em crochê", modo Crochetar (PDF e PWA já feitos).
4. Conta e gráficos na nuvem (Supabase), planos e pagamento.

## Cuidados

- Marca, desenhos, modelos e textos devem ser **próprios**; nada da Crocheia é reaproveitado.
- A foto da cliente é processada no aparelho e não é enviada nem guardada (LGPD).
