# Tabelas de cores dos fios

Coloque um arquivo `.csv` por linha de fio, com o nome `marca__linha.csv`, dentro da pasta do tipo:
`croche/` (ex.: `croche/Circulo__Amigurumi.csv`) ou `ponto-cruz/` (ex.: `ponto-cruz/DMC__Mouline.csv`).
A pasta define o grupo em que a tabela aparece no campo "Fio". Formato:

```
codigo,nome,hex
8001,Cru,#f2ead8
```

- `codigo` é o número impresso no novelo, que aparece no relatório de cores.
- `hex` deve ser **medido por vocês** (foto da cartela com referência de cor) ou vir de
  licença/parceria com a marca. Não copie tabelas de sites de terceiros: elas têm direitos autorais.
- A lista de fios DMC do Cyberstitchers é de bordado (ponto cruz), não de crochê, e não deve ser copiada.

## Tabelas incluídas

- `ponto-cruz/DMC__Mouline.csv`: 489 cores de fio DMC Mouliné (bordado), com código, nome, HEX, RGB e CMYK,
  baixada pelo dono do projeto em stitchmate.app. **Antes de publicar o Crochê Inteligente para o público,
  confirme nos Termos de uso do Stitchmate (ou com eles) se a redistribuição é permitida**
  e, para crochê, troque/some a tabela da linha de crochê usada pelas artesãs.
- `ponto-cruz/Anchor__Mouline.csv`: 475 números Anchor, **gerada** por `node scripts/gerar-anchor.mjs`
  a partir da tabela de equivalência Anchor ↔ DMC em `src/yarn/fontes/Anchor-DMC-equivalencia.tsv`.
  Cada número Anchor tem 1 ou mais equivalentes DMC; a cor (hex) usada é a da primeira linha do número
  e o nome lista todos os equivalentes ("≈ DMC 150, 326, 3350"). Os hex vêm do equivalente DMC, não de
  uma medição da própria Anchor, então são **aproximados**. Números cujos equivalentes têm cores bem
  diferentes (ex.: 410, 1009, 1089 e os variegados 1203–1220) devem ser conferidos com a cartela real.
  Para atualizar: edite o `.tsv` e rode o script.
