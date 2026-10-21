# Motor de risco para bordado

Transforma uma foto em um desenho de contorno (linhas escuras em fundo branco) para imprimir e passar ao tecido.
Tudo roda **no aparelho da pessoa**, em TypeScript, sem servidor e sem IA.

> Estado: implementado na branch `bordado-motor`. **Não publicado em produção.**
> Avaliação de qualidade feita com **uma única foto real autorizada** (a do exemplo do Bordai, enviada por você), em dois enquadramentos, mais cenas sintéticas. Não são os 20 a 50 casos que o plano previa: falta material autorizado. Veja "Limitações" e "Próximos passos".

## 1. Arquitetura

| Parte | Onde | O que faz |
| --- | --- | --- |
| Interface | `src/pages/Embroidery.tsx` (dentro de **Enviar sua foto → Estilo → Bordado**) | Foto original, resultado, comparar com o original, método e ajustes, "Gerar de novo", bastidor, texto, borracha, fios, PNG e PDF |
| Motor | `src/embroidery/engine/` (`ops.ts`, `methods.ts`, `params.ts`) | Algoritmos de imagem em TypeScript puro (também rodam no Node, nos testes) |
| Execução | `engine/worker.ts` + `engine/client.ts` | Web Worker: um cálculo por vez, pedidos antigos de pré-visualização são descartados, tempo máximo de 60 s |
| Validação | `src/embroidery/validate.ts` | Formato real pelos bytes, tamanho, resolução |
| Exportação | `src/embroidery/render.ts`, `pdfPages.ts` | PNG (80 px/cm ≈ 200 dpi), PDF A4 em tamanho real |
| Galeria | `gallery.html`, `src/gallery/`, `vite.gallery.config.ts` | Compara todos os métodos nas fotos de `test-photos/` (só desenvolvimento) |

### Por que no navegador (e não Python/OpenCV em servidor)

| | Navegador (escolhido) | OpenCV.js | Python + FastAPI + OpenCV |
| --- | --- | --- | --- |
| Foto sai do aparelho | Não | Não | **Sim** |
| Custo operacional | Zero | Zero | Servidor 24 h (não há no projeto) |
| Funciona offline (o app é offline-first) | Sim | Só se o arquivo de 8–10 MB entrar na cópia do aparelho | Não |
| Tamanho no app | +16 KB (motor) e +12 KB (worker) | +8–10 MB | 0 |
| Qualidade/algoritmos | Os pedidos são clássicos e simples de implementar | Biblioteca completa | Biblioteca completa |
| Hospedagem | Vercel estático, como hoje | Igual | Funções da Vercel têm limite de tempo e não trazem OpenCV nativo de forma garantida; exigiria outro serviço |

Se um dia a qualidade pedir algo que o TypeScript não entrega (por exemplo, filtros de borda mais avançados), a ordem lógica é: OpenCV.js carregado sob demanda; só depois um serviço separado.

## 2. Métodos

Todos devolvem a "tinta" (0 a 255) por pixel e são independentes (`runMethod(id, imagem, parâmetros)`).
Implementação própria em `ops.ts` (sem dependências novas; nenhum pacote foi instalado).

- **A · Contornos básicos:** tons de cinza esticados, ajuste de contraste, suavização gaussiana, **Canny** (Sobel, afinamento e limiar duplo) e limpeza de pedaços pequenos.
- **B · Limiarização adaptativa:** o que está mais escuro que a média local (janela gaussiana) vira linha; manchas pretas cheias são descartadas, o resto é afinado a 1 pixel (Zhang–Suen).
- **C · Preserva detalhes:** filtro **bilateral** (suaviza sem borrar bordas) e depois Canny com desfoque menor.
- **D · Lápis:** equivalente ao `pencilSketch` do OpenCV: cinza invertido e desfocado + "color dodge"; o esboço é convertido em linhas finas limpas (limiar, descarte de manchas, afinamento). Não é só um efeito de lápis: sai em linhas para imprimir.
- **E · Combinado (padrão):** C + traços finos longos de B + **simplificação do fundo** (onde há muita linha junta, só ficam traços longos) + fusão de linhas duplicadas (fecha e afina) + limpeza final.
- **Clássico:** a versão anterior do app (diferença de gaussianas), mantida para comparar e voltar. Bordados antigos continuam nela.

## 3. Parâmetros

