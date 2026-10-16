-- Tramado: assinaturas (Básico e Plus), cota de imagens, pagamentos (Mercado Pago) e painel de gestão.
-- Aplicar DEPOIS de 20261015000000_init_tramado.sql. Veja supabase/README.md.
--
-- Como o acesso é decidido (tudo automático, sem mexer no painel a cada cadastro):
--   * cadastro novo  -> plano 'none' (sem assinatura): o app mostra a tela de planos;
--   * pagamento aprovado -> webhook chama apply_payment(): define o plano e estende o vencimento;
--   * vencimento passou (+ dias de tolerância) -> o plano efetivo volta a 'none' sozinho, sem rotina agendada;
--   * o painel (funções admin_*) serve só para ajustes manuais: cortesia, bloqueio, correções.

-- ---------------------------------------------------------------------------
-- profiles: novas colunas
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_plan_check;
update public.profiles set plan = case plan when 'plus' then 'plus' when 'pro' then 'plus' else 'none' end;
alter table public.profiles alter column plan set default 'none';
alter table public.profiles add constraint profiles_plan_check check (plan in ('none', 'basic', 'plus'));

alter table public.profiles
  add column email           text check (char_length(email) <= 254),
  add column phone           text check (char_length(phone) <= 30),
  add column is_admin        boolean not null default false,
  -- Desativada pelo painel: perde o acesso mesmo com plano pago.
  add column blocked         boolean not null default false,
  -- Vencimento do plano. Nulo = sem vencimento (cortesia dada pelo painel).
  add column plan_expires_at timestamptz,
  add column billing_cycle   text check (billing_cycle in ('monthly', 'yearly')),
  add column pay_method      text check (pay_method in ('card', 'pix', 'manual')),
  -- Cota de imagens: mês (America/Sao_Paulo, 'AAAA-MM') e quantas já foram criadas nele.
  add column images_month    text not null default '',
  add column images_count    integer not null default 0 check (images_count >= 0);

-- Os campos novos NÃO entram no grant de UPDATE: a usuária não muda plano, vencimento, bloqueio nem admin.
-- (O grant por coluna da migração inicial continua valendo: name, city, uf, reading_side.)

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name, email, phone)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', ''), 120),
    left(new.email, 254),
    left(new.phone, 30)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Preços e limites (editáveis no painel, sem novo deploy)
-- ---------------------------------------------------------------------------
create table public.app_settings (
  id                boolean primary key default true check (id),
  -- Valores de EXEMPLO: ajuste no painel de gestão.
  basic_monthly_cents integer not null default 1990 check (basic_monthly_cents > 0),
  plus_monthly_cents  integer not null default 3990 check (plus_monthly_cents > 0),
  -- Plano anual = (12 - N) mensalidades. Com 2, paga 10 e leva 12.
  yearly_free_months  integer not null default 2 check (yearly_free_months between 0 and 11),
  basic_image_limit   integer not null default 12 check (basic_image_limit >= 1),
  -- Dias de tolerância depois do vencimento (Pix compensa, cartão tenta de novo).
  grace_days          integer not null default 3 check (grace_days between 0 and 30),
  updated_at          timestamptz not null default now()
);
insert into public.app_settings default values;

-- ---------------------------------------------------------------------------
-- Pagamentos, assinaturas do cartão e trilha de auditoria
-- ---------------------------------------------------------------------------
create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  provider            text not null default 'mercadopago',
  -- Chave de idempotência: o mesmo aviso do Mercado Pago nunca soma duas vezes.
  provider_payment_id text not null unique,
  plan                text not null check (plan in ('basic', 'plus')),
  cycle               text not null check (cycle in ('monthly', 'yearly')),
  method              text not null check (method in ('card', 'pix')),
  amount_cents        integer not null check (amount_cents >= 0),
  status              text not null default 'approved',
  paid_at             timestamptz not null default now(),
  period_end          timestamptz
);
create index payments_user_idx on public.payments (user_id, paid_at desc);

create table public.subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  provider    text not null default 'mercadopago',
  provider_id text not null unique,
  plan        text not null check (plan in ('basic', 'plus')),
  cycle       text not null check (cycle in ('monthly', 'yearly')),
  status      text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index subscriptions_user_idx on public.subscriptions (user_id);

create table public.admin_notes (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  note       text not null check (char_length(note) <= 500),
  updated_at timestamptz not null default now()
);

