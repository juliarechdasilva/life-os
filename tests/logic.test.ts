import { describe, expect, it } from 'vitest'
import { addDays, addMonths, diffDays, fmtLong, startOfWeek } from '../src/lib/dates'
import { defaultSettings } from '../src/lib/defaults'
import { fmtMoney, parseMoney, toCSV, balance } from '../src/lib/finance'
import { goalProgress } from '../src/lib/goals'
import { habitStats } from '../src/lib/habits'
import { detectIntent, parseDateIn, parseDurationIn, parseList, parseTimeIn, cleanTitle } from '../src/lib/nlp'
import { freeSlots, plan } from '../src/lib/planner'
import { eventOccurrences, findConflicts, occursOn, seriesConflicts } from '../src/lib/recurrence'
import { respond } from '../src/lib/assistant'
import { validateBackup, BackupError } from '../src/lib/backup'
import { matchesFilter } from '../src/lib/tasks'
import type { CalEvent, Data, Goal, Habit, Task } from '../src/lib/types'

// Quinta-feira, 22/10/2026, 10:00 (horário local)
const NOW = new Date(2026, 9, 22, 10, 0)
const REF = '2026-10-22'

let n = 0
const task = (p: Partial<Task> & { title: string }): Task => ({
  id: 't' + ++n, createdAt: '', updatedAt: '', description: '', priority: 'media', status: 'a_fazer', subtasks: [], tags: [], notes: '', order: n, ...p,
})
const ev = (p: Partial<CalEvent> & { title: string; date: string; start: string; durationMin: number }): CalEvent => ({
  id: 'e' + ++n, createdAt: '', updatedAt: '', description: '', location: '', exceptions: [], doneDates: [], ...p,
})
const emptyData = (): Data => ({ tasks: [], events: [], categories: [], goals: [], subjects: [], exams: [], sessions: [], reviews: [], habits: [], transactions: [], finCategories: [], savings: [], journal: [], memories: [], notes: [], chat: [] })

describe('datas', () => {
  it('soma dias e meses no fuso local', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(diffDays('2026-11-01', '2026-10-22')).toBe(10)
    expect(startOfWeek(REF, 0)).toBe('2026-10-18')
    expect(startOfWeek(REF, 1)).toBe('2026-10-19')
    expect(fmtLong(REF)).toBe('Quinta-feira, 22 de outubro')
  })
})

describe('recorrência e conflitos', () => {
  it('expande eventos semanais e diários', () => {
    expect(occursOn('2026-10-19', { freq: 'semanal', interval: 1, weekdays: [1, 3] }, '2026-10-21')).toBe(true)
    expect(occursOn('2026-10-19', { freq: 'semanal', interval: 2, weekdays: [1] }, '2026-10-26')).toBe(false)
    expect(occursOn('2026-10-19', { freq: 'semanal', interval: 2, weekdays: [1] }, '2026-11-02')).toBe(true)
    expect(occursOn('2026-01-31', { freq: 'mensal', interval: 1 }, '2026-02-28')).toBe(true)
    const e = ev({ title: 'Academia', date: '2026-10-20', start: '07:00', durationMin: 60, recurrence: { freq: 'diaria', interval: 1 }, exceptions: ['2026-10-23'] })
    const occ = eventOccurrences([e], '2026-10-22', '2026-10-25')
    expect(occ.map((o) => o.date)).toEqual(['2026-10-22', '2026-10-24', '2026-10-25'])
  })
  it('detecta conflitos de horário', () => {
    const a = ev({ title: 'Aula', date: REF, start: '14:00', durationMin: 90 })
    expect(findConflicts([a], REF, 15 * 60, 16 * 60)).toHaveLength(1)
    expect(findConflicts([a], REF, 15 * 60 + 30, 16 * 60)).toHaveLength(0)
    const rec = ev({ title: 'Inglês', date: '2026-10-20', start: '14:30', durationMin: 60, recurrence: { freq: 'semanal', interval: 1, weekdays: [4] } })
    expect(seriesConflicts([a], rec).length).toBe(1)
  })
})

