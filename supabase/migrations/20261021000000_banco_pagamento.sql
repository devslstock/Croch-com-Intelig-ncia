-- Tramado: credenciais do Mercado Pago no painel de gestão (cartão "Banco").
-- O Mercado Pago tem credenciais e segredo de webhook SEPARADOS para teste e produção. Guardamos os dois conjuntos e
-- `mode` diz qual vale agora. Só as funções do servidor (service_role) leem os valores completos; o painel só vê
-- "tem / não tem" e os 4 últimos caracteres. Se nada estiver cadastrado, as funções usam as variáveis de ambiente.

create table public.payment_config (
  id                  boolean primary key default true check (id),
  mode                text not null default 'test' check (mode in ('test', 'production')),
  test_access_token   text,
  test_webhook_secret text,
  prod_access_token   text,
  prod_webhook_secret text,
  updated_at          timestamptz not null default now()
);
insert into public.payment_config default values;

alter table public.payment_config enable row level security;
revoke all on public.payment_config from anon, authenticated;
-- Sem policy: ninguém lê direto.

-- Credenciais do modo ativo, para as funções do servidor (mp-checkout, mp-webhook, mp-check).
create or replace function public.get_payment_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'mode', c.mode,
    'accessToken', case c.mode when 'production' then c.prod_access_token else c.test_access_token end,
    'webhookSecret', case c.mode when 'production' then c.prod_webhook_secret else c.test_webhook_secret end
  )
  from public.payment_config c
$$;

-- O que o painel pode ver: nunca o valor inteiro.
create or replace function public.admin_payment_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare c public.payment_config;
begin
  perform public.admin_guard();
  select * into c from public.payment_config;
  return jsonb_build_object(
    'mode', c.mode,
    'updatedAt', c.updated_at,
    'test', jsonb_build_object(
      'hasToken', coalesce(c.test_access_token, '') <> '', 'tokenHint', right(coalesce(c.test_access_token, ''), 4),
      'hasSecret', coalesce(c.test_webhook_secret, '') <> '', 'secretHint', right(coalesce(c.test_webhook_secret, ''), 4)),
    'production', jsonb_build_object(
      'hasToken', coalesce(c.prod_access_token, '') <> '', 'tokenHint', right(coalesce(c.prod_access_token, ''), 4),
      'hasSecret', coalesce(c.prod_webhook_secret, '') <> '', 'secretHint', right(coalesce(c.prod_webhook_secret, ''), 4))
  );
end;
$$;

-- Campo vazio = mantém o valor atual. O modo só muda se esse modo já tiver token e segredo.
create or replace function public.admin_save_payment_config(
  p_mode text, p_test_token text, p_test_secret text, p_prod_token text, p_prod_secret text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.payment_config;
  tt text := nullif(trim(coalesce(p_test_token, '')), '');
  ts text := nullif(trim(coalesce(p_test_secret, '')), '');
  pt text := nullif(trim(coalesce(p_prod_token, '')), '');
  ps text := nullif(trim(coalesce(p_prod_secret, '')), '');
  changed text[] := '{}';
begin
  perform public.admin_guard();
  if p_mode is null or p_mode not in ('test', 'production') then raise exception 'modo_invalido'; end if;
  if (tt is not null and tt !~ '^[A-Za-z0-9_-]{20,255}$') or (pt is not null and pt !~ '^[A-Za-z0-9_-]{20,255}$') then
    raise exception 'token_invalido';
  end if;
  if (ts is not null and ts !~ '^[^[:space:]]{8,200}$') or (ps is not null and ps !~ '^[^[:space:]]{8,200}$') then
    raise exception 'segredo_invalido';
  end if;

  select * into c from public.payment_config for update;
  if p_mode = 'production' and (coalesce(pt, c.prod_access_token) is null or coalesce(ps, c.prod_webhook_secret) is null) then
    raise exception 'faltam_credenciais_producao';
  end if;
  if p_mode = 'test' and (coalesce(tt, c.test_access_token) is null or coalesce(ts, c.test_webhook_secret) is null) then
    raise exception 'faltam_credenciais_teste';
  end if;

  if tt is not null then changed := array_append(changed, 'test_token'); end if;
  if ts is not null then changed := array_append(changed, 'test_secret'); end if;
  if pt is not null then changed := array_append(changed, 'prod_token'); end if;
  if ps is not null then changed := array_append(changed, 'prod_secret'); end if;
  if p_mode <> c.mode then changed := array_append(changed, 'mode'); end if;

  update public.payment_config
     set mode = p_mode,
         test_access_token = coalesce(tt, test_access_token), test_webhook_secret = coalesce(ts, test_webhook_secret),
         prod_access_token = coalesce(pt, prod_access_token), prod_webhook_secret = coalesce(ps, prod_webhook_secret),
         updated_at = now()
   where id;
  -- O histórico guarda só o que mudou, nunca os valores.
  insert into public.admin_audit (admin_id, action, detail)
  values (auth.uid(), 'save_payment_config', jsonb_build_object('mode', p_mode, 'changed', to_jsonb(changed)));
end;
$$;

revoke all on function public.get_payment_config(), public.admin_payment_config(),
  public.admin_save_payment_config(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_payment_config(), public.admin_save_payment_config(text, text, text, text, text) to authenticated;
-- get_payment_config: só o servidor (service_role) executa.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.get_payment_config() to service_role;
  end if;
end $$;
