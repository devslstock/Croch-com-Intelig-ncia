// Valida a migração num Postgres local (PGlite): tabelas, gatilhos, RLS e permissões.
// Uso: npm run test:db
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
const sql = readFileSync(new URL('../migrations/20261015000000_init_tramado.sql', import.meta.url), 'utf8')
const sqlBilling = readFileSync(new URL('../migrations/20261016000000_assinaturas.sql', import.meta.url), 'utf8')
const sqlCoupons = readFileSync(new URL('../migrations/20261017000000_cupons_bonus.sql', import.meta.url), 'utf8')
const sqlLanding = readFileSync(new URL('../migrations/20261018000000_landing_chatbot.sql', import.meta.url), 'utf8')
const sqlFix = readFileSync(new URL('../migrations/20261019000000_corrige_salvar_config.sql', import.meta.url), 'utf8')
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
await db.exec(sqlCoupons)
ok('migração de cupons e bônus aplicou sem erro', true)
await db.exec(sqlLanding)
ok('migração da página pública e chatbot aplicou sem erro', true)
await db.exec(sqlFix)
ok('migração de correção do salvar config aplicou sem erro', true)

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
await as(ADM, () => db.query(`select public.admin_update_settings(2490, 4990, 2, 15, 3, 0)`))
ok('admin muda preços e limite', (await price('plus', 'monthly')) === 4990 && (await price('plus', 'yearly')) === 49900)
await rejects('plano inválido é recusado', () => as(ADM, () => db.query(`select public.admin_update_user('${C}','vip', null, false, '')`)), /plano_invalido/)

// ---------------------------------------------------------------------------
// Bônus de cadastro
// ---------------------------------------------------------------------------
const U = (n) => `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}`
const D = U(5), E = U(6), F = U(7), G = U(8), H = U(9), I = U('a'), J = U('b'), K = U('c')
const adm = (sql) => as(ADM, () => db.query(sql))
const addUser = (id, name, meta = {}) => db.exec(`insert into auth.users (id, raw_user_meta_data, email) values ('${id}', '${JSON.stringify({ name, ...meta })}', '${name.toLowerCase()}@ex.com')`)
const profile = async (id) => (await db.query(`select * from public.profiles where id='${id}'`)).rows[0]
const noteOf = async (id) => (await db.query(`select note from public.admin_notes where user_id='${id}'`)).rows[0]?.note ?? ''

await addUser(D, 'Dora')
ok('com bônus 0 a conta nasce sem gráficos de presente', (await profile(D)).bonus_images === 0)
await adm(`select public.admin_update_settings(2490, 4990, 2, 15, 3, 3)`)
ok('admin define bônus de cadastro', (await db.query(`select signup_bonus_images n from public.app_settings`)).rows[0].n === 3)
await addUser(E, 'Eva')
ok('conta nova recebe o bônus configurado; antigas não mudam', (await profile(E)).bonus_images === 3 && (await profile(D)).bonus_images === 0)
await rejects('sem plano e sem bônus continua bloqueada', () => as(D, () => db.query(newChart())), /assinatura_inativa/)
for (let i = 0; i < 3; i++) await as(E, () => db.query(newChart(`b${i}`)))
ok('sem plano, o bônus libera 3 gráficos', (await db.query(`select count(*)::int n from public.charts where user_id='${E}'`)).rows[0].n === 3)
await rejects('acabou o bônus: volta a exigir assinatura', () => as(E, () => db.query(newChart('b4'))), /assinatura_inativa/)
const accE = (await as(E, () => db.query('select public.my_account() a'))).rows[0].a
ok('my_account mostra bônus restante e preços com o bônus', accE.bonusImages === 0 && accE.prices.signupBonusImages === 3)

