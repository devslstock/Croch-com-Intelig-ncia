// Valida a migração num Postgres local (PGlite): tabelas, gatilhos, RLS e permissões.
// Uso: npm run test:db
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
const sql = readFileSync(new URL('../migrations/20261015000000_init_tramado.sql', import.meta.url), 'utf8')
const db = new PGlite()
let pass = 0, fail = 0
const ok = (name, cond) => { cond ? pass++ : fail++; console.log((cond ? 'OK   ' : 'FALHA'), name) }
const rejects = async (name, fn, re) => { try { await fn(); ok(name, false) } catch (e) { ok(`${name} → ${String(e.message).slice(0, 70)}`, re.test(e.message)) } }

// Cenário mínimo do Supabase: papéis, schema auth, auth.uid() e privilégios padrão.
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
`)
await db.exec(sql)
ok('migração aplicou sem erro', true)

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222'
await db.exec(`insert into auth.users (id, raw_user_meta_data) values ('${A}', '{"name":"Ana"}'), ('${B}', '{"full_name":"Bia Souza"}')`)
const prof = (await db.query('select id, name from public.profiles order by name')).rows
ok('perfil criado automaticamente com o nome', prof.length === 2 && prof[0].name === 'Ana' && prof[1].name === 'Bia Souza')

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
await rejects('usuária não muda o próprio plano', () => as(A, () => db.query(`update public.profiles set plan='pro' where id='${A}'`)), /permission denied/)
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
console.log(`\n${pass} ok, ${fail} falhas`)
process.exit(fail ? 1 : 0)
