// Planejador local: encaixa tarefas pendentes nos horários livres do usuário,
// respeitando compromissos fixos, descansos, disponibilidade e um limite diário
// de foco. Funciona 100% offline, por regras — não é IA generativa.
//
// Garantias:
// - Nunca move eventos (compromissos fixos). Conflitos entre eventos viram avisos.
// - Nunca apaga tarefas.
// - Nunca coloca dois blocos no mesmo horário.
// - Não usa todo o tempo livre: há teto diário de foco e intervalos entre blocos.
// - Só produz PROPOSTAS. Nada é gravado até o usuário aceitar.
import { addDays, diffDays, fromMin, fmtRelative, nowMin, toMin, today, weekday } from './dates'
import { eventOccurrences } from './recurrence'
import { isDone, scoreReason, sortByUrgency } from './tasks'
import type { CalEvent, DateStr, Goal, Proposal, Settings, Task } from './types'

export interface Interval {
  start: number // minutos desde 00:00
  end: number
  label?: string
  kind?: 'evento' | 'descanso' | 'tarefa' | 'bloqueio' | 'indisponivel'
}

export interface PlanInput {
  tasks: Task[]
  events: CalEvent[]
  goals?: Goal[]
  settings: Settings
  now?: Date
  horizonDays?: number
  /** Intervalos extras indisponíveis (ex.: "perdi 2 horas hoje"). */
  blocked?: { date: DateStr; start: number; end: number; label: string }[]
  /** Se informado, só planeja estas tarefas (as demais ficam como estão). */
  onlyTaskIds?: string[]
  /** Replanejar também tarefas que já têm bloco futuro (exige confirmação de cada mudança). */
  replanFuture?: boolean
  /** Não agendar a tarefa antes deste dia (usado para distribuir sessões de estudo). */
  notBefore?: Record<string, DateStr>
}

export interface PlanResult {
  proposals: Extract<Proposal, { kind: 'schedule' }>[]
  unscheduled: { task: Task; reason: string }[]
  warnings: string[]
  explanation: string[]
  freeByDay: { date: DateStr; freeMin: number; plannedMin: number }[]
}

function merge(list: Interval[]): Interval[] {
  const s = [...list].sort((a, b) => a.start - b.start)
  const out: Interval[] = []
  for (const i of s) {
    const last = out[out.length - 1]
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end)
    else out.push({ start: i.start, end: i.end })
  }
  return out
}

function subtract(window: Interval, busy: Interval[]): Interval[] {
  const free: Interval[] = []
  let cur = window.start
  for (const b of merge(busy)) {
    if (b.end <= cur) continue
    if (b.start >= window.end) break
    if (b.start > cur) free.push({ start: cur, end: Math.min(b.start, window.end) })
    cur = Math.max(cur, b.end)
  }
  if (cur < window.end) free.push({ start: cur, end: window.end })
  return free.filter((f) => f.end - f.start >= 5)
}

/** Ocupações de um dia: eventos, descansos, blocos de tarefas, bloqueios. */
export function busyForDay(
  date: DateStr,
  input: Pick<PlanInput, 'tasks' | 'events' | 'settings' | 'blocked'>,
  opts: { excludeTaskIds?: Set<string>; withBuffer?: boolean } = {},
): Interval[] {
  const { settings } = input
  const buffer = opts.withBuffer ? settings.planning.bufferMin : 0
  const busy: Interval[] = []
  for (const o of eventOccurrences(input.events, date, date)) {
    busy.push({ start: o.startMin - buffer, end: o.endMin + buffer, label: o.event.title, kind: 'evento' })
  }
  const wd = weekday(date)
  for (const r of settings.planning.rest) {
    if (r.days.includes(wd)) busy.push({ start: toMin(r.start), end: toMin(r.end), label: r.label, kind: 'descanso' })
  }
  for (const t of input.tasks) {
    if (isDone(t) || opts.excludeTaskIds?.has(t.id)) continue
    if (t.plannedDate === date && t.plannedStart && t.plannedEnd) {
      busy.push({ start: toMin(t.plannedStart) - buffer, end: toMin(t.plannedEnd) + buffer, label: t.title, kind: 'tarefa' })
    } else if (t.dueDate === date && t.dueTime && !t.plannedDate) {
      const s = toMin(t.dueTime)
      busy.push({ start: s, end: s + (t.estimateMin ?? settings.planning.defaultTaskMin), label: t.title, kind: 'tarefa' })
    }
  }
  for (const b of input.blocked ?? []) if (b.date === date) busy.push({ start: b.start, end: b.end, label: b.label, kind: 'bloqueio' })
  return busy
}