// Básico que esgotou a cota do mês usa o bônus; Plus não gasta bônus.
await db.exec(`update public.profiles set plan='basic', plan_expires_at=now()+interval '10 days', images_month=public.current_month(), images_count=15, bonus_images=2 where id='${E}'`)
await as(E, () => db.query(newChart('x1'))); await as(E, () => db.query(newChart('x2')))
ok('Básico sem cota usa o bônus', (await profile(E)).bonus_images === 0)
await rejects('Básico sem cota e sem bônus: limite do mês', () => as(E, () => db.query(newChart('x3'))), /limite_mensal/)
await db.exec(`update public.profiles set plan='plus', bonus_images=2 where id='${E}'`)
await as(E, () => db.query(newChart('p1')))
ok('Plus não gasta o bônus', (await profile(E)).bonus_images === 2)
await db.exec(`update public.profiles set plan='none', plan_expires_at=null, blocked=true, bonus_images=5 where id='${E}'`)
await rejects('conta desativada não usa o bônus', () => as(E, () => db.query(newChart('blk'))), /assinatura_inativa/)
await db.exec(`update public.profiles set blocked=false where id='${E}'`)
await adm(`select public.admin_set_bonus('${D}', 4)`)
ok('admin dá bônus a uma pessoa', (await profile(D)).bonus_images === 4)
await rejects('bônus negativo é recusado', () => adm(`select public.admin_set_bonus('${D}', -1)`), /bonus_invalido/)
await rejects('usuária comum não mexe no bônus', () => as(D, () => db.query(`select public.admin_set_bonus('${D}', 99)`)), /sem_permissao/)
await rejects('usuária não edita o próprio bônus', () => as(D, () => db.query(`update public.profiles set bonus_images=99 where id='${D}'`)), /permission denied/)

// ---------------------------------------------------------------------------
// Cupons
// ---------------------------------------------------------------------------
const saveCoupon = (code, kind, value, plans = "array['basic','plus']", cycles = 'both', max = 'null', exp = 'null', active = 'true', desc = '') =>
  adm(`select public.admin_save_coupon(null, '${code}', '${desc}', '${kind}', ${value}, ${plans}, '${cycles}', ${max}, ${exp}, ${active}) id`)
const c1 = (await saveCoupon('bemvinda10', 'percent', 10, undefined, undefined, 'null', 'null', 'true', 'Boas-vindas')).rows[0].id
ok('cupom é guardado em MAIÚSCULAS', (await db.query(`select code from public.coupons where id='${c1}'`)).rows[0].code === 'BEMVINDA10')
await rejects('código repetido é recusado', () => saveCoupon('BEMVINDA10', 'percent', 5), /duplicate key|unique/)
await rejects('código com espaço/curto é recusado', () => saveCoupon('a b', 'percent', 5), /codigo_invalido/)
await rejects('desconto de 100% é recusado', () => saveCoupon('GRATIS', 'percent', 100), /desconto_invalido/)
await rejects('desconto zero é recusado', () => saveCoupon('ZERO', 'fixed', 0), /desconto_invalido/)
await rejects('usuária comum não cria cupom', () => as(D, () => db.query(`select public.admin_save_coupon(null,'HACK','','percent',99,array['basic'],'both',null,null,true)`)), /sem_permissao/)
await rejects('usuária comum não lê a tabela de cupons', () => as(D, () => db.query('select * from public.coupons')), /permission denied/)
await rejects('usuária comum não lista cupons', () => as(D, () => db.query('select public.admin_list_coupons()')), /sem_permissao/)
await rejects('usuária não chama a regra interna do cupom', () => as(D, () => db.query(`select public.coupon_discount('${c1}','${D}','plus','yearly',49900)`)), /permission denied/)
await rejects('usuária não escreve na anotação por fora', () => as(D, () => db.query(`select public.note_coupon('${D}','X')`)), /permission denied/)
await rejects('usuária não troca o próprio cupom por update', () => as(D, () => db.query(`update public.profiles set coupon_id='${c1}' where id='${D}'`)), /permission denied/)

// Cupom informado no cadastro
await addUser(F, 'Fabi', { coupon: ' bemvinda10 ' })
ok('cupom do cadastro é associado (ignora caixa e espaços)', (await profile(F)).coupon_id === c1)
ok('anotação diz qual cupom foi usado', (await noteOf(F)) === 'Cupom usado: BEMVINDA10')
const fl = (await adm(`select public.admin_list_users('fabi') l`)).rows[0].l[0]
ok('painel mostra o cupom e a anotação da conta', fl.coupon === 'BEMVINDA10' && fl.note === 'Cupom usado: BEMVINDA10')
await addUser(G, 'Gabi', { coupon: 'NAOEXISTE' })
ok('cupom inválido no cadastro é ignorado (sem anotação)', (await profile(G)).coupon_id === null && (await noteOf(G)) === '')