create table public.admin_audit (
  id         bigint generated always as identity primary key,
  admin_id   uuid,
  user_id    uuid,
  action     text not null,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.app_settings  enable row level security;
alter table public.payments      enable row level security;
alter table public.subscriptions enable row level security;
alter table public.admin_notes   enable row level security;
alter table public.admin_audit   enable row level security;

revoke all on public.app_settings, public.payments, public.subscriptions, public.admin_notes, public.admin_audit from anon;
revoke all on public.app_settings, public.payments, public.subscriptions, public.admin_notes, public.admin_audit from authenticated;
-- Só leitura, e só do que é dela. Escrever: somente servidor (service_role) e funções do painel.
grant select on public.app_settings, public.payments, public.subscriptions to authenticated;

create policy "settings: todas leem os preços" on public.app_settings for select to authenticated using (true);
create policy "payments: ler os próprios" on public.payments for select to authenticated using ((select auth.uid()) = user_id);
create policy "subscriptions: ler as próprias" on public.subscriptions for select to authenticated using ((select auth.uid()) = user_id);
-- admin_notes e admin_audit: sem policy = ninguém lê direto; só as funções admin_* (security definer).

-- ---------------------------------------------------------------------------
-- Regras de acesso
-- ---------------------------------------------------------------------------
create or replace function public.current_month()
returns text language sql stable set search_path = '' as $$
  select to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')
$$;

-- Plano que vale agora: 'none' se bloqueada, sem plano ou vencida além da tolerância.
create or replace function public.effective_plan(p_plan text, p_blocked boolean, p_expires timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_blocked or p_plan = 'none' then 'none'
    when p_expires is null then p_plan
    when p_expires + make_interval(days => (select grace_days from public.app_settings)) > now() then p_plan
    else 'none'
  end
$$;

create or replace function public.plan_price_cents(p_plan text, p_cycle text)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare s public.app_settings; monthly integer;
begin
  select * into s from public.app_settings;
  monthly := case p_plan when 'basic' then s.basic_monthly_cents when 'plus' then s.plus_monthly_cents end;
  if monthly is null or p_cycle not in ('monthly', 'yearly') then raise exception 'plano_invalido'; end if;
  return case p_cycle when 'yearly' then monthly * (12 - s.yearly_free_months) else monthly end;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- Situação da conta da usuária logada (o app usa para liberar telas e mostrar "x de 12 imagens").
create or replace function public.my_account()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare p public.profiles; s public.app_settings;
begin
  select * into p from public.profiles where id = auth.uid();
  if not found then return null; end if;
  select * into s from public.app_settings;
  return jsonb_build_object(
    'plan', p.plan,
    'effective', public.effective_plan(p.plan, p.blocked, p.plan_expires_at),
    'expiresAt', p.plan_expires_at,
    'blocked', p.blocked,
    'cycle', p.billing_cycle,
    'method', p.pay_method,
    'isAdmin', p.is_admin,
    'email', p.email,
    'imagesUsed', case when p.images_month = public.current_month() then p.images_count else 0 end,
    'prices', jsonb_build_object(
      'basicMonthlyCents', s.basic_monthly_cents,
      'plusMonthlyCents', s.plus_monthly_cents,
      'yearlyFreeMonths', s.yearly_free_months,
      'basicImageLimit', s.basic_image_limit,
      'graceDays', s.grace_days
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Cota de imagens: valendo no banco, não só na tela
-- ---------------------------------------------------------------------------
create or replace function public.enforce_chart_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare p public.profiles; s public.app_settings; eff text; cur text; used integer;
begin
  -- Chamadas do servidor (service_role) e do SQL Editor não passam pela cota.
  if auth.uid() is null then return new; end if;
  -- "upsert" de um gráfico que já existe é edição, não imagem nova.
  if exists (select 1 from public.charts where id = new.id) then return new; end if;

  select * into p from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'assinatura_inativa'; end if;
  select * into s from public.app_settings;
  eff := public.effective_plan(p.plan, p.blocked, p.plan_expires_at);
  if eff = 'none' then raise exception 'assinatura_inativa'; end if;

  cur := public.current_month();
  used := case when p.images_month = cur then p.images_count else 0 end;
  if eff = 'basic' and used >= s.basic_image_limit then raise exception 'limite_mensal'; end if;

  -- Conta no mês de criação; apagar o gráfico depois não devolve a imagem.
  update public.profiles set images_month = cur, images_count = used + 1 where id = p.id;
  return new;
end;
$$;

create trigger charts_enforce_quota
  before insert on public.charts
  for each row execute function public.enforce_chart_quota();

-- ---------------------------------------------------------------------------
-- Funções do servidor (webhook do Mercado Pago): só service_role executa
-- ---------------------------------------------------------------------------
create or replace function public.apply_payment(
  p_user uuid, p_plan text, p_cycle text, p_method text, p_provider_payment_id text, p_amount_cents integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare inserted integer; p public.profiles; base timestamptz; newend timestamptz; cur_eff text;
begin
  if p_plan not in ('basic', 'plus') or p_cycle not in ('monthly', 'yearly') or p_method not in ('card', 'pix') then
    raise exception 'pagamento_invalido';
  end if;
  select * into p from public.profiles where id = p_user for update;
  if not found then raise exception 'usuaria_inexistente'; end if;

  insert into public.payments (user_id, provider_payment_id, plan, cycle, method, amount_cents)
  values (p_user, p_provider_payment_id, p_plan, p_cycle, p_method, greatest(p_amount_cents, 0))
  on conflict (provider_payment_id) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return jsonb_build_object('applied', false); end if;

  cur_eff := public.effective_plan(p.plan, false, p.plan_expires_at);
  -- Renovação soma ao vencimento atual. Subir de Básico para Plus começa de hoje (o Plus já foi pago por inteiro).
  if cur_eff = 'none' or (cur_eff = 'basic' and p_plan = 'plus') or p.plan_expires_at is null then
    base := now();
  else
    base := greatest(now(), p.plan_expires_at);
  end if;
  newend := base + case p_cycle when 'yearly' then interval '1 year' else interval '1 month' end;

  update public.profiles
     set plan = p_plan, plan_expires_at = newend, billing_cycle = p_cycle, pay_method = p_method
   where id = p_user;
  update public.payments set period_end = newend where provider_payment_id = p_provider_payment_id;
  return jsonb_build_object('applied', true, 'expiresAt', newend);
end;
$$;

create or replace function public.record_subscription(
  p_user uuid, p_provider_id text, p_plan text, p_cycle text, p_status text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.subscriptions (user_id, provider_id, plan, cycle, status)
  values (p_user, p_provider_id, p_plan, p_cycle, p_status)
  on conflict (provider_id) do update set status = excluded.status, updated_at = now()
$$;

-- ---------------------------------------------------------------------------
-- Painel de gestão (só quem tem is_admin = true)
-- ---------------------------------------------------------------------------
create or replace function public.admin_guard()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'sem_permissao'; end if;
end;
$$;

create or replace function public.admin_list_users(p_search text default null, p_limit integer default 300)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare out jsonb;
begin
  perform public.admin_guard();
  select coalesce(jsonb_agg(row order by (row ->> 'createdAt') desc), '[]'::jsonb) into out
  from (
    select jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'email', p.email,
      'phone', p.phone,
      'plan', p.plan,
      'effective', public.effective_plan(p.plan, p.blocked, p.plan_expires_at),
      'expiresAt', p.plan_expires_at,
      'blocked', p.blocked,
      'cycle', p.billing_cycle,
      'method', p.pay_method,
      'isAdmin', p.is_admin,
      'note', coalesce(n.note, ''),
      'imagesUsed', case when p.images_month = public.current_month() then p.images_count else 0 end,
      'createdAt', p.created_at,
      'lastPaymentAt', (select max(paid_at) from public.payments x where x.user_id = p.id)
    ) as row
    from public.profiles p
    left join public.admin_notes n on n.user_id = p.id
    where p_search is null or p_search = ''
       or p.name ilike '%' || p_search || '%' or p.email ilike '%' || p_search || '%' or p.phone ilike '%' || p_search || '%'
    order by p.created_at desc
    limit greatest(1, least(coalesce(p_limit, 300), 1000))
  ) t;
  return out;
end;
$$;

create or replace function public.admin_update_user(
  p_user uuid, p_plan text, p_expires timestamptz, p_blocked boolean, p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare old public.profiles;
begin
  perform public.admin_guard();
  if p_plan not in ('none', 'basic', 'plus') then raise exception 'plano_invalido'; end if;
  select * into old from public.profiles where id = p_user for update;
  if not found then raise exception 'usuaria_inexistente'; end if;

  update public.profiles
     set plan = p_plan,
         plan_expires_at = p_expires,
         blocked = coalesce(p_blocked, false),
         pay_method = case when p_plan <> old.plan or p_expires is distinct from old.plan_expires_at then 'manual' else pay_method end
   where id = p_user;

  if coalesce(p_note, '') = '' then
    delete from public.admin_notes where user_id = p_user;
  else
    insert into public.admin_notes (user_id, note) values (p_user, left(p_note, 500))
    on conflict (user_id) do update set note = excluded.note, updated_at = now();
  end if;

  insert into public.admin_audit (admin_id, user_id, action, detail)
  values (auth.uid(), p_user, 'update_user', jsonb_build_object(
    'before', jsonb_build_object('plan', old.plan, 'expiresAt', old.plan_expires_at, 'blocked', old.blocked),
    'after',  jsonb_build_object('plan', p_plan, 'expiresAt', p_expires, 'blocked', coalesce(p_blocked, false))
  ));
end;
$$;

create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  return (
    select jsonb_build_object(
      'users', count(*),
      'basic', count(*) filter (where public.effective_plan(plan, blocked, plan_expires_at) = 'basic'),
      'plus', count(*) filter (where public.effective_plan(plan, blocked, plan_expires_at) = 'plus'),
      'withoutPlan', count(*) filter (where public.effective_plan(plan, blocked, plan_expires_at) = 'none' and not blocked),
      'blocked', count(*) filter (where blocked),
      'expiringSoon', count(*) filter (where public.effective_plan(plan, blocked, plan_expires_at) <> 'none' and plan_expires_at is not null and plan_expires_at < now() + interval '7 days'),
      'newThisWeek', count(*) filter (where created_at > now() - interval '7 days'),
      'revenue30dCents', (select coalesce(sum(amount_cents), 0) from public.payments where paid_at > now() - interval '30 days')
    )
    from public.profiles
  );
end;
$$;

create or replace function public.admin_payments(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'plan', plan, 'cycle', cycle, 'method', method, 'amountCents', amount_cents, 'paidAt', paid_at, 'periodEnd', period_end) order by paid_at desc)
    from (select * from public.payments where user_id = p_user order by paid_at desc limit 20) x
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_update_settings(
  p_basic_cents integer, p_plus_cents integer, p_free_months integer, p_image_limit integer, p_grace_days integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  update public.app_settings
     set basic_monthly_cents = p_basic_cents, plus_monthly_cents = p_plus_cents, yearly_free_months = p_free_months,
         basic_image_limit = p_image_limit, grace_days = p_grace_days, updated_at = now();
  insert into public.admin_audit (admin_id, action, detail)
  values (auth.uid(), 'update_settings', jsonb_build_object('basic', p_basic_cents, 'plus', p_plus_cents, 'freeMonths', p_free_months, 'imageLimit', p_image_limit, 'graceDays', p_grace_days));
end;
$$;

create or replace function public.admin_audit_list(p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'action', action, 'userId', user_id, 'detail', detail, 'createdAt', created_at) order by id desc)
    from (select * from public.admin_audit order by id desc limit greatest(1, least(coalesce(p_limit, 30), 200))) x
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Quem pode chamar o quê
-- ---------------------------------------------------------------------------
revoke all on function
  public.is_admin(), public.my_account(), public.admin_guard(), public.plan_price_cents(text, text),
  public.apply_payment(uuid, text, text, text, text, integer), public.record_subscription(uuid, text, text, text, text),
  public.admin_list_users(text, integer), public.admin_update_user(uuid, text, timestamptz, boolean, text),
  public.admin_stats(), public.admin_payments(uuid), public.admin_update_settings(integer, integer, integer, integer, integer),
  public.admin_audit_list(integer)
from public, anon, authenticated;

-- A usuária logada pode consultar a própria conta; as funções admin_* se protegem com admin_guard().
grant execute on function public.my_account(), public.is_admin(), public.plan_price_cents(text, text) to authenticated;
grant execute on function
  public.admin_list_users(text, integer), public.admin_update_user(uuid, text, timestamptz, boolean, text),
  public.admin_stats(), public.admin_payments(uuid), public.admin_update_settings(integer, integer, integer, integer, integer),
  public.admin_audit_list(integer)
to authenticated;
-- admin_guard, apply_payment e record_subscription: ninguém além do servidor (service_role, que ignora esses grants).