/** Horários livres de um dia dentro da disponibilidade, a partir de agora (se for hoje). */
export function freeSlots(
  date: DateStr,
  input: Pick<PlanInput, 'tasks' | 'events' | 'settings' | 'blocked' | 'now'>,
  opts: { excludeTaskIds?: Set<string>; withBuffer?: boolean } = {},
): Interval[] {
  const av = input.settings.planning.availability[weekday(date)]
  if (!av?.enabled) return []
  const now = input.now ?? new Date()
  let start = toMin(av.start)
  const end = toMin(av.end)
  if (date === today(now)) start = Math.max(start, Math.ceil((nowMin(now) + 5) / 15) * 15)
  if (date < today(now) || start >= end) return []
  return subtract({ start, end }, busyForDay(date, input, opts))
}

export function freeMinutes(slots: Interval[]): number {
  return slots.reduce((s, i) => s + (i.end - i.start), 0)
}

export function plan(input: PlanInput): PlanResult {
  const now = input.now ?? new Date()
  const ref = today(now)
  const { settings } = input
  const horizon = input.horizonDays ?? 7
  const explanation: string[] = []
  const warnings: string[] = []
  const proposals: PlanResult['proposals'] = []
  const unscheduled: PlanResult['unscheduled'] = []
  const curMin = nowMin(now)

  // 1) Quais tarefas precisam de lugar na agenda?
  const pending = input.tasks.filter((t) => !isDone(t))
  const needs = pending.filter((t) => {
    if (input.onlyTaskIds && !input.onlyTaskIds.includes(t.id)) return false
    // horário fixo definido pelo usuário (dueTime sem bloco): respeitamos
    if (t.dueTime && t.dueDate && t.dueDate >= ref && !t.plannedDate) return false
    if (!t.plannedDate) return true
    const missed = t.plannedDate < ref || (t.plannedDate === ref && t.plannedEnd != null && toMin(t.plannedEnd) <= curMin)
    if (missed) return true
    // bloco futuro que colide com um bloqueio informado ("perdi 2 horas")
    const hit = (input.blocked ?? []).some(
      (b) => b.date === t.plannedDate && toMin(t.plannedStart!) < b.end && b.start < toMin(t.plannedEnd!),
    )
    if (hit) return true
    return !!input.replanFuture
  })
  const moving = new Set(needs.map((t) => t.id))

  // 2) Ordem: prazo + prioridade (+ metas ativas)
  const ordered = sortByUrgency(needs, ref, input.goals ?? [])

  // 3) Horários livres por dia, já descontando o que não será movido
  const days: DateStr[] = []
  for (let i = 0; i < horizon; i++) days.push(addDays(ref, i))
  const slots = new Map<DateStr, Interval[]>()
  const planned = new Map<DateStr, number>()
  for (const d of days) {
    slots.set(d, freeSlots(d, { ...input, now }, { excludeTaskIds: moving, withBuffer: true }))
    // minutos de foco já comprometidos neste dia (tarefas que ficam onde estão)
    const already = input.tasks
      .filter((t) => !isDone(t) && !moving.has(t.id) && t.plannedDate === d && t.plannedStart && t.plannedEnd)
      .reduce((s, t) => s + (toMin(t.plannedEnd!) - toMin(t.plannedStart!)), 0)
    planned.set(d, already)
  }
  const freeBefore = new Map(days.map((d) => [d, freeMinutes(slots.get(d)!)]))

  const cap = settings.planning.maxFocusMinPerDay
  const buffer = settings.planning.bufferMin

  for (const t of ordered) {
    const dur = Math.max(10, t.estimateMin ?? settings.planning.defaultTaskMin)
    const lastDay = t.dueDate && t.dueDate >= ref ? t.dueDate : null
    let placed = false
    for (const d of days) {
      if (lastDay && d > lastDay) break
      if (input.notBefore?.[t.id] && d < input.notBefore[t.id]) continue
      if ((planned.get(d) ?? 0) + dur > cap) continue
      const daySlots = slots.get(d)!
      const idx = daySlots.findIndex((s) => s.end - s.start >= dur)
      if (idx < 0) continue
      const slot = daySlots[idx]
      const start = slot.start
      const end = start + dur
      // ocupa o espaço + intervalo de respiro
      const rest = { start: end + buffer, end: slot.end }
      daySlots.splice(idx, 1, ...(rest.end - rest.start >= 5 ? [rest] : []))
      planned.set(d, (planned.get(d) ?? 0) + dur)
      const from = t.plannedDate && t.plannedStart && t.plannedEnd ? { date: t.plannedDate, start: t.plannedStart, end: t.plannedEnd } : undefined
      const why: string[] = [cap1(scoreReason(t, ref))]
      if (from) why.push(`o bloco anterior (${fmtRelative(from.date, ref)}, ${from.start}) ${from.date < ref || from.date === ref ? 'já passou ou foi afetado' : 'foi afetado por uma mudança'}`)
      why.push(`cabe em um horário livre de ${fmtRelative(d, ref).toLowerCase()} sem encostar em compromissos`)
      proposals.push({
        id: `p-${t.id}-${d}-${start}`,
        kind: 'schedule',
        taskId: t.id,
        title: t.title,
        date: d,
        start: fromMin(start),
        end: fromMin(end),
        from,
        reason: why.join('; ') + '.',
        status: 'pendente',
      })
      placed = true
      break
    }
    if (!placed) {
      let reason: string
      if (t.dueDate && t.dueDate < ref) reason = 'Está atrasada e não há espaço livre suficiente nos próximos dias dentro do seu limite diário.'
      else if (lastDay) reason = `Não há um bloco livre de ${dur} min antes do prazo (${fmtRelative(lastDay, ref).toLowerCase()}) sem passar do seu limite diário de foco.`
      else reason = `Não há um bloco livre de ${dur} min nos próximos ${horizon} dias.`
      unscheduled.push({ task: t, reason })
    }
  }

  // 4) Conflitos entre compromissos fixos — só avisamos, nunca movemos
  const occ = eventOccurrences(input.events, ref, addDays(ref, horizon - 1))
  for (let i = 0; i < occ.length; i++)
    for (let j = i + 1; j < occ.length; j++) {
      const a = occ[i]
      const b = occ[j]
      if (a.date === b.date && a.startMin < b.endMin && b.startMin < a.endMin)
        warnings.push(`Conflito em ${fmtRelative(a.date, ref).toLowerCase()}: "${a.event.title}" e "${b.event.title}" se sobrepõem. Compromissos fixos não são movidos automaticamente — ajuste na Agenda se quiser.`)
    }

  // 5) Explicação
  const freeByDay = days.map((d) => ({ date: d, freeMin: freeBefore.get(d)!, plannedMin: planned.get(d)! }))
  explanation.push(`Analisei ${pending.length} tarefa${pending.length === 1 ? '' : 's'} pendente${pending.length === 1 ? '' : 's'} e ${occ.length} compromisso${occ.length === 1 ? '' : 's'} nos próximos ${horizon} dias.`)
  if (needs.length) explanation.push(`${needs.length} precisa${needs.length === 1 ? '' : 'm'} de horário (sem bloco, bloco perdido ou afetado).`)
  explanation.push('Ordenei por prazo e prioridade: atrasadas e com prazo próximo primeiro.')
  explanation.push(
    `Mantive seus descansos (${settings.planning.rest.map((r) => r.label.toLowerCase()).join(', ') || 'nenhum cadastrado'}), ${buffer} min de respiro entre atividades e no máximo ${Math.round(cap / 60 * 10) / 10}h de foco por dia — o resto do tempo livre fica livre.`,
  )
  explanation.push('Compromissos fixos não foram alterados. Nada é salvo até você aceitar.')
  if (input.blocked?.length) explanation.push(`Considerei como indisponível: ${input.blocked.map((b) => `${fromMin(b.start)}–${fromMin(b.end)}`).join(', ')}.`)

  return { proposals, unscheduled, warnings: [...new Set(warnings)], explanation, freeByDay }
}