describe('linguagem natural', () => {
  it('entende datas relativas', () => {
    expect(parseDateIn('amanhã', REF)?.date).toBe('2026-10-23')
    expect(parseDateIn('depois de amanhã', REF)?.date).toBe('2026-10-24')
    expect(parseDateIn('tenho prova sexta', REF)?.date).toBe('2026-10-23')
    expect(parseDateIn('na segunda', REF)?.date).toBe('2026-10-26')
    expect(parseDateIn('dia 30', REF)?.date).toBe('2026-10-30')
    expect(parseDateIn('dia 5', REF)?.date).toBe('2026-11-05')
    expect(parseDateIn('25/12', REF)?.date).toBe('2026-12-25')
    expect(parseDateIn('em 3 dias', REF)?.date).toBe('2026-10-25')
    expect(parseDateIn('próxima semana', REF)?.date).toBe('2026-10-26')
    expect(parseDateIn('quinta que vem', REF)?.date).toBe('2026-10-29')
  })
  it('entende horários e durações sem confundir', () => {
    expect(parseTimeIn('amanhã às 15h')?.time).toBe('15:00')
    expect(parseTimeIn('reunião 14:30')?.time).toBe('14:30')
    expect(parseTimeIn('às 3 da tarde')?.time).toBe('15:00')
    expect(parseTimeIn('15h30 dentista')?.time).toBe('15:30')
    expect(parseTimeIn('tenho 2h livres')).toBeNull()
    expect(parseTimeIn('tenho duas horas livres hoje')).toBeNull()
    expect(parseTimeIn('prova dia 30/10')).toBeNull()
    expect(parseDurationIn('tenho duas horas livres')?.minutes).toBe(120)
    expect(parseDurationIn('1h30 de estudo')?.minutes).toBe(90)
    expect(parseDurationIn('meia hora')?.minutes).toBe(30)
    expect(parseDurationIn('uma hora e meia')?.minutes).toBe(90)
  })
  it('detecta intenções', () => {
    expect(detectIntent('Tenho prova sexta e preciso estudar três matérias.')).toBe('exam_plan')
    expect(detectIntent('Estou com muita coisa acumulada. Me ajuda a organizar a semana?')).toBe('organize_week')
    expect(detectIntent('Quero aprender francês em três meses.')).toBe('learn_goal')
    expect(detectIntent('Tenho duas horas livres hoje. O que posso adiantar?')).toBe('free_time')
    expect(detectIntent('Adicione uma tarefa para amanhã às 15h.')).toBe('add_task')
    expect(detectIntent('Reorganize meu planejamento sem tirar meu tempo de descanso.')).toBe('reorganize')
    expect(detectIntent('Marque dentista amanhã às 14h')).toBe('add_event')
  })
  it('extrai título e listas', () => {
    expect(cleanTitle('Adicione uma tarefa para amanhã às 15h: comprar presente', ['amanha', 'as 15h'])).toBe('Comprar presente')
    expect(parseList('preciso estudar matemática, português e história')).toEqual(['Matemática', 'Português', 'História'])
  })
})

