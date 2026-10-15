-- Tramado: estrutura inicial (perfis e gráficos salvos).
-- Aplicar em um projeto Supabase DEDICADO ao Tramado (veja supabase/README.md).
-- Idempotente o bastante para rodar uma vez em projeto novo; não apague tabelas de outros apps.

-- ---------------------------------------------------------------------------
-- Funções auxiliares
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: 1 linha por usuária (Auth)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  name         text not null default '' check (char_length(name) <= 120),
  city         text check (char_length(city) <= 120),
  uf           text check (char_length(uf) = 2),
  -- Lado em que a carreira 1 começa: destra = direita, canhota = esquerda.
  reading_side text not null default 'right' check (reading_side in ('right', 'left')),
  plan         text not null default 'free' check (plan in ('free', 'plus', 'pro')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Cria o perfil automaticamente quando a usuária se cadastra.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', ''), 120)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- charts: gráficos salvos ("Meus gráficos")
-- ---------------------------------------------------------------------------
create table public.charts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 120),
  width      smallint not null check (width between 1 and 150),
  height     smallint not null check (height between 1 and 1000),
  -- Índices de cor, linha a linha, em base64 (70 × 90 pontos ≈ 8 KB).
  grid       text not null check (char_length(grid) <= 300000),
  -- [{ letter, symbol, hex, count }, ...]
  palette    jsonb not null check (jsonb_typeof(palette) = 'array' and jsonb_array_length(palette) between 1 and 30),
  -- Tabela de fios usada (ex.: "DMC__Mouline"); vazio = cores livres.
  yarn_id    text not null default '' check (char_length(yarn_id) <= 120),
  -- Fios trocados à mão: { "A": "310" }.
  picked     jsonb not null default '{}'::jsonb check (jsonb_typeof(picked) = 'object'),
  start_side text not null default 'right' check (start_side in ('right', 'left')),
  -- Modo Crochetar: carreiras já feitas (de baixo para cima).
  progress   smallint not null default 0 check (progress between 0 and 1000),
  -- Modo Crochetar: pontos já feitos na carreira atual.
  progress_stitch smallint not null default 0 check (progress_stitch between 0 and 150),
  origin     text not null default 'foto' check (origin in ('foto', 'modelo', 'branco')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index charts_user_created_idx on public.charts (user_id, created_at desc);

create trigger charts_set_updated_at
  before update on public.charts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Segurança: cada usuária só enxerga e altera o que é dela (RLS)
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.charts   enable row level security;

-- Visitantes sem login não acessam nada.
revoke all on public.profiles from anon;
revoke all on public.charts   from anon;

create policy "profiles: ler o próprio"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "profiles: atualizar o próprio"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "charts: ler os próprios"
  on public.charts for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "charts: criar os próprios"
  on public.charts for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "charts: atualizar os próprios"
  on public.charts for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "charts: apagar os próprios"
  on public.charts for delete to authenticated
  using ((select auth.uid()) = user_id);

-- A usuária edita só estes campos do perfil. 'plan' (e 'id') só mudam pelo servidor
-- (webhook de pagamento com service_role), nunca pelo app.
-- Atenção: retirar a permissão de uma única coluna NÃO funciona quando a tabela toda já está liberada;
-- por isso se retira o UPDATE da tabela e se libera coluna por coluna.
revoke update on public.profiles from authenticated;
grant update (name, city, uf, reading_side) on public.profiles to authenticated;