function cap1(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Sugere a próxima ação para o dashboard. */
export function nextAction(input: { tasks: Task[]; events: CalEvent[]; goals: Goal[]; settings: Settings; now?: Date }):
  | { kind: 'evento'; title: string; detail: string }
  | { kind: 'tarefa'; task: Task; detail: string }
  | { kind: 'livre'; detail: string }
  | null {
  const now = input.now ?? new Date()
  const ref = today(now)
  const m = nowMin(now)
  const occ = eventOccurrences(input.events, ref, ref).filter((o) => !o.done && o.endMin > m)
  const current = occ.find((o) => o.startMin <= m)
  if (current) return { kind: 'evento', title: current.event.title, detail: `Acontecendo agora, até ${fromMin(current.endMin)}.` }
  const soon = occ.find((o) => o.startMin - m <= 30)
  if (soon) return { kind: 'evento', title: soon.event.title, detail: `Começa às ${fromMin(soon.startMin)} — bom momento para se preparar.` }
  const planned = input.tasks.find(
    (t) => !isDone(t) && t.plannedDate === ref && t.plannedStart && toMin(t.plannedStart) <= m + 15 && toMin(t.plannedEnd!) > m,
  )
  if (planned) return { kind: 'tarefa', task: planned, detail: `Planejada para ${planned.plannedStart}–${planned.plannedEnd}.` }
  const window = occ.length ? occ[0].startMin - m : 24 * 60 - m
  const candidates = sortByUrgency(
    input.tasks.filter((t) => !isDone(t) && (!t.dueDate || diffDays(t.dueDate, ref) <= 7)),
    ref,
    input.goals,
  )
  const fit = candidates.find((t) => (t.estimateMin ?? input.settings.planning.defaultTaskMin) <= window) ?? candidates[0]
  if (fit) {
    const est = fit.estimateMin ?? input.settings.planning.defaultTaskMin
    return { kind: 'tarefa', task: fit, detail: `${cap1(scoreReason(fit, ref))}. Leva cerca de ${est} min.` }
  }
  return { kind: 'livre', detail: 'Nada urgente agora. Tempo livre também é parte do plano.' }
}