Todos de 0 a 100 (inteiros); valores fora da faixa são corrigidos. Cada método usa só alguns; os outros não aparecem na tela.

| Parâmetro | Padrão | Efeito | Usado por |
| --- | --- | --- | --- |
| Intensidade dos contornos (`strength`) | 50 | Mais alto aceita bordas mais fracas | A B C D E |
| Espessura das linhas (`lineWidth`) | 35 | Espessura visual (engrossa e alisa) | A B C D E |
| Quantidade de detalhes (`detail`) | 55 | Traços menores e mais finos | todos (no Clássico é o único) |
| Suavização (`smoothing`) | 40 | Linhas mais lisas, menos ruído | A B C D E |
| Contraste (`contrast`) | 50 | 0 = só estica os tons; 100 = realça o contraste local | A B C D E |
| Limpeza de ruídos (`noiseClean`) | 50 | Descarta pontinhos e pedaços curtos | A B C D E |
| Simplificação do fundo (`background`) | 30 | Apaga linhas curtas onde há muita textura (0 = não mexe) | E |
| Preservação de detalhes (`detailPreserve`) | 50 | Suaviza menos cabelo, tecido e acessórios | C E |

Testes automáticos garantem que **cada parâmetro muda o resultado** nos métodos que o usam (`engine.test.ts`).
Na tela, o cálculo espera 180 ms depois do último movimento, roda em 720 px (900 px no Clássico) e em segundo plano; a exportação recalcula na resolução final (80 px/cm), nunca amplia a pré-visualização.

## 4. Entrada, saída e segurança

- **Arquivo:** o formato é conferido pelos bytes (JPEG, PNG, WebP), não pela extensão. Limites por variável de ambiente (valores públicos, não são segredos), documentados em `.env.example`: `VITE_EMB_MAX_MB` (15), `VITE_EMB_MAX_MEGAPIXELS` (40), `VITE_EMB_MIN_SIDE` (64). Arquivo corrompido, vazio, pequeno ou gigante é recusado com mensagem simples, sem caminhos nem detalhes internos.
- **Concorrência e recursos:** um cálculo por vez; pedidos de pré-visualização antigos são descartados; 60 s de tempo máximo (o worker é recriado se travar).
- **Privacidade e retenção:** a foto **não sai do aparelho** e não vai para nenhum provedor. Fica em `localStorage` (reduzida a 1000 px) só se a pessoa salvar; "Apagar" remove. Não há logs de imagem, de dados pessoais nem de credenciais. Não há treinamento com as fotos (nada é enviado).
- **Sem arquivos temporários:** não existem no servidor; no aparelho, os links de download são liberados em 10 s.
- **Saída:** PNG com fundo branco e linhas escuras, na proporção do bastidor ou da **foto inteira** (novo formato "Foto inteira": o lado maior mede 15–30 cm e a proporção é a da foto). PDF A4 em tamanho real, 1 folha até 20 × 28,7 cm; acima disso, várias folhas com 1 cm de sobreposição e marcas de encaixe. Não há ampliação artificial.

## 5. Comandos

```
npm install
npm run dev                # app
npm test                   # vitest (inclui os testes do motor)
npm run typecheck
npm run build
npm run gallery            # gera dist-gallery/ a partir de test-photos/
npm run gallery:serve      # http://localhost:4180/gallery.html
```

Não há script de `lint` no projeto (nenhum foi adicionado). Fotos de teste: coloque **somente fotos autorizadas** em `test-photos/` (a pasta não vai para o git).

## 6. Resultados da comparação (o que foi realmente executado)

Amostra: `barco-referencia.jpg` (retrato inteiro, mulher sentada num barco, fundo de folhagem) e `barco-recorte.jpg` (recorte da mesma foto). Parâmetros padrão. Conclusões da **minha** inspeção visual (a avaliação humana final é sua).

