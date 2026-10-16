# Supabase do Tramado

Tudo aqui está **preparado, mas não aplicado**. Siga os passos quando o projeto Supabase do Tramado existir.

## 1. Criar o projeto

- Crie um projeto **dedicado ao Tramado** (sugestão: nome `tramado`, região `sa-east-1`, São Paulo).
  Não reaproveite o projeto de outro app: as contas de login (Auth) são compartilhadas por projeto.
- A conta gratuita permite 2 projetos ativos. Se estiver no limite, faça upgrade (Pro) ou pause/apague um projeto que não usa.

## 2. Aplicar a estrutura

Escolha uma opção:

- **Painel:** SQL Editor → cole e rode, nesta ordem, `migrations/20261015000000_init_tramado.sql` e `migrations/20261016000000_assinaturas.sql`.
- **CLI:** `supabase link --project-ref <ref>` e `supabase db push`.
- **Pelo Claude:** peça "aplicar a migração do Tramado no projeto <ref>" (usa o conector Supabase).

O que a migração cria:

| Tabela | Para quê | Quem acessa |
| --- | --- | --- |
| `profiles` | nome, cidade/UF, lado de leitura, plano. Criada sozinha no cadastro (gatilho). | a própria usuária; `plan` só o servidor muda |
| `charts` | "Meus gráficos": grade em base64, paleta, fio usado, trocas manuais | só a dona (RLS em todas as operações) |

Visitantes sem login (`anon`) não têm acesso a nenhuma das tabelas.

## 3. Configurar o login (Authentication)

- **URL Configuration → Site URL:** o endereço do app (ex.: o domínio da Vercel). Em **Redirect URLs**, inclua
  o mesmo endereço e `http://localhost:5173` para desenvolvimento.
- **Providers → Email:** decida se exige confirmar o e-mail (o app já trata os dois casos). Mínimo de senha: 8.
- **Google:** habilite o provedor (Client ID e Secret do Google Cloud) e defina `VITE_GOOGLE_AUTH=true`.
- **Apple:** habilite o provedor. Exige conta Apple Developer (paga), Services ID, chave `.p8` e domínio verificado. Defina `VITE_APPLE_AUTH=true`.
- **WhatsApp (sem senha):** o Supabase envia o código de 6 dígitos pelo WhatsApp usando o **Twilio** (Authentication → Providers → Phone → Twilio com canal WhatsApp).
  Exige conta Twilio, um remetente de WhatsApp aprovado pela Meta e o modelo de mensagem de código aprovado; cada mensagem tem custo. Defina `VITE_WHATSAPP_AUTH=true`.
- Ninguém precisa criar senha: o primeiro acesso por Google, Apple ou WhatsApp já cria a conta. O e-mail e senha continua disponível como opção.

## 4. Variáveis do app

Em **Project Settings → API** copie a URL e a chave **anon/publishable** (nunca a `service_role`):

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<chave anon/publishable>
```

- Local: arquivo `.env.local` (veja `.env.example`; ele não vai para o Git).
- Produção: Vercel → Settings → Environment Variables, e faça um novo deploy.

Com as variáveis, o app troca sozinho de "modo demonstração" para login real e "Meus gráficos" passa a usar a tabela `charts`.

## 5. Conferir

1. Crie uma conta pelo app, confirme o e-mail (se exigido) e salve um gráfico.
2. Em **Table Editor**, veja a linha em `profiles` e em `charts`.
3. Rode **Advisors** (segurança e desempenho) e resolva qualquer alerta novo.

## Testar a estrutura sem Supabase

`npm run test:db` aplica a migração num Postgres local (PGlite) e confere: perfil automático, isolamento entre usuárias,
bloqueio do `anon`, proteção do campo `plan`, limites das colunas e remoção em cascata. Rode de novo se mudar o SQL.

## 6. Assinaturas, cota e painel de gestão

A migração `20261016000000_assinaturas.sql` cria: plano e vencimento no perfil, cota de imagens (Básico = 12 por mês, contada no
banco ao criar um gráfico novo; apagar não devolve), tabelas `payments`, `subscriptions`, `app_settings` (preços editáveis),
`admin_notes` e `admin_audit`, e as funções do painel (`admin_*`). Regras principais:

- Cadastro novo = **sem plano** (o app mostra a tela de planos). Pagamento aprovado libera o plano **sozinho**; passou do vencimento
  (+ dias de tolerância) o acesso cai **sozinho**, sem rotina agendada. O painel é só para ajustes manuais.
- Quem usa o app não consegue mudar plano, vencimento, bloqueio nem admin (permissões por coluna + funções só do servidor).
- Plano anual = 12 − 2 mensalidades (valor editável). Preços de exemplo: Básico R$ 19,90 e Plus R$ 39,90 por mês — **ajuste no painel**.

### Tornar você administradora

Depois de entrar uma vez no app, no SQL Editor (troque pelo seu e-mail ou telefone):

```sql
update public.profiles set is_admin = true where email = 'seu@email.com';
-- e, para você mesma usar o app sem pagar:
update public.profiles set plan = 'plus', plan_expires_at = null where email = 'seu@email.com';
```

O painel aparece no menu da conta (avatar) → **Painel de gestão**.

### Mercado Pago

1. Em <https://www.mercadopago.com.br/developers> crie uma aplicação e copie o **Access Token** de produção.
2. Em **Webhooks** da aplicação, aponte para `https://<ref>.supabase.co/functions/v1/mp-webhook` e marque os eventos **Pagamentos**,
   **Planos e assinaturas** (`subscription_preapproval`) e **Pagamentos recorrentes** (`subscription_authorized_payment`). Copie a **chave secreta** do webhook.
3. Cadastre os segredos e publique as funções (CLI do Supabase):

```bash
supabase secrets set MP_ACCESS_TOKEN=... MP_WEBHOOK_SECRET=... APP_URL=https://seu-app.vercel.app
supabase functions deploy mp-checkout
supabase functions deploy mp-webhook --no-verify-jwt   # o Mercado Pago não envia login; a assinatura x-signature protege
```

Como cada forma de pagamento funciona:

| Forma | Como | Renova sozinho? |
| --- | --- | --- |
| Cartão mensal | assinatura do Mercado Pago (`preapproval`) | sim |
| Cartão anual | pagamento único (Checkout Pro), parcelável no cartão | não: paga de novo em 1 ano |
| Pix (mensal ou anual) | QR Code / copia e cola; o app confere sozinho a cada 5 s | não: paga de novo no vencimento |

Cada pagamento aprovado soma 1 mês ou 1 ano ao vencimento (`apply_payment`, idempotente: o mesmo aviso nunca soma duas vezes). Subir do
Básico para o Plus conta a partir do dia do pagamento. O valor cobrado vem sempre do banco, nunca do navegador.

**Importante — ainda não testado com o Mercado Pago de verdade:** o código segue a documentação, mas só uma compra de teste com as suas
credenciais confirma tudo (use as credenciais de teste primeiro). O Pix recorrente automático do Mercado Pago não foi verificado, por isso o Pix é por período.

## Testar a estrutura sem Supabase

`npm run test:db` aplica as duas migrações num Postgres local (PGlite) e confere, entre outros: cadastro sem plano, pagamento
idempotente, renovação, cota de 12 imagens, vencimento/tolerância/bloqueio, funções fechadas para o app e painel só para admin.

## Fica para depois

`credit_ledger` (créditos), `templates` (modelos), `store_pages`/`products` (vitrine), tabelas de fios no banco, aviso por e-mail antes
do vencimento do Pix e ferramentas (preferências, orçamentos) na nuvem. Cada uma entra em uma nova migração.
