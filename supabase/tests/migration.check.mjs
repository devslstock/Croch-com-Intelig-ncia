// Valida a migração num Postgres local (PGlite): tabelas, gatilhos, RLS e permissões.
// Uso: npm run test:db
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
const sql = readFileSync(new URL('../migrations/20261015000000_init_tramado.sql', import.meta.url), 'utf8')
const sqlBilling = readFileSync(new URL('../migrations/20261016000000_assinaturas.sql', import.meta.url), 'utf8')
const db = new PGlite()
let pass = 0, fail = 0
const ok = (name, cond) => { cond ? pass++ : fail++; console.log((cond ? 'OK   ' : 'FALHA'), name) }
const rejects = async (name, fn, re) => { try { await fn(); ok(name, false) } catch (e) { ok(`${name} → ${String(e.message).slice(0, 70)}`, re.test(e.message)) } }

// Cenário mínimo do Supabase: papéis, schema auth, auth.uid() e privilégios padrão.
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb default '{}'::jsonb, email text, phone text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
`)
await db.exec(sql)
ok('migração inicial aplicou sem erro', true)
await db.exec(sqlBilling)
ok('migração de assinaturas aplicou sem erro', true)

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222'
await db.exec(`insert into auth.users (id, raw_user_meta_data) values ('${A}', '{"name":"Ana"}'), ('${B}', '{"full_name":"Bia Souza"}')`)
const prof = (await db.query('select id, name from public.profiles order by name')).rows
ok('perfil criado automaticamente com o nome', prof.length === 2 && prof[0].name === 'Ana' && prof[1].name === 'Bia Souza')

// Planos de teste: A e B com Plus (sem limite) para os testes antigos.
await db.exec(`update public.profiles set plan='plus', plan_expires_at=null`)
const as = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}', false)`); try { return await fn() } finally { await db.exec('reset role') } }
const chart = (extra = '') => `insert into public.charts (name,width,height,grid,palette ${extra ? ',' + extra.split('=')[0] : ''}) values ('Retrato',3,2,'AAECAgEA','[{"letter":"A","symbol":"●","hex":"#ffffff","count":6}]'::jsonb ${extra ? ',' + extra.split('=')[1] : ''}) returning id, user_id`

const a = await as(A, async () => (await db.query(chart())).rows[0])
ok('usuária A cria gráfico e user_id vem de auth.uid()', a.user_id === A)
ok('A enxerga o próprio gráfico', (await as(A, () => db.query('select * from public.charts'))).rows.length === 1)
ok('B NÃO enxerga o gráfico de A', (await as(B, () => db.query('select * from public.charts'))).rows.length === 0)
await as(B, () => db.query(`update public.charts set name='hack' where id='${a.id}'`))
await as(B, () => db.query(`delete from public.charts where id='${a.id}'`))
ok('B não altera nem apaga o gráfico de A', (await db.query('select name from public.charts')).rows[0].name === 'Retrato')
await rejects('B não cria gráfico em nome de A', () => as(B, () => db.query(`insert into public.charts (user_id,name,width,height,grid,palette) values ('${A}','x',1,1,'A','[{}]'::jsonb)`)), /row-level security/)
await rejects('anônimo não lê gráficos', async () => { await db.exec('set role anon'); try { await db.query('select * from public.charts') } finally { await db.exec('reset role') } }, /permission denied/)
await rejects('usuária não muda o próprio plano', () => as(A, () => db.query(`update public.profiles set plan='plus' where id='${A}'`)), /permission denied/)
await as(A, () => db.query(`update public.profiles set city='Recife', uf='PE' where id='${A}'`))
ok('usuária edita o próprio perfil', (await db.query(`select city from public.profiles where id='${A}'`)).rows[0].city === 'Recife')
await rejects('largura acima de 150 é recusada', () => as(A, () => db.query(`insert into public.charts (name,width,height,grid,palette) values ('x',200,2,'A','[{}]'::jsonb)`)), /check constraint/)
await rejects('paleta vazia é recusada', () => as(A, () => db.query(`insert into public.charts (name,width,height,grid,palette) values ('x',3,2,'A','[]'::jsonb)`)), /check constraint/)
const before = (await db.query(`select updated_at from public.charts where id='${a.id}'`)).rows[0].updated_at
await new Promise((r) => setTimeout(r, 20))
await as(A, () => db.query(`update public.charts set name='Novo nome' where id='${a.id}'`))
const after = (await db.query(`select updated_at from public.charts where id='${a.id}'`)).rows[0].updated_at
ok('updated_at é atualizado sozinho', after > before)
await db.exec(`delete from auth.users where id='${A}'`)
ok('apagar a conta apaga perfil e gráficos (cascade)', (await db.query(`select count(*)::int n from public.charts where user_id='${A}'`)).rows[0].n === 0 && (await db.query(`select count(*)::int n from public.profiles where id='${A}'`)).rows[0].n === 0)

