-- Tramado: página "Saiba mais" (pública) e chatbot de dúvidas com respostas cadastradas no painel.
-- Aplicar DEPOIS de 20261017000000_cupons_bonus.sql. Veja supabase/README.md.
--
--   * public_landing(): única função que visitantes SEM login podem chamar. Devolve só o que é público:
--     preços, quantidade de gráficos de bônus, perguntas/respostas ativas do chatbot e os textos do robô.
--   * As respostas aceitam marcadores como {{basico_mensal}}; o app troca pelo preço atual do painel.

-- ---------------------------------------------------------------------------
-- Textos do robô (no mesmo registro dos preços)
-- ---------------------------------------------------------------------------
alter table public.app_settings
  add column bot_greeting text not null default 'Oi! Eu sou a assistente do Tramado. Escolha uma pergunta abaixo ou escreva a sua dúvida.'
    check (char_length(bot_greeting) between 1 and 300),
  add column bot_fallback text not null default 'Não encontrei essa resposta por aqui. Fale com a gente pelo WhatsApp e respondemos rapidinho.'
    check (char_length(bot_fallback) between 1 and 300),
  -- Só dígitos, com DDI (ex.: 5581999990000). Vazio = sem botão de WhatsApp.
  add column bot_whatsapp text not null default '' check (bot_whatsapp ~ '^([0-9]{10,15})?$');

-- ---------------------------------------------------------------------------
-- Perguntas e respostas
-- ---------------------------------------------------------------------------
create table public.chatbot_items (
  id         uuid primary key default gen_random_uuid(),
  question   text not null check (char_length(question) between 3 and 120),
  answer     text not null check (char_length(answer) between 1 and 1200),
  -- Palavras que ajudam o robô a achar esta resposta quando a pessoa digita (separadas por vírgula).
  keywords   text not null default '' check (char_length(keywords) <= 300),
  sort       integer not null default 100 check (sort between 0 and 10000),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.chatbot_items enable row level security;
revoke all on public.chatbot_items from anon, authenticated;
-- Sem policy: ninguém lê direto. Visitantes usam public_landing(); o painel usa as funções admin_*.

insert into public.chatbot_items (question, answer, keywords, sort) values
  ('Como o Tramado funciona?',
   'Você escolhe uma foto (ou um modelo pronto) e o Tramado transforma em um gráfico de crochê, com as carreiras numeradas, as cores separadas e a lista de fios. Depois dá para ajustar ponto a ponto e crochetar com o modo guiado, que mostra a carreira certa e conta os pontos para você.',
   'funciona, como, o que é, para que serve, usar', 10),
  ('Quanto custa?',
   'O plano Básico custa {{basico_mensal}} por mês ou {{basico_anual}} por ano (você paga {{meses_pagos}} meses e leva 12). O Plus custa {{plus_mensal}} por mês ou {{plus_anual}} por ano. Pode pagar com Pix ou cartão.',
   'preço, valor, custa, quanto, mensalidade, assinatura, pagar, caro', 20),
  ('Qual a diferença entre o Básico e o Plus?',
   'O Básico traz foto em gráfico, modelos prontos, editor, modo Crochetar e lista de fios, com até {{limite_basico}} imagens novas por mês. O Plus tem tudo isso com imagens ilimitadas e ainda inclui a Calculadora de preço e o Assistente de vendas, para quem vende as peças.',
   'diferença, básico, basico, plus, planos, plano, qual escolher, limite', 30),
  ('Preciso saber ler gráfico de crochê?',
   'Não. O modo Crochetar mostra a carreira atual, o lado em que ela vai e quantos pontos seguidos de cada cor você faz, e guarda o seu progresso. Dá para ir marcando conforme você crocheta.',
   'iniciante, aprender, ler gráfico, dificuldade, fácil, facil, sei crochê, sou nova', 40),
  ('As minhas fotos ficam guardadas?',
   'Não. A foto é processada no seu próprio aparelho e não é enviada nem guardada. Só o gráfico que você decidir salvar fica na sua conta.',
   'foto, privacidade, segurança, seguranca, dados, guardada, lgpd, enviada', 50),
  ('Quais fios e cores o Tramado usa?',
   'Hoje o Tramado trabalha com as cartelas DMC Mouline e Anchor Mouline: ele sugere a cor mais próxima para cada ponto, mostra opções parecidas para você trocar e monta a lista de compras. As cores são aproximadas: confira com o novelo na loja.',
   'fio, fios, linha, cartela, dmc, anchor, cores, novelo, lã, la, marca', 60),
  ('Funciona no celular?',
   'Sim, foi pensado primeiro para o celular. Também dá para instalar como aplicativo: no Android, o Chrome oferece "Instalar app"; no iPhone, use Compartilhar > Adicionar à Tela de Início.',
   'celular, telefone, app, aplicativo, android, iphone, instalar, computador', 70),
  ('Como faço para pagar? Posso cancelar?',
   'O pagamento é pelo Mercado Pago, com Pix ou cartão. No cartão mensal a cobrança renova sozinha e você cancela quando quiser pela sua conta do Mercado Pago (o acesso continua até o fim do período já pago). O Pix e o plano anual não renovam sozinhos: você paga de novo no vencimento.',
   'pagamento, pix, cartão, cartao, cancelar, cancelamento, renova, reembolso, mercado pago', 80),
  ('Posso testar antes de assinar?',
   'Ao criar a conta você pode ganhar gráficos de presente para experimentar: {{bonus}}. Se tiver um cupom de desconto, é só digitar ao criar a conta ou na tela de assinatura.',
   'testar, grátis, gratis, teste, experimentar, cupom, desconto, promoção, promocao', 90),
  ('O que é o Assistente de vendas?',
   'É uma ferramenta do plano Plus para quem vende peças de crochê: você cola a conversa com a cliente e ele sugere respostas prontas (preço, prazo, envio, desconto), que você edita e envia pelo WhatsApp. Funciona no seu aparelho, sem enviar a conversa para ninguém.',
   'assistente, vendas, vender, whatsapp, cliente, calculadora, preço da peça, preco da peca', 100);

-- ---------------------------------------------------------------------------
-- Visitantes sem login
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
      'signupBonusImages', s.signup_bonus_images
    ),
    'config', jsonb_build_object('greeting', s.bot_greeting, 'fallback', s.bot_fallback, 'whatsapp', s.bot_whatsapp),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'question', i.question, 'answer', i.answer, 'keywords', i.keywords) order by i.sort, i.created_at)
      from public.chatbot_items i where i.active
    ), '[]'::jsonb)
  )
  from public.app_settings s
