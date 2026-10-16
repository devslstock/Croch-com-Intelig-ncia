-- Tramado: gráficos de bônus no cadastro e cupons de desconto.
-- Aplicar DEPOIS de 20261016000000_assinaturas.sql. Veja supabase/README.md.
--
--   * Bônus: cada conta nova ganha `signup_bonus_images` gráficos de presente (configurável no painel).
--     Servem mesmo sem plano e também depois de esgotar a cota mensal do Básico. O Plus já é ilimitado.
--   * Cupons: cadastrados no painel; a usuária informa o código ao criar a conta ou na tela de assinatura.
--     O valor com desconto é calculado AQUI (checkout_price), nunca no navegador.
--   * Anotação: ao associar um cupom, a linha "Cupom usado: CÓDIGO" entra na anotação da usuária no painel.

-- ---------------------------------------------------------------------------
-- Tabelas e colunas
-- ---------------------------------------------------------------------------
alter table public.app_settings
  add column signup_bonus_images integer not null default 0 check (signup_bonus_images between 0 and 1000);

create table public.coupons (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z0-9_-]{3,32}$'),
  description text not null default '' check (char_length(description) <= 120),
  -- percent: value = 1..99 (%); fixed: value = centavos descontados.
  kind        text not null check (kind in ('percent', 'fixed')),
  value       integer not null check (value > 0),
  plans       text[] not null default array['basic', 'plus'] check (plans <@ array['basic', 'plus'] and cardinality(plans) >= 1),
  cycles      text not null default 'both' check (cycles in ('both', 'monthly', 'yearly')),
  -- Quantas PESSOAS podem usar (nulo = sem limite).
  max_uses    integer check (max_uses is null or max_uses >= 1),
  expires_at  timestamptz,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  check (kind <> 'percent' or value between 1 and 99)
);

alter table public.coupons enable row level security;
revoke all on public.coupons from anon, authenticated;
-- Sem policy: ninguém lê direto. Só as funções abaixo (security definer).

alter table public.profiles
  add column bonus_images     integer not null default 0 check (bonus_images >= 0),
  add column coupon_id        uuid references public.coupons (id) on delete set null,
  -- Limite de tentativas de cupom (evita adivinhar códigos).
  add column coupon_fail_n    integer not null default 0,
  add column coupon_fail_at   timestamptz;

alter table public.payments
  add column coupon_id      uuid references public.coupons (id) on delete set null,
  add column discount_cents integer not null default 0 check (discount_cents >= 0);

create index payments_coupon_idx on public.payments (coupon_id) where coupon_id is not null;

-- ---------------------------------------------------------------------------
-- Regras internas dos cupons (ninguém além das funções do banco chama)
-- ---------------------------------------------------------------------------
-- Desconto, em centavos, que o cupom dá neste plano/período (0 = não vale). O preço final nunca fica abaixo de R$ 1,00.
create or replace function public.coupon_discount(p_coupon uuid, p_user uuid, p_plan text, p_cycle text, p_list integer)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare c public.coupons; d integer;
begin
  if p_coupon is null then return 0; end if;
  select * into c from public.coupons where id = p_coupon;
  if not found or not c.active then return 0; end if;
  if c.expires_at is not null and c.expires_at <= now() then return 0; end if;
  if not (p_plan = any (c.plans)) then return 0; end if;
  if c.cycles <> 'both' and c.cycles <> p_cycle then return 0; end if;
  if c.max_uses is not null
     and (select count(distinct user_id) from public.payments where coupon_id = c.id) >= c.max_uses
     and not exists (select 1 from public.payments where coupon_id = c.id and user_id = p_user) then
    return 0;
  end if;
  d := case c.kind when 'percent' then round(p_list * c.value / 100.0)::integer else c.value end;
  return greatest(0, least(d, p_list - 100));
end;
$$;

