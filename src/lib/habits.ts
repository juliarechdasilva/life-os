import { addDays, startOfWeek, weekday } from './dates'
import type { DateStr, Habit } from './types'

export function describeFreq(h: Habit): string {
  const f = h.frequency
  if (f.type === 'diaria') return 'Todos os dias'
  if (f.type === 'vezes_semana') return `${f.times}× por semana`
  const names = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
  return f.days.map((d) => names[d]).join(', ')
}

/** O hábito está programado para este dia? (para "vezes por semana", todo dia é elegível) */
export function isScheduled(h: Habit, d: DateStr): boolean {
  if (h.paused) return false
  if (d < h.createdAt.slice(0, 10)) return false
  const f = h.frequency
  if (f.type === 'dias') return f.days.includes(weekday(d))
  return true
}

export function weekCount(h: Habit, d: DateStr, weekStart: 0 | 1): number {
  const s = startOfWeek(d, weekStart)
  let n = 0
  for (let i = 0; i < 7; i++) if (h.log[addDays(s, i)] === 'feito') n++
  return n
}

export interface HabitStats {
  rate30: number | null // % de dias programados cumpridos (descanso não conta contra)
  doneTotal: number
  streak: number // dias seguidos sem "falhas" (descanso e dias não programados não quebram)
  best: number
}

export function habitStats(h: Habit, ref: DateStr, weekStart: 0 | 1 = 0): HabitStats {
  const doneTotal = Object.values(h.log).filter((v) => v === 'feito').length
  let scheduled = 0
  let done = 0
  const start = h.createdAt.slice(0, 10)
  if (h.frequency.type === 'vezes_semana') {
    // compara semanas completas: meta semanal atingida?
    const times = h.frequency.times
    let weeks = 0
    let ok = 0
    for (let w = 1; w <= 4; w++) {
      const ws = addDays(startOfWeek(ref, weekStart), -7 * w)
      if (addDays(ws, 6) < start) break
      weeks++
      if (weekCount(h, ws, weekStart) >= times) ok++
    }
    return { rate30: weeks ? Math.round((ok / weeks) * 100) : null, doneTotal, streak: weekStreak(h, ref, weekStart), best: weekStreak(h, ref, weekStart) }
  }
  for (let i = 0; i < 30; i++) {
    const d = addDays(ref, -i)
    if (d < start) break
    if (!isScheduled(h, d) || h.log[d] === 'descanso') continue
    if (i === 0 && h.log[d] !== 'feito') continue // hoje ainda não acabou
    scheduled++
    if (h.log[d] === 'feito') done++
  }
  // sequência atual
  let streak = 0
  for (let i = 0; i < 400; i++) {
    const d = addDays(ref, -i)
    if (d < start) break
    const v = h.log[d]
    if (v === 'feito') streak++
    else if (v === 'descanso' || !isScheduled(h, d) || i === 0) continue
    else break
  }
  // melhor sequência
  let best = 0
  let cur = 0
  const dates = Object.keys(h.log).sort()
  if (dates.length) {
    for (let d = dates[0]; d <= ref; d = addDays(d, 1)) {
      const v = h.log[d]
      if (v === 'feito') best = Math.max(best, ++cur)
      else if (v === 'descanso' || !isScheduled(h, d)) continue
      else if (d !== ref) cur = 0
    }
  }
  return { rate30: scheduled ? Math.round((done / scheduled) * 100) : null, doneTotal, streak, best: Math.max(best, streak) }
}

function weekStreak(h: Habit, ref: DateStr, weekStart: 0 | 1): number {
  if (h.frequency.type !== 'vezes_semana') return 0
  let n = 0
  for (let w = 1; w < 60; w++) {
    const ws = addDays(startOfWeek(ref, weekStart), -7 * w)
    if (weekCount(h, ws, weekStart) >= h.frequency.times) n++
    else break
  }
  return n
}

/** Mensagens gentis — nunca punitivas. */
export function encouragement(rate: number | null): string {
  if (rate == null) return 'Começando agora — cada registro conta.'
  if (rate >= 80) return 'Ritmo bonito. Lembre-se de descansar também.'
  if (rate >= 50) return 'Constância em construção. Está indo bem.'
  if (rate > 0) return 'Alguns dias contam muito. Recomeçar faz parte.'
  return 'Sem pressão: um pequeno passo hoje já é progresso.'
}
