-- Registro dos avisos (webhooks) que o Mercado Pago envia: ajuda a saber se o aviso chegou e o que foi feito com ele.
-- Guarda só tipo, id do pagamento/assinatura e o resultado, nunca segredos nem o corpo do aviso.

create table public.payment_events (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  type       text not null default '',
  data_id    text not null default '',
  outcome    text not null default ''
);
create index payment_events_at_idx on public.payment_events (at desc);
alter table public.payment_events enable row level security;
revoke all on public.payment_events from anon, authenticated;

-- Só o servidor (service_role) grava.
create or replace function public.log_payment_event(p_type text, p_data_id text, p_outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.payment_events (type, data_id, outcome)
  values (left(coalesce(p_type, ''), 60), left(coalesce(p_data_id, ''), 60), left(coalesce(p_outcome, ''), 80));
  -- guarda só os últimos 200
  delete from public.payment_events where id < (select coalesce(max(id), 0) - 200 from public.payment_events);
end;
$$;

create or replace function public.admin_payment_events()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  return coalesce((
    select jsonb_agg(jsonb_build_object('at', e.at, 'type', e.type, 'dataId', e.data_id, 'outcome', e.outcome) order by e.id desc)
    from (select * from public.payment_events order by id desc limit 20) e
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.log_payment_event(text, text, text), public.admin_payment_events() from public, anon, authenticated;
grant execute on function public.admin_payment_events() to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.log_payment_event(text, text, text) to service_role;
  end if;
end $$;
