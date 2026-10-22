import type { DateStr, TimeStr } from './types'

// Todas as funções trabalham no fuso local do dispositivo.

const pad = (n: number) => String(n).padStart(2, '0')

export function toDateStr(d: Date): DateStr {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseDate(s: DateStr): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function today(now = new Date()): DateStr {
  return toDateStr(now)
}

export function addDays(s: DateStr, n: number): DateStr {
  const d = parseDate(s)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

export function addMonths(s: DateStr, n: number): DateStr {
  const d = parseDate(s)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, last))
  return toDateStr(d)
}

export function diffDays(a: DateStr, b: DateStr): number {
  // a - b em dias (ignora horário de verão usando UTC)
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000)
}

export function weekday(s: DateStr): number {
  return parseDate(s).getDay()
}

export function startOfWeek(s: DateStr, weekStart: 0 | 1): DateStr {
  const wd = weekday(s)
  const delta = (wd - weekStart + 7) % 7
  return addDays(s, -delta)
}

export function monthKey(s: DateStr): string {
  return s.slice(0, 7)
}

export function toMin(t: TimeStr): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function fromMin(m: number): TimeStr {
  const c = Math.max(0, Math.min(24 * 60 - 1, Math.round(m)))
  return `${pad(Math.floor(c / 60))}:${pad(c % 60)}`
}

export function nowMin(now = new Date()): number {
  return now.getHours() * 60 + now.getMinutes()
}

export function isValidDate(s: unknown): s is DateStr {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  return toDateStr(parseDate(s)) === s
}

export function isValidTime(s: unknown): s is TimeStr {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
}

// ---------- Formatação pt-BR ----------

export const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export const WEEKDAYS_LETTER = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
export const WEEKDAYS_LONG = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
export const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** 22/10/2026 */
export function fmtDate(s: DateStr): string {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

/** 22 de out. */
export function fmtShort(s: DateStr): string {
  const d = parseDate(s)
  return `${d.getDate()} de ${MONTHS_SHORT[d.getMonth()]}.`
}

/** Quinta-feira, 22 de outubro */
export function fmtLong(s: DateStr, withYear = false): string {
  const d = parseDate(s)
  const base = `${cap(WEEKDAYS_LONG[d.getDay()])}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`
  return withYear ? `${base} de ${d.getFullYear()}` : base
}

export function fmtMonth(s: DateStr): string {
  const d = parseDate(s)
  return `${cap(MONTHS[d.getMonth()])} ${d.getFullYear()}`
}

/** Hoje / Amanhã / Ontem / sex., 24 de out. */
export function fmtRelative(s: DateStr, ref = today()): string {
  const diff = diffDays(s, ref)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Amanhã'
  if (diff === -1) return 'Ontem'
  const d = parseDate(s)
  const sameYear = s.slice(0, 4) === ref.slice(0, 4)
  return `${WEEKDAYS_SHORT[d.getDay()]}., ${d.getDate()} de ${MONTHS_SHORT[d.getMonth()]}.${sameYear ? '' : ' ' + d.getFullYear()}`
}

let timeFormat: '24h' | '12h' = '24h'
export function setTimeFormat(f: '24h' | '12h') {
  timeFormat = f
}
/** Horário no formato escolhido nas configurações. */
export function fmtT(t: TimeStr | undefined): string {
  return t ? fmtTime(t, timeFormat) : ''
}

export function fmtTime(t: TimeStr, format: '24h' | '12h' = '24h'): string {
  if (format === '24h') return t
  const [h, m] = t.split(':').map(Number)
  const suf = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${pad(m)} ${suf}`
}

export function fmtDuration(min: number): string {
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m ? `${h}h${pad(m)}` : `${h}h`
}

export function greeting(now = new Date()): string {
  const h = now.getHours()
  if (h < 5) return 'Boa noite'
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

export function isoNow(): string {
  return new Date().toISOString()
}
