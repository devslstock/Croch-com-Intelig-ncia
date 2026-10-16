-- Tramado: período grátis (teste) no cadastro.
-- Cada conta nova usa o plano Básico de graça por `trial_days` dias (configurável no painel; 0 = desligado).
-- Passado o prazo, a conta volta a "sem plano" e precisa assinar. O Plus continua só para quem assina.
-- Vale só para contas criadas depois de ligar; as que já existem não ganham período grátis.

alter table public.app_settings
  add column trial_days integer not null default 0 check (trial_days between 0 and 365);

alter table public.profiles
  add column trial_ends_at timestamptz;

-- ---------------------------------------------------------------------------
-- Plano que vale agora, contando o período grátis (Básico enquanto durar, sem tolerância extra)
-- ---------------------------------------------------------------------------
create or replace function public.account_plan(p public.profiles)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when public.effective_plan(p.plan, p.blocked, p.plan_expires_at) <> 'none' then public.effective_plan(p.plan, p.blocked, p.plan_expires_at)
    when not p.blocked and p.trial_ends_at is not null and p.trial_ends_at > now() then 'basic'
    else 'none'
  end
$$;
revoke all on function public.account_plan(public.profiles) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cadastro: bônus, cupom e período grátis
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_bonus integer; v_trial integer; v_code text; v_cid uuid;
begin
  select signup_bonus_images, trial_days into v_bonus, v_trial from public.app_settings;
  v_code := upper(trim(coalesce(new.raw_user_meta_data ->> 'coupon', '')));
  if v_code <> '' then
    select id into v_cid from public.coupons
     where code = v_code and active and (expires_at is null or expires_at > now());
  end if;

  insert into public.profiles (id, name, email, phone, bonus_images, coupon_id, trial_ends_at)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', ''), 120),
    left(new.email, 254),
    left(new.phone, 30),
    coalesce(v_bonus, 0),
    v_cid,
    case when coalesce(v_trial, 0) > 0 then now() + make_interval(days => v_trial) end
  )
  on conflict (id) do nothing;

  if v_cid is not null then perform public.note_coupon(new.id, v_code); end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Situação da conta (com o período grátis)
-- ---------------------------------------------------------------------------
create or replace function public.my_account()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare p public.profiles; s public.app_settings; c public.coupons; cj jsonb := null; v_trial boolean;
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
  -- Só conta como "em teste" quando o plano vem do período grátis (não de uma assinatura).
  v_trial := public.effective_plan(p.plan, p.blocked, p.plan_expires_at) = 'none' and public.account_plan(p) = 'basic';
  return jsonb_build_object(
    'plan', p.plan,
    'effective', public.account_plan(p),
    'expiresAt', p.plan_expires_at,
    'trialEndsAt', case when v_trial then p.trial_ends_at end,
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
      'signupBonusImages', s.signup_bonus_images,
      'trialDays', s.trial_days
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Cota de imagens: no período grátis vale o limite do Básico
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
  eff := public.account_plan(p);
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
-- Pagamento durante o teste: o período pago começa quando o teste termina (ninguém perde os dias grátis)
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
    if cur_eff = 'none' and p.trial_ends_at is not null and p.trial_ends_at > now() then base := p.trial_ends_at; end if;
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
      'effective', public.account_plan(p),
      'expiresAt', p.plan_expires_at,
      'trialEndsAt', case when public.effective_plan(p.plan, p.blocked, p.plan_expires_at) = 'none' and public.account_plan(p) = 'basic' then p.trial_ends_at end,
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

-- Novo parâmetro (dias de período grátis): troca a função anterior.
drop function public.admin_update_settings(integer, integer, integer, integer, integer, integer);
create or replace function public.admin_update_settings(
  p_basic_cents integer, p_plus_cents integer, p_free_months integer, p_image_limit integer, p_grace_days integer,
  p_signup_bonus integer, p_trial_days integer
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
         basic_image_limit = p_image_limit, grace_days = p_grace_days, signup_bonus_images = p_signup_bonus,
         trial_days = p_trial_days, updated_at = now()
   where id;
  insert into public.admin_audit (admin_id, action, detail)
  values (auth.uid(), 'update_settings', jsonb_build_object(
    'basic', p_basic_cents, 'plus', p_plus_cents, 'freeMonths', p_free_months, 'imageLimit', p_image_limit,
    'graceDays', p_grace_days, 'signupBonus', p_signup_bonus, 'trialDays', p_trial_days));
end;
$$;

revoke all on function public.admin_update_settings(integer, integer, integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_update_settings(integer, integer, integer, integer, integer, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Página pública: mostra os dias grátis
-- ---------------------------------------------------------------------------
create or replace function public.public_landing()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'prices', jsonb_build_object(
      'basicMonthlyCents', s.basic_monthly_cents,
      'plusMonthlyCents', s.plus_monthly_cents,
      'yearlyFreeMonths', s.yearly_free_months,
      'basicImageLimit', s.basic_image_limit,
      'signupBonusImages', s.signup_bonus_images,
      'trialDays', s.trial_days
    ),
    'config', jsonb_build_object('greeting', s.bot_greeting, 'fallback', s.bot_fallback, 'whatsapp', s.bot_whatsapp),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'question', i.question, 'answer', i.answer, 'keywords', i.keywords) order by i.sort, i.created_at)
      from public.chatbot_items i where i.active
    ), '[]'::jsonb)
  )
  from public.app_settings s
$$;

-- A resposta pronta "Posso testar antes de assinar?" passa a falar do período grátis (só se ainda for o texto original).
update public.chatbot_items
   set answer = '{{teste}} Ao criar a conta você também pode ganhar gráficos de presente para experimentar: {{bonus}}. Se tiver um cupom de desconto, é só digitar ao criar a conta ou na tela de assinatura.'
 where question = 'Posso testar antes de assinar?'
   and answer = 'Ao criar a conta você pode ganhar gráficos de presente para experimentar: {{bonus}}. Se tiver um cupom de desconto, é só digitar ao criar a conta ou na tela de assinatura.';
