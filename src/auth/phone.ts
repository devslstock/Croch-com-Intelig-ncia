/** Telefone brasileiro → formato internacional (E.164), como o Supabase/Twilio esperam: +5581999990000. */
export function normalizeBrPhone(input: string): string | null {
  const t = input.trim()
  let digits = t.replace(/\D/g, '')
  if (!digits) return null
  if (t.startsWith('+')) return digits.length >= 11 && digits.length <= 15 ? `+${digits}` : null
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '')
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2)
  if (digits.length !== 10 && digits.length !== 11) return null
  const ddd = Number(digits.slice(0, 2))
  if (ddd < 11 || ddd > 99) return null
  if (digits.length === 11 && digits[2] !== '9') return null // celular com 9 dígitos começa em 9
  return `+55${digits}`
}

/** +5581999990000 → (81) 99999-0000 (só para mostrar). */
export function formatBrPhone(e164: string): string {
  const m = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(e164)
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164
}
