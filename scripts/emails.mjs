// Gera os e-mails de login do Tramado (confirmação de cadastro, redefinir senha, etc.) com o visual do app.
// Uso:
//   node scripts/emails.mjs              -> escreve os arquivos em supabase/emails/
//   node scripts/emails.mjs --aplicar    -> também envia para o Supabase (precisa de SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_REF)
// Os textos {{ .ConfirmationURL }}, {{ .Token }}, {{ .NewEmail }} são preenchidos pelo Supabase na hora do envio.
import { mkdirSync, writeFileSync } from 'node:fs'

const SITE = 'https://tramado.sldev.com.br'
const LOGO = `${SITE}/email-logo.png`
const HERO = `${SITE}/email-hero.jpg`
const DEV = { name: 'SL Desenvolvimentos', url: 'https://sldev.com.br' }

const C = { bg: '#fdeaf1', card: '#ffffff', line: '#f3d3df', ink: '#4a3a52', title: '#7a2d52', accent: '#a8426f', soft: '#fff3f8', btnA: '#d4577f', btnB: '#a8426f' }

/** Fileira de "pontos" rosas, como as carreiras de um gráfico de crochê. */
const stitches = () => {
  const tones = ['#f9b4cd', '#f7bfd2', '#ebe3fa', '#f7bfd2', '#f9b4cd', '#e8749a', '#f9b4cd', '#f7bfd2', '#ebe3fa', '#f7bfd2', '#f9b4cd', '#e8749a']
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto"><tr>${tones
    .map((t) => `<td width="14" height="14" style="width:14px;height:14px;background:${t};border-radius:4px;font-size:0;line-height:0">&nbsp;</td><td width="4" style="width:4px;font-size:0">&nbsp;</td>`)
    .join('')}</tr></table>`
}

const button = (label) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:28px auto 8px">
  <tr><td align="center" bgcolor="${C.btnB}" style="border-radius:14px;background-color:${C.btnB};background-image:linear-gradient(135deg,${C.btnA},${C.btnB})">
    <a href="{{ .ConfirmationURL }}" target="_blank" style="display:inline-block;padding:16px 36px;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:14px">${label}</a>
  </td></tr>
</table>`

const linkFallback = `
<p style="margin:22px 0 0;font-size:13px;line-height:1.5;color:#7d6c86;text-align:center">Se o botão não funcionar, copie este endereço e cole no navegador:<br>
<a href="{{ .ConfirmationURL }}" style="color:${C.accent};word-break:break-all">{{ .ConfirmationURL }}</a></p>`

const layout = ({ preheader, title, intro, body = '', extra = '', note }) => `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>Tramado</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg}">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg}">
<tr><td align="center" style="padding:28px 14px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
    <tr><td align="center" style="padding:6px 0 18px">
      <a href="${SITE}" target="_blank"><img src="${LOGO}" width="230" height="46" alt="Tramado" style="display:block;border:0;width:230px;height:auto"></a>
    </td></tr>
    <tr><td bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.line};border-radius:24px;overflow:hidden;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:${C.ink}">
      <img src="${HERO}" width="560" alt="" style="display:block;width:100%;height:auto;border:0;border-radius:23px 23px 0 0;background:${C.soft}">
      <div style="padding:26px 30px 30px">
      ${stitches()}
      <h1 style="margin:22px 0 10px;font-size:26px;line-height:1.25;text-align:center;color:${C.title}">${title}</h1>
      <p style="margin:0;font-size:16px;line-height:1.6;text-align:center;color:${C.ink}">${intro}</p>
      ${body}
      ${extra}
      ${note ? `<p style="margin:26px 0 0;padding:14px 16px;border-radius:14px;background:${C.soft};font-size:13.5px;line-height:1.55;text-align:center;color:#7d6c86">${note}</p>` : ''}
      </div>
    </td></tr>
    <tr><td align="center" style="padding:20px 10px 4px;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:12.5px;line-height:1.6;color:#8a7392">
      © ${new Date().getFullYear()} TRAMADO. Todos os direitos reservados.<br>
      Desenvolvido pela <a href="${DEV.url}" target="_blank" style="color:${C.accent};text-decoration:none;font-weight:700">${DEV.name}</a><br>
      Você recebeu este e-mail porque ele foi usado no Tramado ({{ .Email }}).
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>
`

const beneficios = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0;background:${C.soft};border-radius:16px">
  <tr><td style="padding:16px 18px 6px;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:${C.title};text-align:center">O que você vai poder fazer</td></tr>
  ${[
    ['📷', 'Foto em gráfico', 'qualquer foto vira um gráfico com carreiras numeradas'],
    ['🧶', 'Fios certos', 'cores sugeridas das cartelas DMC e Anchor'],
    ['▶️', 'Modo crochetar', 'a carreira certa, a contagem de pontos e o seu progresso'],
  ]
    .map(([i, t, d]) => `<tr><td style="padding:8px 18px;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.45;color:${C.ink}"><span style="font-size:18px">${i}</span>&nbsp; <b>${t}</b> · ${d}</td></tr>`)
    .join('')}
  <tr><td style="height:8px;font-size:0">&nbsp;</td></tr>
