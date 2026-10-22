import { fmtDate } from './dates'
import { fmtMoney } from './finance'
import { norm } from './nlp'
import type { Data } from './types'

export interface SearchHit {
  group: string
  id: string
  title: string
  subtitle: string
  route: string
}

export const GROUP_ORDER = ['Tarefas', 'Eventos', 'Projetos e objetivos', 'Matérias', 'Provas e trabalhos', 'Anotações', 'Diário', 'Memórias', 'Movimentações financeiras', 'Hábitos']

export function searchAll(data: Data, query: string, opts: { includeJournal: boolean }): SearchHit[] {
  const q = norm(query)
  if (q.length < 2) return []
  const terms = q.split(' ')
  const has = (...fields: (string | undefined)[]) => {
    const hay = norm(fields.filter(Boolean).join(' '))
    return terms.every((t) => hay.includes(t))
  }
  const hits: SearchHit[] = []
  for (const t of data.tasks)
    if (has(t.title, t.description, t.notes, t.tags.join(' '), t.subtasks.map((s) => s.title).join(' ')))
      hits.push({ group: 'Tarefas', id: t.id, title: t.title, subtitle: (t.status === 'concluida' ? 'Concluída · ' : '') + (t.dueDate ? fmtDate(t.dueDate) : 'Sem data'), route: `tarefas?id=${t.id}` })
  for (const e of data.events)
    if (has(e.title, e.description, e.location))
      hits.push({ group: 'Eventos', id: e.id, title: e.title, subtitle: `${fmtDate(e.date)} · ${e.start}${e.location ? ' · ' + e.location : ''}`, route: `agenda?id=${e.id}&data=${e.date}` })
  for (const g of data.goals)
    if (has(g.name, g.description, g.notes, g.steps.map((s) => s.title).join(' ')))
      hits.push({ group: 'Projetos e objetivos', id: g.id, title: g.name, subtitle: g.kind === 'projeto' ? 'Projeto' : 'Objetivo', route: `objetivos?id=${g.id}` })
  for (const s of data.subjects)
    if (has(s.name, s.notes, s.materials.map((m) => m.title + ' ' + m.note).join(' ')))
      hits.push({ group: 'Matérias', id: s.id, title: s.name, subtitle: 'Matéria', route: `estudos?materia=${s.id}` })
  for (const e of data.exams)
    if (has(e.title, e.notes, e.topics.map((t) => t.title).join(' ')))
      hits.push({ group: 'Provas e trabalhos', id: e.id, title: e.title, subtitle: fmtDate(e.date), route: `estudos?prova=${e.id}` })
  for (const n of data.notes)
    if (has(n.text)) hits.push({ group: 'Anotações', id: n.id, title: n.text.split('\n')[0].slice(0, 80), subtitle: 'Anotação rápida', route: `inicio?nota=${n.id}` })
  if (opts.includeJournal) {
    for (const j of data.journal)
      if (has(j.title, j.text, j.tags.join(' ')))
        hits.push({ group: 'Diário', id: j.id, title: j.title || j.text.slice(0, 60) || 'Entrada sem título', subtitle: fmtDate(j.date), route: `diario?id=${j.id}` })
    for (const m of data.memories)
      if (has(m.title, m.text, m.place))
        hits.push({ group: 'Memórias', id: m.id, title: m.title, subtitle: fmtDate(m.date), route: `diario?memoria=${m.id}` })
  }
  for (const t of data.transactions)
    if (has(t.description, t.notes))
      hits.push({ group: 'Movimentações financeiras', id: t.id, title: t.description, subtitle: `${fmtDate(t.date)} · ${t.type === 'despesa' ? '−' : '+'}${fmtMoney(t.amountCents)}`, route: `financas?id=${t.id}` })
  for (const h of data.habits) if (has(h.name, h.target)) hits.push({ group: 'Hábitos', id: h.id, title: h.name, subtitle: 'Hábito', route: `habitos?id=${h.id}` })
  return hits
}