// ---------------------------------------------------------------------------
// Assinaturas
// ---------------------------------------------------------------------------
const C = '33333333-3333-4333-8333-333333333333', ADM = '44444444-4444-4444-8444-444444444444'
await db.exec(`insert into auth.users (id, raw_user_meta_data, email, phone) values ('${C}', '{"name":"Carla"}', 'carla@ex.com', null), ('${ADM}', '{"name":"Dona"}', 'dona@ex.com', null)`)
const prof2 = (await db.query(`select plan, email, blocked, is_admin from public.profiles where id='${C}'`)).rows[0]
ok('cadastro novo começa sem plano, com e-mail copiado', prof2.plan === 'none' && prof2.email === 'carla@ex.com' && !prof2.blocked && !prof2.is_admin)
const newChart = (n = 'x') => `insert into public.charts (name,width,height,grid,palette) values ('${n}',3,2,'AA','[{"letter":"A","symbol":"●","hex":"#ffffff","count":6}]'::jsonb) returning id`
await rejects('sem assinatura não cria gráfico', () => as(C, () => db.query(newChart())), /assinatura_inativa/)

const price = async (p, c) => (await db.query(`select public.plan_price_cents('${p}','${c}') v`)).rows[0].v
ok('anual = 10 mensalidades (2 de desconto)', (await price('basic', 'yearly')) === 19900 && (await price('plus', 'yearly')) === 39900 && (await price('basic', 'monthly')) === 1990)

const pay = async (id, plan, cycle, method = 'card', user = C) => (await db.query(`select public.apply_payment('${user}','${plan}','${cycle}','${method}','${id}',1990) r`)).rows[0].r
const r1 = await pay('mp-1', 'basic', 'monthly')
ok('pagamento aprovado ativa o Básico por 1 mês', r1.applied === true)
ok('pagamento repetido (mesmo id) é ignorado', (await pay('mp-1', 'basic', 'monthly')).applied === false)
ok('só 1 pagamento gravado', (await db.query(`select count(*)::int n from public.payments where user_id='${C}'`)).rows[0].n === 1)
const exp1 = (await db.query(`select plan_expires_at e, extract(day from plan_expires_at - now())::int d from public.profiles where id='${C}'`)).rows[0]
ok('vencimento fica ~1 mês à frente', exp1.d >= 27 && exp1.d <= 31)
await pay('mp-2', 'basic', 'monthly')
const exp2 = (await db.query(`select extract(day from plan_expires_at - now())::int d from public.profiles where id='${C}'`)).rows[0]
ok('renovação antecipada soma ao vencimento atual', exp2.d >= 57 && exp2.d <= 62)

for (let i = 0; i < 12; i++) await as(C, () => db.query(newChart(`g${i}`)))
ok('Básico cria 12 imagens', (await db.query(`select count(*)::int n from public.charts where user_id='${C}'`)).rows[0].n === 12)
await rejects('a 13ª imagem do mês é recusada', () => as(C, () => db.query(newChart('g13'))), /limite_mensal/)
const first = (await db.query(`select id from public.charts where user_id='${C}' limit 1`)).rows[0].id
await as(C, () => db.query(`insert into public.charts (id,name,width,height,grid,palette) values ('${first}','editado',3,2,'AA','[{"letter":"A","symbol":"●","hex":"#ffffff","count":6}]'::jsonb) on conflict (id) do update set name=excluded.name`))
ok('editar um gráfico existente (upsert) não gasta cota nem é bloqueado', (await db.query(`select name from public.charts where id='${first}'`)).rows[0].name === 'editado')
await db.exec(`delete from public.charts where user_id='${C}'`)
await rejects('apagar gráficos não devolve a cota do mês', () => as(C, () => db.query(newChart('g14'))), /limite_mensal/)
const acc = (await as(C, () => db.query('select public.my_account() a'))).rows[0].a
ok('my_account mostra uso e limite', acc.imagesUsed === 12 && acc.prices.basicImageLimit === 12 && acc.effective === 'basic' && acc.isAdmin === false)