describe('planejador', () => {
  const settings = defaultSettings()
  it('não sobrepõe eventos, descansos nem outras tarefas', () => {
    const events = [ev({ title: 'Aula', date: REF, start: '10:30', durationMin: 90 })]
    const tasks = [
      task({ title: 'A', dueDate: REF, estimateMin: 60, priority: 'alta' }),
      task({ title: 'B', dueDate: REF, estimateMin: 45 }),
      task({ title: 'C', estimateMin: 30 }),
    ]
    const r = plan({ tasks, events, settings, now: NOW })
    expect(r.proposals).toHaveLength(3)
    const byDay = new Map<string, [number, number][]>()
    const toM = (s: string) => +s.slice(0, 2) * 60 + +s.slice(3)
    for (const p of r.proposals) {
      const s = toM(p.start)
      const e = toM(p.end)
      // não colide com a aula (10:30–12:00 + respiro) nem com almoço (12–13) / jantar (19–20)
      if (p.date === REF) {
        expect(e <= 10 * 60 + 20 || s >= 12 * 60 + 10).toBe(true)
        expect(e <= 12 * 60 || s >= 13 * 60).toBe(true)
        expect(s >= 10 * 60).toBe(true) // nada no passado
      }
      for (const [os, oe] of byDay.get(p.date) ?? []) expect(s >= oe || e <= os).toBe(true)
      byDay.set(p.date, [...(byDay.get(p.date) ?? []), [s, e]])
    }
    // A (alta, vence hoje) vem antes
    expect(r.proposals[0].title).toBe('A')
  })
  it('respeita o limite diário de foco e não agenda após o prazo', () => {
    const s = { ...settings, planning: { ...settings.planning, maxFocusMinPerDay: 60 } }
    const tasks = [task({ title: 'X', dueDate: REF, estimateMin: 50 }), task({ title: 'Y', dueDate: REF, estimateMin: 50 })]
    const r = plan({ tasks, events: [], settings: s, now: NOW })
    expect(r.proposals).toHaveLength(1)
    expect(r.unscheduled).toHaveLength(1)
    expect(r.unscheduled[0].reason).toMatch(/limite diário/)
  })
  it('apenas propõe — não altera as tarefas originais', () => {
    const t = task({ title: 'Z', plannedDate: '2026-10-21', plannedStart: '09:00', plannedEnd: '10:00' })
    const before = JSON.stringify(t)
    const r = plan({ tasks: [t], events: [], settings, now: NOW })
    expect(JSON.stringify(t)).toBe(before)
    expect(r.proposals[0].from?.date).toBe('2026-10-21') // bloco perdido → proposta de mover
  })
  it('não move tarefas com bloco futuro sem pedido explícito, mas move se um bloqueio as atingir', () => {
    const t = task({ title: 'Futuro', plannedDate: REF, plannedStart: '15:00', plannedEnd: '16:00' })
    expect(plan({ tasks: [t], events: [], settings, now: NOW }).proposals).toHaveLength(0)
    const r = plan({ tasks: [t], events: [], settings, now: NOW, blocked: [{ date: REF, start: 14 * 60, end: 17 * 60, label: 'x' }] })
    expect(r.proposals).toHaveLength(1)
    const p0 = r.proposals[0]
    expect(p0.date > REF || p0.end <= '14:00' || p0.start >= '17:00').toBe(true)
  })
  it('avisa conflitos entre eventos sem movê-los', () => {
    const events = [ev({ title: 'A', date: REF, start: '15:00', durationMin: 60 }), ev({ title: 'B', date: REF, start: '15:30', durationMin: 60 })]
    const r = plan({ tasks: [], events, settings, now: NOW })
    expect(r.warnings.length).toBe(1)
    expect(r.proposals).toHaveLength(0)
  })
  it('respeita o dia mínimo de cada sessão (cronograma distribuído)', () => {
    const tasks = ['2026-10-22', '2026-10-23', '2026-10-24'].map((d) => task({ title: d, dueDate: d, estimateMin: 45 }))
    const r = plan({ tasks, events: [], settings, now: NOW, notBefore: Object.fromEntries(tasks.map((t) => [t.id, t.dueDate!])) })
    expect(r.proposals.map((p) => p.date).sort()).toEqual(['2026-10-22', '2026-10-23', '2026-10-24'])
  })
  it('calcula horários livres a partir de agora', () => {
    const slots = freeSlots(REF, { tasks: [], events: [], settings, now: NOW })
    expect(slots[0].start).toBe(10 * 60 + 15)
    expect(slots.every((s) => s.end <= 22 * 60)).toBe(true)
  })
})

describe('assistente', () => {
  const ctx = () => ({ data: emptyData(), settings: defaultSettings(), now: NOW })
  it('cria proposta de tarefa com data e hora', () => {
    const r = respond('Adicione uma tarefa para amanhã às 15h: ligar para a vó', ctx())
    const p = r.proposals![0]
    expect(p.kind).toBe('create_task')
    if (p.kind === 'create_task') {
      expect(p.task.title).toBe('Ligar para a vó')
      expect(p.task.dueDate).toBe('2026-10-23')
      expect(p.task.dueTime).toBe('15:00')
    }
  })
  it('monta plano de estudos para a prova', () => {
    const r = respond('Tenho prova sexta e preciso estudar matemática, português e história', ctx())
    expect(r.proposals!.some((p) => p.kind === 'create_exam')).toBe(true)
    const studies = r.proposals!.filter((p) => p.kind === 'create_task')
    expect(studies.length).toBeGreaterThanOrEqual(3)
    // sessões distribuídas em dias diferentes, nunca no dia da prova
    const days = new Set(studies.map((p) => p.kind === 'create_task' && p.task.dueDate))
    expect(days.has('2026-10-23')).toBe(false)
    expect(r.explanation!.join(' ')).toMatch(/não garante/)
  })
  it('quebra objetivo em etapas', () => {
    const r = respond('Quero aprender francês em três meses', ctx())
    const g = r.proposals!.find((p) => p.kind === 'create_goal')
    expect(g && g.kind === 'create_goal' && g.goal.steps!.length).toBeGreaterThanOrEqual(3)
  })
  it('responde honestamente quando não entende', () => {
    expect(respond('xyz abc', ctx()).text).toMatch(/Não consegui entender/)
  })
})