| Método | Pessoa e pose | Detalhes | Fundo | Contornos contínuos | Ruído | Observação |
| --- | --- | --- | --- | --- | --- | --- |
| E Combinado | Reconhecível | Bom nas bordas grandes; rosto quase sem traços | Folhagem quase toda removida (restam fragmentos no topo) | Boa | Baixo | Mais perto do modelo do Bordai nesta foto |
| A Contornos | Reconhecível | Mais linhas | Folhagem vira rabisco | Média | Alto | |
| B Adaptativa | Parcial | Linhas fragmentadas | Rabisco moderado | Fraca | Médio | |
| C Preserva detalhes | Reconhecível | Limpo, porém esparso | Folhagem em tufos | Boa | Médio | |
| D Lápis | Reconhecível | Muitos traços | Muito rabisco | Média | Muito alto | 13–20% de tinta |
| Clássico | Fraca | Linhas fracas e pontilhadas | Pontinhos por toda a foto | Fraca | Alto | |

Tempo de processamento (pré-visualização de 700 px, Edge headless no computador de desenvolvimento, **com outro projeto compilando ao mesmo tempo**, então os números são pessimistas):

| Método | `barco-referencia` (423×700) | `barco-recorte` (700×678) |
| --- | --- | --- |
| E | 694 ms | 1286 ms |
| A | 227 ms | 334 ms |
| B | 191 ms | 306 ms |
| C | 408 ms | 639 ms |
| D | 200 ms | 303 ms |
| Clássico | 64 ms | 121 ms |

**Memória e CPU não foram medidas** (o navegador não oferece medida confiável e portátil). Não há conclusão sobre celulares: **não testei em Android nem iPhone**. A exportação em 80 px/cm é bem mais lenta do que a pré-visualização (o filtro bilateral é o mais caro).

Também executados: 68 testes do bordado (motor, validação, exportação, parâmetros; suíte completa do projeto: 243 testes passando, `tsc` sem erros) e um teste de ponta a ponta no navegador (arquivo falso e corrompido recusados, os 6 métodos, comparar com o original, ajuste que muda o risco, PNG com fundo branco e proporção original, PDF de 1 e 2 folhas).

## 7. Limitações conhecidas

- Métodos convencionais **não entendem a cena**: não sabem o que é pessoa, rosto ou objeto. A "simplificação do fundo" apenas apaga linhas curtas onde há muita textura; ela pode apagar também detalhes legítimos (cabelo cacheado, estampas) e deixar fragmentos de folhagem.
- Rostos pequenos perdem quase todos os traços; o modelo do Bordai desenha rosto, dobras e roupa de forma estilizada. Nosso resultado é fiel às bordas da foto, não uma ilustração.
- Foto de baixa resolução ou com compressão forte (um print de celular, por exemplo) dá pouco detalhe e algum ruído.
- A avaliação foi feita em uma foto. O comportamento em retratos de frente, cabelo curto, estampas, iluminação desigual etc. **não foi verificado**.
- As letras do texto usam fontes do aparelho e podem variar.
- Os bordados salvos ficam só no aparelho (até 12).

## 8. Custos operacionais

Zero de infraestrutura nova: nenhum servidor, API ou serviço pago. O custo é CPU do aparelho. Aumento do app: cerca de 28 KB.

## 9. Implantação

Nada novo: é o mesmo build estático (`npm run build`) da Vercel. O service worker já inclui o worker novo na cópia offline. Nenhuma variável de ambiente é obrigatória (as de limite são opcionais).
Nenhuma tabela do Supabase, política RLS, autenticação ou plano foi alterada.

## 10. IA: ainda não recomendada

Critério do plano: só depois de esgotados os testes razoáveis. **Ainda não foram esgotados** (uma foto). Antes de decidir, falta:

1. Rodar a galeria com 20 a 50 fotos autorizadas (retratos, pessoas bordando, cabelo comprido e curto, estampas, fundos simples e com vegetação, luz desigual).
2. Você avaliar lado a lado com o padrão do Bordai.

O que a IA melhoraria, se os testes confirmarem: separar pessoa e fundo (hoje aproximado), simplificar o rosto e as dobras da roupa de forma estilizada. Riscos: foto enviada a terceiro (privacidade), dependência externa, custo por imagem. **Não há dados confiáveis de custo por imagem ou por mês neste momento**, então não apresento estimativa. Nenhum provedor foi integrado nem preparado.

## 11. Próximos passos possíveis

- Ampliar a bateria de fotos e registrar a avaliação visual de cada uma.
- Testar em Android e iPhone (tempo, memória, exportação).
- Se o rosto continuar fraco: ajuste local de contraste e "detalhes" na região do rosto (sem IA), ou OpenCV.js sob demanda.
- Guardar os bordados na nuvem (exige mudança de banco: decisão separada).
