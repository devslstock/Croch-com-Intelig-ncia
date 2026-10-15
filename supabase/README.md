# Supabase do Tramado

Tudo aqui está **preparado, mas não aplicado**. Siga os passos quando o projeto Supabase do Tramado existir.

## 1. Criar o projeto

- Crie um projeto **dedicado ao Tramado** (sugestão: nome `tramado`, região `sa-east-1`, São Paulo).
  Não reaproveite o projeto de outro app: as contas de login (Auth) são compartilhadas por projeto.
- A conta gratuita permite 2 projetos ativos. Se estiver no limite, faça upgrade (Pro) ou pause/apague um projeto que não usa.

## 2. Aplicar a estrutura

Escolha uma opção:

- **Painel:** SQL Editor → cole `migrations/20261015000000_init_tramado.sql` → Run.
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
- **Google (opcional):** habilite o provedor e depois defina `VITE_GOOGLE_AUTH=true`.

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

## Fica para depois

`credit_ledger` (créditos), `subscriptions` (webhook de pagamento), `templates` (modelos), `store_pages`/`products` (vitrine)
e tabelas de fios no banco (hoje as cores vêm dos CSV em `src/yarn/data`). Cada uma entra em uma nova migração.