await pay('mp-3', 'plus', 'monthly')
const up = (await db.query(`select plan, extract(day from plan_expires_at - now())::int d from public.profiles where id='${C}'`)).rows[0]
ok('subir para Plus conta a partir de hoje (não soma o Básico)', up.plan === 'plus' && up.d >= 27 && up.d <= 31)
await as(C, () => db.query(newChart('ilimitado')))
ok('Plus não tem limite de imagens', true)

await db.exec(`update public.profiles set plan_expires_at = now() - interval '10 days' where id='${C}'`)
await rejects('vencido além da tolerância perde o acesso sozinho', () => as(C, () => db.query(newChart('v'))), /assinatura_inativa/)
await db.exec(`update public.profiles set plan_expires_at = now() - interval '1 day' where id='${C}'`)
await as(C, () => db.query(newChart('tolerancia')))
ok('dentro dos dias de tolerância ainda tem acesso', true)
await db.exec(`update public.profiles set plan_expires_at = null, blocked = true where id='${C}'`)
await rejects('usuária bloqueada perde o acesso mesmo com plano', () => as(C, () => db.query(newChart('b'))), /assinatura_inativa/)
await db.exec(`update public.profiles set blocked = false where id='${C}'`)

await rejects('usuária não chama apply_payment', () => as(C, () => db.query(`select public.apply_payment('${C}','plus','yearly','pix','hack',0)`)), /permission denied/)
await rejects('usuária não vira admin', () => as(C, () => db.query(`update public.profiles set is_admin=true where id='${C}'`)), /permission denied/)
await rejects('usuária não se desbloqueia nem muda vencimento', () => as(C, () => db.query(`update public.profiles set plan_expires_at=now()+interval '99 years' where id='${C}'`)), /permission denied/)
await rejects('usuária não altera preços', () => as(C, () => db.query(`update public.app_settings set basic_monthly_cents=1`)), /permission denied/)
await rejects('usuária não lê o log de auditoria', () => as(C, () => db.query('select * from public.admin_audit')), /permission denied/)
await rejects('usuária comum não usa o painel', () => as(C, () => db.query('select public.admin_list_users()')), /sem_permissao/)
ok('usuária comum não vê pagamentos de outras', (await as(A, () => db.query('select * from public.payments'))).rows.length === 0)

await db.exec(`update public.profiles set is_admin=true where id='${ADM}'`)
await db.exec(`update public.profiles set plan_expires_at = now() + interval '5 days' where id='${C}'`)
const list = (await as(ADM, () => db.query(`select public.admin_list_users('carla') l`))).rows[0].l
ok('admin lista e busca usuárias', list.length === 1 && list[0].email === 'carla@ex.com' && list[0].lastPaymentAt)
await as(ADM, () => db.query(`select public.admin_update_user('${C}','plus', null, false, 'cortesia')`))
const edited = (await db.query(`select plan, plan_expires_at, pay_method from public.profiles where id='${C}'`)).rows[0]
ok('admin concede Plus sem vencimento (marca como manual)', edited.plan === 'plus' && edited.plan_expires_at === null && edited.pay_method === 'manual')
await as(ADM, () => db.query(`select public.admin_update_user('${C}','plus', null, true, '')`))
ok('admin bloqueia e a conta perde o acesso', (await as(C, () => db.query('select public.my_account() a'))).rows[0].a.effective === 'none')
const st = (await as(ADM, () => db.query('select public.admin_stats() s'))).rows[0].s
ok('estatísticas do painel', st.users >= 3 && st.blocked === 1 && st.revenue30dCents === 5970)
const audit = (await as(ADM, () => db.query('select public.admin_audit_list() a'))).rows[0].a
ok('mudanças manuais ficam registradas', audit.length === 2 && audit[0].detail.after.blocked === true)
await as(ADM, () => db.query(`select public.admin_update_settings(2490, 4990, 2, 15, 3)`))
ok('admin muda preços e limite', (await price('plus', 'monthly')) === 4990 && (await price('plus', 'yearly')) === 49900)
await rejects('plano inválido é recusado', () => as(ADM, () => db.query(`select public.admin_update_user('${C}','vip', null, false, '')`)), /plano_invalido/)

console.log(`\n${pass} ok, ${fail} falhas`)
process.exit(fail ? 1 : 0)