</table>`

const MODELOS = {
  confirmation: {
    assunto: 'Confirme seu e-mail no Tramado 🧶',
    html: layout({
      preheader: 'Falta só um toque para ativar a sua conta.',
      title: 'Bem-vinda ao Tramado!',
      intro: 'Falta só um passo: confirme o seu e-mail para ativar a conta e começar a transformar fotos em gráficos de crochê.',
      body: button('Confirmar meu e-mail') + linkFallback,
      extra: beneficios,
      note: 'Se você não criou uma conta no Tramado, pode ignorar este e-mail com tranquilidade.',
    }),
  },
  recovery: {
    assunto: 'Redefinir sua senha do Tramado',
    html: layout({
      preheader: 'Escolha uma nova senha para entrar no Tramado.',
      title: 'Vamos trocar a sua senha',
      intro: 'Recebemos um pedido para redefinir a senha da sua conta no Tramado. Toque no botão para escolher uma nova.',
      body: button('Escolher nova senha') + linkFallback,
      note: 'Não foi você? Ignore este e-mail: a sua senha continua a mesma e nada muda na sua conta.',
    }),
  },
  magic_link: {
    assunto: 'Seu link de acesso ao Tramado',
    html: layout({
      preheader: 'Toque para entrar no Tramado.',
      title: 'Seu link de acesso',
      intro: 'Toque no botão para entrar no Tramado. O link vale por pouco tempo e só pode ser usado uma vez.',
      body: button('Entrar no Tramado') + linkFallback,
      note: 'Se você não pediu este link, pode ignorar este e-mail.',
    }),
  },
  invite: {
    assunto: 'Você foi convidada para o Tramado',
    html: layout({
      preheader: 'Aceite o convite e crie a sua conta.',
      title: 'Você foi convidada!',
      intro: 'Alguém convidou você para usar o Tramado, o app que transforma fotos em gráficos de crochê com os fios certos.',
      body: button('Aceitar o convite') + linkFallback,
      note: 'Se você não esperava este convite, pode ignorar este e-mail.',
    }),
  },
  email_change: {
    assunto: 'Confirme seu novo e-mail no Tramado',
    html: layout({
      preheader: 'Confirme a troca de e-mail da sua conta.',
      title: 'Confirme o novo e-mail',
      intro: 'Você pediu para trocar o e-mail da sua conta para <b>{{ .NewEmail }}</b>. Toque no botão para confirmar.',
      body: button('Confirmar novo e-mail') + linkFallback,
      note: 'Se você não pediu essa troca, ignore este e-mail e, por segurança, altere a sua senha.',
    }),
  },
  reauthentication: {
    assunto: '{{ .Token }} é o seu código do Tramado',
    html: layout({
      preheader: 'Use este código para confirmar que é você.',
      title: 'Seu código de verificação',
      intro: 'Digite este código no Tramado para confirmar que é você. Ele vale por pouco tempo.',
      body: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:26px auto 4px"><tr><td align="center" bgcolor="${C.soft}" style="background:${C.soft};border:2px dashed ${C.line};border-radius:16px;padding:16px 30px;font-family:Consolas,Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:${C.title}">{{ .Token }}</td></tr></table>`,
      note: 'Se você não pediu este código, ignore este e-mail.',
    }),
  },
}

mkdirSync('supabase/emails', { recursive: true })
for (const [nome, m] of Object.entries(MODELOS)) writeFileSync(`supabase/emails/${nome}.html`, m.html)
writeFileSync('supabase/emails/assuntos.json', JSON.stringify(Object.fromEntries(Object.entries(MODELOS).map(([n, m]) => [n, m.assunto])), null, 2) + '\n')
console.log(`ok: ${Object.keys(MODELOS).length} modelos em supabase/emails/`)

if (process.argv.includes('--aplicar')) {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  const ref = process.env.SUPABASE_PROJECT_REF
  if (!token || !ref) {
    console.error('Defina SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_REF para aplicar.')
    process.exit(1)
  }
  const body = {}
  for (const [nome, m] of Object.entries(MODELOS)) {
    body[`mailer_templates_${nome}_content`] = m.html
    body[`mailer_subjects_${nome}`] = m.assunto
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  console.log(res.ok ? 'aplicado no Supabase' : `falhou: ${res.status} ${(await res.text()).slice(0, 300)}`)
  if (!res.ok) process.exit(1)
}