// Preço com desconto, calculado no banco
const cp = async (uid, plan, cycle) => (await as(uid, () => db.query(`select public.checkout_price('${plan}','${cycle}') r`))).rows[0].r
const pr = await cp(F, 'plus', 'yearly')
ok('Plus anual com 10%: 49.900 → 44.910', pr.listCents === 49900 && pr.discountCents === 4990 && pr.finalCents === 44910 && pr.coupon === 'BEMVINDA10')
const noCp = await cp(G, 'plus', 'yearly')
ok('sem cupom o preço é o da tabela', noCp.finalCents === 49900 && noCp.coupon === null)
const myAcc = (await as(F, () => db.query('select public.my_account() a'))).rows[0].a
ok('my_account traz o cupom da conta', myAcc.coupon?.code === 'BEMVINDA10' && myAcc.coupon.kind === 'percent' && myAcc.coupon.value === 10)

const c2 = (await saveCoupon('MENOS5', 'fixed', 500, "array['basic']", 'monthly')).rows[0].id
await as(G, () => db.query(`select public.redeem_coupon('menos5')`))
ok('cupom fixo vale só no plano e período certos', (await cp(G, 'basic', 'monthly')).finalCents === 1990 && (await cp(G, 'plus', 'monthly')).discountCents === 0 && (await cp(G, 'basic', 'yearly')).discountCents === 0)
await saveCoupon('QUASEGRATIS', 'fixed', 99999)
await as(G, () => db.query(`select public.redeem_coupon('QUASEGRATIS')`))
ok('o preço final nunca fica abaixo de R$ 1,00', (await cp(G, 'basic', 'monthly')).finalCents === 100)

// Resgate pela tela de assinatura
await addUser(H, 'Helo')
const bad = (await as(H, () => db.query(`select public.redeem_coupon('xxxxx') r`))).rows[0].r
ok('código errado devolve erro (sem exceção)', bad.ok === false && bad.error === 'cupom_invalido')
const good = (await as(H, () => db.query(`select public.redeem_coupon('BemVinda10') r`))).rows[0].r
ok('código certo associa o cupom', good.ok === true && good.coupon.code === 'BEMVINDA10' && (await profile(H)).coupon_id === c1)
ok('anotação registra o cupom', (await noteOf(H)) === 'Cupom usado: BEMVINDA10')
await as(H, () => db.query(`select public.redeem_coupon('MENOS5')`))
ok('um segundo cupom acrescenta outra linha', (await noteOf(H)) === 'Cupom usado: BEMVINDA10\nCupom usado: MENOS5')
await as(H, () => db.query(`select public.redeem_coupon('MENOS5')`))
ok('o mesmo cupom não repete a linha', (await noteOf(H)).split('\n').length === 2)
await addUser(I, 'Ivo')
for (let i = 0; i < 8; i++) await as(I, () => db.query(`select public.redeem_coupon('errado${i}')`))
ok('depois de 8 erros seguidos, trava mesmo com código certo', (await as(I, () => db.query(`select public.redeem_coupon('BEMVINDA10') r`))).rows[0].r.error === 'muitas_tentativas')

// Cupom inativo / vencido
await saveCoupon('PAUSADO', 'percent', 20, undefined, undefined, 'null', 'null', 'false')
await saveCoupon('VENCIDO', 'percent', 20, undefined, undefined, 'null', `now() - interval '1 day'`)
await addUser(J, 'Joel')
ok('cupom inativo não vale', (await as(J, () => db.query(`select public.redeem_coupon('PAUSADO') r`))).rows[0].r.ok === false)
ok('cupom vencido não vale', (await as(J, () => db.query(`select public.redeem_coupon('VENCIDO') r`))).rows[0].r.ok === false)