$$;

-- ---------------------------------------------------------------------------
-- Painel de gestão do chatbot
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_chatbot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare s public.app_settings;
begin
  perform public.admin_guard();
  select * into s from public.app_settings;
  return jsonb_build_object(
    'config', jsonb_build_object('greeting', s.bot_greeting, 'fallback', s.bot_fallback, 'whatsapp', s.bot_whatsapp),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'question', i.question, 'answer', i.answer, 'keywords', i.keywords, 'sort', i.sort, 'active', i.active) order by i.sort, i.created_at)
      from public.chatbot_items i
    ), '[]'::jsonb)
  );
end;
$$;

-- p_id nulo = pergunta nova; com id = edita.
create or replace function public.admin_save_chatbot_item(
  p_id uuid, p_question text, p_answer text, p_keywords text, p_sort integer, p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_q text := trim(coalesce(p_question, '')); v_a text := trim(coalesce(p_answer, ''));
begin
  perform public.admin_guard();
  if char_length(v_q) < 3 or char_length(v_q) > 120 then raise exception 'pergunta_invalida'; end if;
  if char_length(v_a) < 1 or char_length(v_a) > 1200 then raise exception 'resposta_invalida'; end if;
  if p_id is null then
    insert into public.chatbot_items (question, answer, keywords, sort, active)
    values (v_q, v_a, left(coalesce(p_keywords, ''), 300), coalesce(p_sort, 100), coalesce(p_active, true))
    returning id into v_id;
  else
    update public.chatbot_items
       set question = v_q, answer = v_a, keywords = left(coalesce(p_keywords, ''), 300), sort = coalesce(p_sort, 100), active = coalesce(p_active, true)
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'item_inexistente'; end if;
  end if;
  insert into public.admin_audit (admin_id, action, detail)
  values (auth.uid(), 'save_chatbot_item', jsonb_build_object('question', left(v_q, 80), 'active', coalesce(p_active, true)));
  return v_id;
end;
$$;

create or replace function public.admin_delete_chatbot_item(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_q text;
begin
  perform public.admin_guard();
  delete from public.chatbot_items where id = p_id returning question into v_q;
  if v_q is null then raise exception 'item_inexistente'; end if;
  insert into public.admin_audit (admin_id, action, detail)
  values (auth.uid(), 'delete_chatbot_item', jsonb_build_object('question', left(v_q, 80)));
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
  update public.app_settings set bot_greeting = trim(p_greeting), bot_fallback = trim(p_fallback), bot_whatsapp = v_wa, updated_at = now();
  insert into public.admin_audit (admin_id, action, detail) values (auth.uid(), 'save_chatbot_config', jsonb_build_object('whatsapp', v_wa <> ''));
end;
$$;

-- ---------------------------------------------------------------------------
-- Quem pode chamar o quê
-- ---------------------------------------------------------------------------
revoke all on function
  public.public_landing(), public.admin_list_chatbot(),
  public.admin_save_chatbot_item(uuid, text, text, text, integer, boolean),
  public.admin_delete_chatbot_item(uuid), public.admin_save_chatbot_config(text, text, text)
from public, anon, authenticated;

-- A única porta aberta para quem não fez login:
grant execute on function public.public_landing() to anon, authenticated;
grant execute on function
  public.admin_list_chatbot(),
  public.admin_save_chatbot_item(uuid, text, text, text, integer, boolean),
  public.admin_delete_chatbot_item(uuid), public.admin_save_chatbot_config(text, text, text)
to authenticated;
