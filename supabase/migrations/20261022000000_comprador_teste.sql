-- Ambiente de TESTE do Mercado Pago só aceita pagador de teste (e-mail @testuser.com). Para qualquer conta poder testar a assinatura
-- sem mudar nada, o painel guarda o e-mail do comprador de teste e, só em modo teste, o servidor o usa como pagador.
-- Em produção esse e-mail é ignorado.

alter table public.payment_config
  add column test_buyer_email text check (test_buyer_email is null or test_buyer_email ~* '^[^[:space:]@]+@testuser\.com$');

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
    'webhookSecret', case c.mode when 'production' then c.prod_webhook_secret else c.test_webhook_secret end,
    'testBuyerEmail', c.test_buyer_email
  )
  from public.payment_config c
$$;

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
    'testBuyerEmail', coalesce(c.test_buyer_email, ''),
    'test', jsonb_build_object(
      'hasToken', coalesce(c.test_access_token, '') <> '', 'tokenHint', right(coalesce(c.test_access_token, ''), 4),
      'hasSecret', coalesce(c.test_webhook_secret, '') <> '', 'secretHint', right(coalesce(c.test_webhook_secret, ''), 4)),
    'production', jsonb_build_object(
      'hasToken', coalesce(c.prod_access_token, '') <> '', 'tokenHint', right(coalesce(c.prod_access_token, ''), 4),
      'hasSecret', coalesce(c.prod_webhook_secret, '') <> '', 'secretHint', right(coalesce(c.prod_webhook_secret, ''), 4))
  );
end;
$$;

-- Vazio apaga.
create or replace function public.admin_set_test_buyer(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v text := nullif(lower(trim(coalesce(p_email, ''))), '');
begin
  perform public.admin_guard();
  if v is not null and v !~ '^[^[:space:]@]+@testuser\.com$' then raise exception 'comprador_invalido'; end if;
  update public.payment_config set test_buyer_email = v, updated_at = now() where id;
  insert into public.admin_audit (admin_id, action, detail)
  values (auth.uid(), 'save_payment_config', jsonb_build_object('mode', (select mode from public.payment_config), 'changed', jsonb_build_array('test_buyer')));
end;
$$;

revoke all on function public.admin_set_test_buyer(text) from public, anon, authenticated;
grant execute on function public.admin_set_test_buyer(text) to authenticated;