// Pagamento aprovado registra o cupom (aqui: 1.990 pagos num plano que custa 49.900)
await pay('mp-c1', 'plus', 'yearly', 'pix', F)
const fp = (await db.query(`select coupon_id, discount_cents from public.payments where user_id='${F}'`)).rows[0]
ok('pagamento com cupom grava cupom e desconto', fp.coupon_id === c1 && fp.discount_cents === 49900 - 1990)
const adminPay = (await adm(`select public.admin_payments('${F}') p`)).rows[0].p
ok('painel mostra o cupom no pagamento', adminPay[0].coupon === 'BEMVINDA10' && adminPay[0].discountCents === 47910)
await db.query(`select public.apply_payment('${G}','basic','monthly','pix','mp-full',2490)`)
ok('pagar o preço cheio não conta como cupom', (await db.query(`select coupon_id from public.payments where provider_payment_id='mp-full'`)).rows[0].coupon_id === null)

// Limite de pessoas
const c4 = (await saveCoupon('SOUMA', 'percent', 50, undefined, undefined, '1')).rows[0].id
await db.exec(`update public.profiles set coupon_id='${c4}' where id='${J}'`)
await db.query(`select public.apply_payment('${J}','basic','monthly','pix','mp-j',1245)`)
ok('cupom de uso único: 1ª pessoa paga com desconto', (await db.query(`select coupon_id from public.payments where provider_payment_id='mp-j'`)).rows[0].coupon_id === c4)
await addUser(K, 'Kau')
ok('depois do limite, outra pessoa não resgata', (await as(K, () => db.query(`select public.redeem_coupon('SOUMA') r`))).rows[0].r.ok === false)
await db.exec(`update public.profiles set coupon_id='${c4}' where id='${K}'`)
ok('depois do limite, o desconto some para quem ainda não usou', (await cp(K, 'basic', 'monthly')).discountCents === 0)
ok('quem já usou continua tendo desconto (renovação)', (await cp(J, 'basic', 'monthly')).discountCents === 1245)

// Lista e exclusão
const lst = (await adm(`select public.admin_list_coupons() l`)).rows[0].l
const bv = lst.find((x) => x.code === 'BEMVINDA10')
ok('painel lista cupons com usos e contas associadas', bv.uses === 1 && bv.attached === 1 && lst.length >= 6)
await adm(`select public.admin_delete_coupon('${c2}')`)
ok('apaga cupom sem pagamentos', (await db.query(`select count(*)::int n from public.coupons where id='${c2}'`)).rows[0].n === 0)
await rejects('cupom já usado em pagamento não pode ser apagado', () => adm(`select public.admin_delete_coupon('${c1}')`), /cupom_em_uso/)
const au = (await adm(`select public.admin_audit_list(50) a`)).rows[0].a.map((x) => x.action)
ok('criação de cupom e bônus ficam no histórico', au.includes('save_coupon') && au.includes('set_bonus') && au.includes('delete_coupon'))

// ---------------------------------------------------------------------------
// Página pública ("Saiba mais") e chatbot
// ---------------------------------------------------------------------------
const asAnon = async (fn) => { await db.exec('set role anon'); try { return await fn() } finally { await db.exec('reset role') } }
const pub = (await asAnon(() => db.query('select public.public_landing() r'))).rows[0].r
ok('visitante sem login lê preços, bônus, textos e perguntas ativas', pub.prices.basicMonthlyCents === 2490 && pub.prices.signupBonusImages === 3 && pub.items.length === 10 && /assistente/i.test(pub.config.greeting))
ok('a função pública não expõe nada além disso', JSON.stringify(Object.keys(pub).sort()) === '["config","items","prices"]' && !JSON.stringify(pub).includes('is_admin') && !('email' in pub))
ok('perguntas padrão já vêm cadastradas, em ordem', pub.items[0].question === 'Como o Tramado funciona?' && pub.items.every((i) => i.answer.length > 20))
await rejects('visitante não lê a tabela do chatbot', () => asAnon(() => db.query('select * from public.chatbot_items')), /permission denied/)
await rejects('visitante não chama o painel do chatbot', () => asAnon(() => db.query('select public.admin_list_chatbot()')), /permission denied/)
await rejects('visitante não lê cupons nem preços direto', () => asAnon(() => db.query('select * from public.coupons')), /permission denied/)
await rejects('usuária comum não lê a tabela do chatbot', () => as(D, () => db.query('select * from public.chatbot_items')), /permission denied/)
await rejects('usuária comum não usa o painel do chatbot', () => as(D, () => db.query('select public.admin_list_chatbot()')), /sem_permissao/)
await rejects('usuária comum não cria pergunta', () => as(D, () => db.query(`select public.admin_save_chatbot_item(null,'Pergunta?','Resposta',null,1,true)`)), /sem_permissao/)
await rejects('usuária comum não muda os textos do robô', () => as(D, () => db.query(`select public.admin_save_chatbot_config('a','b','')`)), /sem_permissao/)

