// Exporta compromissos e tarefas para o formato de calendário (.ics, padrão iCalendar).
// Abrindo o arquivo no celular, os itens vão para o Calendário do aparelho, que avisa
// nos horários mesmo com o Life OS fechado — sem servidor e sem custo.
import { addDays, toMin, today } from './dates'
import { isDone } from './tasks'
import type { CalEvent, Recurrence, Settings, Task } from './types'

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const dt = (date: string, time: string) => `${date.replace(/-/g, '')}T${time.replace(':', '')}00`

function stamp(d = new Date()) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Dobra linhas longas (máx. 75 caracteres), como pede a especificação. */
function fold(line: string) {
  const out: string[] = []
  let s = line
  while (s.length > 74) {
    out.push(s.slice(0, 74))
    s = ' ' + s.slice(74)
  }
  out.push(s)
  return out.join('\r\n')
}

function endOf(date: string, start: string, minutes: number) {
  const total = toMin(start) + minutes
  const d = total >= 24 * 60 ? addDays(date, Math.floor(total / (24 * 60))) : date
  const m = total % (24 * 60)
  return dt(d, `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
}

const DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

export function rrule(r: Recurrence, start: string): string {
  const n = Math.max(1, r.interval || 1)
  const until = r.until ? `;UNTIL=${r.until.replace(/-/g, '')}T235959` : ''
  switch (r.freq) {
    case 'diaria':
      return `RRULE:FREQ=DAILY;INTERVAL=${n}${until}`
    case 'dias_uteis':
      return `RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR${until}`
    case 'semanal': {
      const days = r.weekdays?.length ? r.weekdays : [new Date(start + 'T12:00').getDay()]
      return `RRULE:FREQ=WEEKLY;INTERVAL=${n};BYDAY=${days.map((d) => DAY[d]).join(',')}${until}`
    }
    case 'mensal':
      return `RRULE:FREQ=MONTHLY;INTERVAL=${n}${until}`
    case 'anual':
      return `RRULE:FREQ=YEARLY${until}`
  }
}

function alarm(minutes: number, title: string) {
  return ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, `TRIGGER:-PT${Math.max(0, minutes)}M`, 'END:VALARM']
}

export function eventToVevent(e: CalEvent): string[] {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${e.id}@life-os`,
    `DTSTAMP:${stamp()}`,
    `DTSTART:${dt(e.date, e.start)}`,
    `DTEND:${endOf(e.date, e.start, e.durationMin)}`,
    `SUMMARY:${esc(e.title)}`,
  ]
  if (e.location) lines.push(`LOCATION:${esc(e.location)}`)
  if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`)
  if (e.recurrence) lines.push(rrule(e.recurrence, e.date))
  for (const x of e.exceptions) lines.push(`EXDATE:${dt(x, e.start)}`)
  if (e.reminderMin != null) lines.push(...alarm(e.reminderMin, e.title))
  lines.push('END:VEVENT')
  return lines
}

export function taskToVevent(t: Task, leadMin: number): string[] | null {
  const date = t.plannedDate ?? t.dueDate
  const start = t.plannedDate ? t.plannedStart : t.dueTime
  if (!date || !start) return null
  const dur = t.plannedDate && t.plannedEnd ? toMin(t.plannedEnd) - toMin(start) : (t.estimateMin ?? 30)
  return [
    'BEGIN:VEVENT',
    `UID:task-${t.id}@life-os`,
    `DTSTAMP:${stamp()}`,
    `DTSTART:${dt(date, start)}`,
    `DTEND:${endOf(date, start, Math.max(5, dur))}`,
    `SUMMARY:${esc('☐ ' + t.title)}`,
    ...(t.description ? [`DESCRIPTION:${esc(t.description)}`] : []),
    ...alarm(leadMin, t.title),
    'END:VEVENT',
  ]
}

export function buildIcs(opts: { events: CalEvent[]; tasks: Task[]; settings: Settings; includeEvents: boolean; includeTasks: boolean; from?: string }): { ics: string; count: number } {
  const from = opts.from ?? today()
  const body: string[] = []
  let count = 0
  if (opts.includeEvents)
    for (const e of opts.events) {
      // eventos passados não recorrentes ficam de fora
      if (!e.recurrence && e.date < from) continue
      if (e.recurrence?.until && e.recurrence.until < from) continue
      body.push(...eventToVevent(e))
      count++
    }
  if (opts.includeTasks)
    for (const t of opts.tasks) {
      if (isDone(t)) continue
      const v = taskToVevent(t, opts.settings.notifications.leadMin)
      const date = t.plannedDate ?? t.dueDate
      if (v && date && date >= from) {
        body.push(...v)
        count++
      }
    }
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Life OS//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Life OS', ...body, 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n'
  return { ics, count }
}