describe('hábitos, metas e finanças', () => {
  it('estatísticas de hábito tratam descanso sem punir', () => {
    const h: Habit = { id: 'h', createdAt: '2026-10-15T00:00:00Z', updatedAt: '', name: 'Ler', target: '', color: 'salvia', frequency: { type: 'diaria' }, paused: false, order: 0,
      log: { '2026-10-19': 'feito', '2026-10-20': 'descanso', '2026-10-21': 'feito' } }
    const s = habitStats(h, REF)
    expect(s.streak).toBe(2)
    expect(s.doneTotal).toBe(2)
  })
  it('progresso de objetivo vem só de etapas/tarefas reais', () => {
    const g: Goal = { id: 'g', createdAt: '', updatedAt: '', name: 'X', description: '', kind: 'projeto', status: 'ativo', notes: '', history: [],
      steps: [{ id: '1', title: 'a', done: true }, { id: '2', title: 'b', done: false }] }
    expect(goalProgress(g, []).pct).toBe(50)
    expect(goalProgress(g, [task({ title: 't', goalId: 'g', status: 'concluida' }), task({ title: 'u', goalId: 'g' })]).pct).toBe(50)
    expect(goalProgress({ ...g, steps: [] }, []).pct).toBe(0)
  })
  it('valores em reais', () => {
    expect(parseMoney('1.234,56')).toBe(123456)
    expect(parseMoney('R$ 50')).toBe(5000)
    expect(parseMoney('10.5')).toBe(1050)
    expect(parseMoney('abc')).toBeNull()
    expect(fmtMoney(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56')
    const txs = [
      { id: '1', createdAt: '', updatedAt: '', type: 'receita' as const, amountCents: 100000, date: REF, description: 'Salário', recurring: true, notes: '' },
      { id: '2', createdAt: '', updatedAt: '', type: 'despesa' as const, amountCents: 2550, date: REF, description: 'Lanche; café', recurring: false, notes: '' },
    ]
    expect(balance(txs)).toBe(97450)
    const csv = toCSV(txs, [])
    expect(csv.split('\r\n')).toHaveLength(3)
    expect(csv).toContain('"Lanche; café"')
    expect(csv).toContain('-25,50')
  })
})

describe('filtros de tarefas', () => {
  it('hoje / atrasadas / sem data', () => {
    const late = task({ title: 'late', dueDate: '2026-10-20' })
    const nodate = task({ title: 'nd' })
    expect(matchesFilter(late, 'atrasadas', REF)).toBe(true)
    expect(matchesFilter(late, 'hoje', REF)).toBe(true)
    expect(matchesFilter(nodate, 'sem_data', REF)).toBe(true)
    expect(matchesFilter({ ...late, status: 'concluida' }, 'atrasadas', REF)).toBe(false)
  })
})

describe('backup', () => {
  it('valida e rejeita arquivos inválidos', () => {
    expect(() => validateBackup({ foo: 1 })).toThrow(BackupError)
    expect(() => validateBackup({ app: 'life-os', version: 1, data: { tasks: [{ title: 'sem id' }] } })).toThrow(/identificador/)
    expect(() => validateBackup({ app: 'life-os', version: 1, data: { tasks: [{ id: 'a', dueDate: '2026-02-31' }] } })).toThrow(/Data inválida/)
    const ok = validateBackup({ app: 'life-os', version: 1, data: { tasks: [{ id: 'a', title: 'x' }] }, settings: {} })
    expect(ok.counts.tasks).toBe(1)
    expect(ok.settings.planning.availability).toHaveLength(7)
  })
})