-- Acrescenta "Cupom usado: CÓDIGO" à anotação da usuária (sem repetir).
create or replace function public.note_coupon(p_user uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare line text := 'Cupom usado: ' || p_code; old text;
begin
  select note into old from public.admin_notes where user_id = p_user;
  if old is null or old = '' then
    insert into public.admin_notes (user_id, note) values (p_user, line)
    on conflict (user_id) do update set note = excluded.note, updated_at = now();
  elsif position(line in old) = 0 then
    update public.admin_notes
       set note = left(old, 500 - char_length(line) - 1) || E'\n' || line, updated_at = now()
     where user_id = p_user;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cadastro: bônus e cupom informado ao criar a conta (user_metadata.coupon)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_bonus integer; v_code text; v_cid uuid;
begin
  select signup_bonus_images into v_bonus from public.app_settings;
  v_code := upper(trim(coalesce(new.raw_user_meta_data ->> 'coupon', '')));
  if v_code <> '' then
    select id into v_cid from public.coupons
     where code = v_code and active and (expires_at is null or expires_at > now());
  end if;

  insert into public.profiles (id, name, email, phone, bonus_images, coupon_id)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', ''), 120),
    left(new.email, 254),
    left(new.phone, 30),
    coalesce(v_bonus, 0),
    v_cid
  )
  on conflict (id) do nothing;

  if v_cid is not null then perform public.note_coupon(new.id, v_code); end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cupom na tela de assinatura
-- ---------------------------------------------------------------------------
create or replace function public.redeem_coupon(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare p public.profiles; c public.coupons; v_code text := upper(trim(coalesce(p_code, ''))); v_ok boolean;
begin
  select * into p from public.profiles where id = auth.uid() for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'nao_autenticada'); end if;

  -- No máximo 8 códigos errados por hora.
  if p.coupon_fail_at is not null and p.coupon_fail_at > now() - interval '1 hour' and p.coupon_fail_n >= 8 then
    return jsonb_build_object('ok', false, 'error', 'muitas_tentativas');
  end if;

  select * into c from public.coupons
   where code = v_code and active and (expires_at is null or expires_at > now());
  v_ok := found;
  if v_ok and c.max_uses is not null
     and (select count(distinct user_id) from public.payments where coupon_id = c.id) >= c.max_uses
     and not exists (select 1 from public.payments where coupon_id = c.id and user_id = p.id) then
    v_ok := false;
  end if;

  if not v_ok then
    update public.profiles
       set coupon_fail_n = case when coupon_fail_at is not null and coupon_fail_at > now() - interval '1 hour' then coupon_fail_n + 1 else 1 end,
           coupon_fail_at = now()
     where id = p.id;
    return jsonb_build_object('ok', false, 'error', 'cupom_invalido');
  end if;

  update public.profiles set coupon_id = c.id where id = p.id;
  perform public.note_coupon(p.id, c.code);
  return jsonb_build_object('ok', true, 'coupon', jsonb_build_object(
    'code', c.code, 'description', c.description, 'kind', c.kind, 'value', c.value, 'plans', to_jsonb(c.plans), 'cycles', c.cycles
  ));
end;
$$;