const botAdmin = (await adm('select public.admin_list_chatbot() r')).rows[0].r
ok('admin vê perguntas e textos do robô', botAdmin.items.length === 10 && botAdmin.config.whatsapp === '' && botAdmin.items.every((i) => i.active === true))

const newQ = (await adm(`select public.admin_save_chatbot_item(null, '  Vocês fazem entrega?  ', 'Fazemos para todo o Brasil.', 'frete, correios', 5, true) id`)).rows[0].id
const pub2 = (await asAnon(() => db.query('select public.public_landing() r'))).rows[0].r
ok('pergunta nova aparece primeiro (ordem 5) e sem espaços sobrando', pub2.items.length === 11 && pub2.items[0].question === 'Vocês fazem entrega?' && pub2.items[0].keywords === 'frete, correios')
await adm(`select public.admin_save_chatbot_item('${newQ}', 'Vocês fazem entrega?', 'Sim, enviamos.', 'frete', 5, false)`)
const pub3 = (await asAnon(() => db.query('select public.public_landing() r'))).rows[0].r
ok('pergunta pausada some para os visitantes, mas continua no painel', pub3.items.length === 10 && (await adm('select public.admin_list_chatbot() r')).rows[0].r.items.length === 11)
await rejects('pergunta curta demais é recusada', () => adm(`select public.admin_save_chatbot_item(null, 'ab', 'x', null, 1, true)`), /pergunta_invalida/)
await rejects('resposta vazia é recusada', () => adm(`select public.admin_save_chatbot_item(null, 'Pergunta ok', '   ', null, 1, true)`), /resposta_invalida/)
await rejects('editar pergunta que não existe é recusado', () => adm(`select public.admin_save_chatbot_item('99999999-9999-4999-8999-999999999999', 'Pergunta ok', 'x', null, 1, true)`), /item_inexistente/)
await adm(`select public.admin_delete_chatbot_item('${newQ}')`)
ok('apagar pergunta remove do painel', (await adm('select public.admin_list_chatbot() r')).rows[0].r.items.length === 10)
await rejects('apagar pergunta inexistente é recusado', () => adm(`select public.admin_delete_chatbot_item('${newQ}')`), /item_inexistente/)

await adm(`select public.admin_save_chatbot_config('Olá!', 'Chame no zap.', '(81) 99999-0000')`)
const pub4 = (await asAnon(() => db.query('select public.public_landing() r'))).rows[0].r
ok('textos do robô e WhatsApp (só dígitos) chegam aos visitantes', pub4.config.greeting === 'Olá!' && pub4.config.fallback === 'Chame no zap.' && pub4.config.whatsapp === '81999990000')
await rejects('WhatsApp com poucos dígitos é recusado', () => adm(`select public.admin_save_chatbot_config('a','b','123')`), /whatsapp_invalido/)
await rejects('mensagem vazia é recusada', () => adm(`select public.admin_save_chatbot_config('  ','b','')`), /texto_invalido/)
await adm(`select public.admin_save_chatbot_config('Olá!', 'Chame no zap.', '')`)
ok('WhatsApp pode ficar vazio', (await asAnon(() => db.query('select public.public_landing() r'))).rows[0].r.config.whatsapp === '')
const au2 = (await adm(`select public.admin_audit_list(60) a`)).rows[0].a.map((x) => x.action)
ok('mudanças no chatbot ficam no histórico', au2.includes('save_chatbot_item') && au2.includes('delete_chatbot_item') && au2.includes('save_chatbot_config'))

console.log(`\n${pass} ok, ${fail} falhas`)
process.exit(fail ? 1 : 0)
