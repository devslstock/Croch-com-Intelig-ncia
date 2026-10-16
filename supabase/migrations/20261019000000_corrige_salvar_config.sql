-- O Supabase barra UPDATE sem WHERE ("UPDATE requires a WHERE clause"), então "Salvar preços" e os textos do chatbot
-- falhavam no banco real. app_settings tem uma linha só (id = true): passa a ser filtrada explicitamente.

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
         basic_image_limit = p_image_limit, grace_days = p_grace_days, signup_bonus_images = p_signup_bonus, updated_at = now()
   where id;
  insert into public.admin_audit (admin_id, action, detail)
  values (auth.uid(), 'update_settings', jsonb_build_object(
    'basic', p_basic_cents, 'plus', p_plus_cents, 'freeMonths', p_free_months, 'imageLimit', p_image_limit,
    'graceDays', p_grace_days, 'signupBonus', p_signup_bonus));
end;
$$;

create or replace function public.admin_save_chatbot_config(p_greeting text, p_fallback text, p_whatsapp text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_wa text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
begin
  perform public.admin_guard();
  if char_length(trim(coalesce(p_greeting, ''))) not between 1 and 300 or char_length(trim(coalesce(p_fallback, ''))) not between 1 and 300 then
    raise exception 'texto_invalido';
  end if;
  if v_wa <> '' and v_wa !~ '^[0-9]{10,15}$' then raise exception 'whatsapp_invalido'; end if;
  update public.app_settings set bot_greeting = trim(p_greeting), bot_fallback = trim(p_fallback), bot_whatsapp = v_wa, updated_at = now()
   where id;
  insert into public.admin_audit (admin_id, action, detail) values (auth.uid(), 'save_chatbot_config', jsonb_build_object('whatsapp', v_wa <> ''));
end;
$$;