-- Quanto cobrar (usada pela função mp-checkout, que chama como a usuária logada).
create or replace function public.checkout_price(p_plan text, p_cycle text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare p public.profiles; v_list integer; v_disc integer := 0; v_code text;
begin
  v_list := public.plan_price_cents(p_plan, p_cycle);
  select * into p from public.profiles where id = auth.uid();
  if found and p.coupon_id is not null then
    v_disc := public.coupon_discount(p.coupon_id, p.id, p_plan, p_cycle, v_list);
    if v_disc > 0 then select code into v_code from public.coupons where id = p.coupon_id; end if;
  end if;
  return jsonb_build_object('listCents', v_list, 'discountCents', v_disc, 'finalCents', v_list - v_disc, 'coupon', v_code);
end;
$$;

-- ---------------------------------------------------------------------------
-- Situação da conta (agora com bônus e cupom)
-- ---------------------------------------------------------------------------
create or replace function public.my_account()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare p public.profiles; s public.app_settings; c public.coupons; cj jsonb := null;
begin
  select * into p from public.profiles where id = auth.uid();
  if not found then return null; end if;
  select * into s from public.app_settings;
  if p.coupon_id is not null then
    select * into c from public.coupons where id = p.coupon_id;
    if found and c.active and (c.expires_at is null or c.expires_at > now()) then
      cj := jsonb_build_object('code', c.code, 'description', c.description, 'kind', c.kind, 'value', c.value, 'plans', to_jsonb(c.plans), 'cycles', c.cycles);
    end if;
  end if;
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
    'bonusImages', p.bonus_images,
    'coupon', cj,
    'prices', jsonb_build_object(
      'basicMonthlyCents', s.basic_monthly_cents,
      'plusMonthlyCents', s.plus_monthly_cents,
      'yearlyFreeMonths', s.yearly_free_months,
      'basicImageLimit', s.basic_image_limit,
      'graceDays', s.grace_days,
      'signupBonusImages', s.signup_bonus_images
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Cota de imagens: o bônus cobre "sem plano" e "acabou a cota do mês"
-- ---------------------------------------------------------------------------
create or replace function public.enforce_chart_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare p public.profiles; s public.app_settings; eff text; cur text; used integer;
begin
  if auth.uid() is null then return new; end if;
  if exists (select 1 from public.charts where id = new.id) then return new; end if;

  select * into p from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'assinatura_inativa'; end if;
  select * into s from public.app_settings;
  eff := public.effective_plan(p.plan, p.blocked, p.plan_expires_at);
  cur := public.current_month();
  used := case when p.images_month = cur then p.images_count else 0 end;

  if p.blocked then
    raise exception 'assinatura_inativa';
  elsif eff = 'none' then
    if p.bonus_images <= 0 then raise exception 'assinatura_inativa'; end if;
    update public.profiles set bonus_images = bonus_images - 1 where id = p.id;
  elsif eff = 'basic' and used >= s.basic_image_limit then
    if p.bonus_images <= 0 then raise exception 'limite_mensal'; end if;
    update public.profiles set bonus_images = bonus_images - 1 where id = p.id;
  else
    update public.profiles set images_month = cur, images_count = used + 1 where id = p.id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pagamento aprovado: registra o cupom usado (mesma assinatura de antes)
-- ---------------------------------------------------------------------------
create or replace function public.apply_payment(
  p_user uuid, p_plan text, p_cycle text, p_method text, p_provider_payment_id text, p_amount_cents integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare inserted integer; p public.profiles; base timestamptz; newend timestamptz; cur_eff text; v_list integer; v_code text;
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

  -- Pagou menos que a tabela e a conta tem cupom: foi com desconto do cupom.
  v_list := public.plan_price_cents(p_plan, p_cycle);
  if p.coupon_id is not null and p_amount_cents < v_list then
    update public.payments set coupon_id = p.coupon_id, discount_cents = v_list - greatest(p_amount_cents, 0)
     where provider_payment_id = p_provider_payment_id;
    select code into v_code from public.coupons where id = p.coupon_id;
    if v_code is not null then perform public.note_coupon(p_user, v_code); end if;
  end if;

  cur_eff := public.effective_plan(p.plan, false, p.plan_expires_at);
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

-- ---------------------------------------------------------------------------
-- Painel de gestão
-- ---------------------------------------------------------------------------
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
      'bonusImages', p.bonus_images,
      'coupon', (select code from public.coupons where id = p.coupon_id),
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
    select jsonb_agg(jsonb_build_object(
      'id', x.id, 'plan', x.plan, 'cycle', x.cycle, 'method', x.method, 'amountCents', x.amount_cents,
      'paidAt', x.paid_at, 'periodEnd', x.period_end, 'discountCents', x.discount_cents,
      'coupon', (select code from public.coupons where id = x.coupon_id)
    ) order by x.paid_at desc)
    from (select * from public.payments where user_id = p_user order by paid_at desc limit 20) x
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_set_bonus(p_user uuid, p_bonus integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare old integer;
begin
  perform public.admin_guard();
  if p_bonus is null or p_bonus < 0 or p_bonus > 10000 then raise exception 'bonus_invalido'; end if;
  select bonus_images into old from public.profiles where id = p_user for update;
  if not found then raise exception 'usuaria_inexistente'; end if;
  update public.profiles set bonus_images = p_bonus where id = p_user;
  insert into public.admin_audit (admin_id, user_id, action, detail)
  values (auth.uid(), p_user, 'set_bonus', jsonb_build_object('before', old, 'after', p_bonus));
end;
$$;

-- Novo parâmetro (gráficos de bônus no cadastro): troca a função antiga.
drop function public.admin_update_settings(integer, integer, integer, integer, integer);
create or replace function public.admin_update_settings(
  p_basic_cents integer, p_plus_cents integer, p_free_months integer, p_image_limit integer, p_grace_days integer, p_signup_bonus integer
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
         basic_image_limit = p_image_limit, grace_days = p_grace_days, signup_bonus_images = p_signup_bonus, updated_at = now();
  insert into public.admin_audit (admin_id, action, detail)
  values (auth.uid(), 'update_settings', jsonb_build_object(
    'basic', p_basic_cents, 'plus', p_plus_cents, 'freeMonths', p_free_months, 'imageLimit', p_image_limit,
    'graceDays', p_grace_days, 'signupBonus', p_signup_bonus));
end;
$$;

create or replace function public.admin_list_coupons()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'code', c.code, 'description', c.description, 'kind', c.kind, 'value', c.value,
      'plans', to_jsonb(c.plans), 'cycles', c.cycles, 'maxUses', c.max_uses, 'expiresAt', c.expires_at,
      'active', c.active, 'createdAt', c.created_at,
      'uses', (select count(distinct user_id) from public.payments where coupon_id = c.id),
      'attached', (select count(*) from public.profiles where coupon_id = c.id)
    ) order by c.created_at desc)
    from public.coupons c
  ), '[]'::jsonb);
end;
$$;

-- p_id nulo = cupom novo; com id = edita. O código é sempre guardado em MAIÚSCULAS.
create or replace function public.admin_save_coupon(
  p_id uuid, p_code text, p_description text, p_kind text, p_value integer,
  p_plans text[], p_cycles text, p_max_uses integer, p_expires timestamptz, p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_code text := upper(trim(coalesce(p_code, '')));
begin
  perform public.admin_guard();
  if v_code !~ '^[A-Z0-9_-]{3,32}$' then raise exception 'codigo_invalido'; end if;
  if p_kind not in ('percent', 'fixed') or p_value is null or p_value < 1 or (p_kind = 'percent' and p_value > 99) then
    raise exception 'desconto_invalido';
  end if;
  if p_id is null then
    insert into public.coupons (code, description, kind, value, plans, cycles, max_uses, expires_at, active)
    values (v_code, left(coalesce(p_description, ''), 120), p_kind, p_value, p_plans, coalesce(p_cycles, 'both'), p_max_uses, p_expires, coalesce(p_active, true))
    returning id into v_id;
  else
    update public.coupons
       set code = v_code, description = left(coalesce(p_description, ''), 120), kind = p_kind, value = p_value, plans = p_plans,
           cycles = coalesce(p_cycles, 'both'), max_uses = p_max_uses, expires_at = p_expires, active = coalesce(p_active, true)
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'cupom_inexistente'; end if;
  end if;
  insert into public.admin_audit (admin_id, action, detail)
  values (auth.uid(), 'save_coupon', jsonb_build_object('code', v_code, 'kind', p_kind, 'value', p_value, 'active', coalesce(p_active, true)));
  return v_id;
end;
$$;

-- Só apaga cupom que nunca foi pago; se já teve uso, desative (o histórico dos pagamentos continua).
create or replace function public.admin_delete_coupon(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_code text;
begin
  perform public.admin_guard();
  select code into v_code from public.coupons where id = p_id;
  if not found then raise exception 'cupom_inexistente'; end if;
  if exists (select 1 from public.payments where coupon_id = p_id) then raise exception 'cupom_em_uso'; end if;
  delete from public.coupons where id = p_id;
  insert into public.admin_audit (admin_id, action, detail) values (auth.uid(), 'delete_coupon', jsonb_build_object('code', v_code));
end;
$$;

-- ---------------------------------------------------------------------------
-- Quem pode chamar o quê
-- ---------------------------------------------------------------------------
revoke all on function
  public.coupon_discount(uuid, uuid, text, text, integer), public.note_coupon(uuid, text),
  public.redeem_coupon(text), public.checkout_price(text, text),
  public.admin_set_bonus(uuid, integer),
  public.admin_update_settings(integer, integer, integer, integer, integer, integer),
  public.admin_list_coupons(),
  public.admin_save_coupon(uuid, text, text, text, integer, text[], text, integer, timestamptz, boolean),
  public.admin_delete_coupon(uuid)
from public, anon, authenticated;

grant execute on function public.redeem_coupon(text), public.checkout_price(text, text) to authenticated;
grant execute on function
  public.admin_set_bonus(uuid, integer),
  public.admin_update_settings(integer, integer, integer, integer, integer, integer),
  public.admin_list_coupons(),
  public.admin_save_coupon(uuid, text, text, text, integer, text[], text, integer, timestamptz, boolean),
  public.admin_delete_coupon(uuid)
to authenticated;
-- coupon_discount e note_coupon: só as outras funções do banco (security definer) usam.
