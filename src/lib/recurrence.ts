import { addDays, addMonths, diffDays, parseDate, weekday } from './dates'
import type { CalEvent, DateStr, Recurrence } from './types'

export const FREQ_LABEL: Record<Recurrence['freq'], string> = {
  diaria: 'Todos os dias',
  dias_uteis: 'Dias úteis (seg–sex)',
  semanal: 'Semanalmente',
  mensal: 'Mensalmente',
  anual: 'Anualmente',
}

export function describeRecurrence(r?: Recurrence): string {
  if (!r) return 'Não se repete'
  const n = Math.max(1, r.interval || 1)
  let base: string
  switch (r.freq) {
    case 'diaria':
      base = n === 1 ? 'Todos os dias' : `A cada ${n} dias`
      break
    case 'dias_uteis':
      base = 'Dias úteis'
      break
    case 'semanal': {
      const names = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
      const days = r.weekdays?.length ? ` (${r.weekdays.map((d) => names[d]).join(', ')})` : ''
      base = (n === 1 ? 'Toda semana' : `A cada ${n} semanas`) + days
      break
    }
    case 'mensal':
      base = n === 1 ? 'Todo mês' : `A cada ${n} meses`
      break
    case 'anual':
      base = 'Todo ano'
      break
  }
  return r.until ? `${base}, até ${r.until.split('-').reverse().join('/')}` : base
}

/** A data `d` é uma ocorrência de uma série que começa em `start`? */
export function occursOn(start: DateStr, r: Recurrence | undefined, d: DateStr): boolean {
  const delta = diffDays(d, start)
  if (delta < 0) return false
  if (!r) return delta === 0
  if (r.until && d > r.until) return false
  const n = Math.max(1, r.interval || 1)
  switch (r.freq) {
    case 'diaria':
      return delta % n === 0
    case 'dias_uteis': {
      const wd = weekday(d)
      return wd >= 1 && wd <= 5
    }
    case 'semanal': {
      const days = r.weekdays?.length ? r.weekdays : [weekday(start)]
      if (!days.includes(weekday(d))) return false
      // número da semana relativo ao início
      const weekIdx = Math.floor((delta + weekday(start)) / 7)
      return weekIdx % n === 0
    }
    case 'mensal': {
      const s = parseDate(start)
      const t = parseDate(d)
      const months = (t.getFullYear() - s.getFullYear()) * 12 + (t.getMonth() - s.getMonth())
      if (months % n !== 0) return false
      // se o mês não tem o dia (ex.: 31), usa o último dia
      return addMonths(start, months) === d
    }
    case 'anual': {
      const s = parseDate(start)
      const t = parseDate(d)
      return addMonths(start, (t.getFullYear() - s.getFullYear()) * 12) === d && s.getMonth() === t.getMonth()
    }
  }
}

/** Próxima ocorrência estritamente depois de `after`. */
export function nextOccurrence(start: DateStr, r: Recurrence, after: DateStr): DateStr | undefined {
  let d = addDays(after, 1)
  if (d < start) d = start
  for (let i = 0; i < 800; i++) {
    if (r.until && d > r.until) return undefined
    if (occursOn(start, r, d)) return d
    d = addDays(d, 1)
  }
  return undefined
}

export interface Occurrence {
  event: CalEvent
  date: DateStr
  startMin: number
  endMin: number
  done: boolean
}

export function eventOccurrences(events: CalEvent[], from: DateStr, to: DateStr): Occurrence[] {
  const out: Occurrence[] = []
  for (const ev of events) {
    if (!ev.recurrence) {
      if (ev.date >= from && ev.date <= to) out.push(mk(ev, ev.date))
      continue
    }
    if (ev.recurrence.until && ev.recurrence.until < from) continue
    let d = from < ev.date ? ev.date : from
    while (d <= to) {
      if (occursOn(ev.date, ev.recurrence, d) && !ev.exceptions.includes(d)) out.push(mk(ev, d))
      d = addDays(d, 1)
    }
  }
  return out.sort((a, b) => (a.date === b.date ? a.startMin - b.startMin : a.date < b.date ? -1 : 1))
}

function mk(ev: CalEvent, date: DateStr): Occurrence {
  const [h, m] = ev.start.split(':').map(Number)
  const startMin = h * 60 + m
  return { event: ev, date, startMin, endMin: startMin + ev.durationMin, done: ev.doneDates.includes(date) }
}

/** Encontra ocorrências que se sobrepõem a um intervalo em uma data. */
export function findConflicts(
  events: CalEvent[],
  date: DateStr,
  startMin: number,
  endMin: number,
  ignoreId?: string,
): Occurrence[] {
  return eventOccurrences(
    events.filter((e) => e.id !== ignoreId),
    date,
    date,
  ).filter((o) => o.startMin < endMin && startMin < o.endMin)
}

/** Para um evento (possivelmente recorrente), lista conflitos nos próximos `days` dias. */
export function seriesConflicts(events: CalEvent[], ev: Pick<CalEvent, 'id' | 'date' | 'start' | 'durationMin' | 'recurrence' | 'exceptions'>, days = 60) {
  const [h, m] = ev.start.split(':').map(Number)
  const s = h * 60 + m
  const e = s + ev.durationMin
  const res: Occurrence[] = []
  const end = ev.recurrence ? addDays(ev.date, days) : ev.date
  let d = ev.date
  while (d <= end) {
    if (occursOn(ev.date, ev.recurrence, d) && !ev.exceptions.includes(d)) {
      res.push(...findConflicts(events, d, s, e, ev.id))
    }
    d = addDays(d, 1)
  }
  return res
}
