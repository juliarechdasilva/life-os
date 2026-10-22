import { ArrowRight, Check, Pencil, X } from 'lucide-react'
import { useState } from 'react'
import { applyMany } from '../lib/assistant'
import { fmtRelative, isValidTime, toMin, today } from '../lib/dates'
import { useData } from '../lib/store'
import type { Proposal } from '../lib/types'
import { toast } from '../lib/ui'

function summary(p: Proposal) {
  const ref = today()
  switch (p.kind) {
    case 'schedule':
      return { title: p.title, line: `${p.from ? 'Mover para' : 'Agendar'} ${fmtRelative(p.date, ref).toLowerCase()}, ${p.start}–${p.end}`, from: p.from ? `Antes: ${fmtRelative(p.from.date, ref).toLowerCase()}, ${p.from.start}–${p.from.end}` : undefined }
    case 'create_task':
      return {
        title: p.task.title,
        line: `Nova tarefa${p.task.dueDate ? ' · ' + fmtRelative(p.task.dueDate, ref).toLowerCase() : ' · sem data'}${p.task.plannedStart ? ` · ${p.task.plannedStart}–${p.task.plannedEnd}` : p.task.dueTime ? ' · ' + p.task.dueTime : ''}${p.task.estimateMin ? ` · ${p.task.estimateMin} min` : ''}`,
      }
    case 'create_event':
      return { title: p.event.title, line: `Novo compromisso · ${fmtRelative(p.event.date, ref).toLowerCase()}, ${p.event.start} (${p.event.durationMin} min)` }
    case 'create_goal':
      return { title: p.goal.name, line: `Novo ${p.goal.kind === 'projeto' ? 'projeto' : 'objetivo'} · ${p.goal.steps?.length ?? 0} etapas${p.goal.targetDate ? ' · até ' + p.goal.targetDate.split('-').reverse().join('/') : ''}` }
    case 'create_exam':
      return { title: p.exam.title, line: `Registrar prova · ${fmtRelative(p.exam.date, ref).toLowerCase()}` }
  }
}

/** Lista de propostas: o usuário aceita, edita ou recusa cada uma. Nada é salvo antes. */
export function ProposalList({ proposals, onChange, readOnly }: { proposals: Proposal[]; onChange: (p: Proposal[]) => unknown; readOnly?: boolean }) {
  const data = useData()
  const pending = proposals.filter((p) => p.status === 'pendente')
  const [sel, setSel] = useState<Set<string>>(() => new Set(pending.map((p) => p.id)))
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const update = (id: string, patch: Partial<Proposal>) => onChange(proposals.map((p) => (p.id === id ? ({ ...p, ...patch } as Proposal) : p)))

  async function accept(ids: string[]) {
    const list = proposals.filter((p) => ids.includes(p.id) && p.status === 'pendente')
    if (!list.length) return
    // valida edições
    for (const p of list) {
      if (p.kind === 'schedule' && (!isValidTime(p.start) || !isValidTime(p.end) || toMin(p.end) <= toMin(p.start))) {
        toast(`Horário inválido em "${p.title}".`, 'erro')
        return
      }
    }
    setBusy(true)
    const errors = await applyMany(list, data)
    setBusy(false)
    if (errors.length) {
      toast(`Algumas alterações falharam: ${errors.join(' ')}`, 'erro')
      return
    }
    await onChange(proposals.map((p) => (ids.includes(p.id) && p.status === 'pendente' ? ({ ...p, status: 'aceita' } as Proposal) : p)))
    toast(`${list.length} alteraç${list.length === 1 ? 'ão aplicada' : 'ões aplicadas'}.`)
  }

  const reject = (ids: string[]) => onChange(proposals.map((p) => (ids.includes(p.id) && p.status === 'pendente' ? ({ ...p, status: 'rejeitada' } as Proposal) : p)))

  return (
    <div>
      {proposals.map((p) => {
        const s = summary(p)
        const isEditing = editing === p.id && p.status === 'pendente'
        return (
          <div key={p.id} className={`proposal ${p.status}`}>
            {p.status === 'pendente' && !readOnly ? (
              <input
                type="checkbox"
                className="check square"
                checked={sel.has(p.id)}
                onChange={(e) => setSel((x) => { const n = new Set(x); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n })}
                aria-label={`Selecionar: ${s.title}`}
                style={{ marginTop: 2 }}
              />
            ) : (
              <span style={{ width: 19, display: 'grid', placeItems: 'center', color: p.status === 'aceita' ? 'var(--sage-strong)' : 'var(--text-3)' }}>{p.status === 'aceita' ? <Check size={16} /> : <X size={16} />}</span>
            )}
            <div className="grow">
              <div style={{ fontWeight: 550 }}>{s.title}</div>
              <div className="small">
                {s.line}
                {p.status !== 'pendente' && <span className="faint"> · {p.status}</span>}
              </div>
              {s.from && <div className="tiny faint row" style={{ gap: 4 }}>{s.from} <ArrowRight size={11} /></div>}
              {p.kind === 'create_event' && p.conflicts.length > 0 && <div className="tiny warn-text">Conflita com: {p.conflicts.join(', ')}</div>}
              <div className="why">{p.reason}</div>
              {isEditing && (
                <div className="row wrap" style={{ marginTop: 8 }}>
                  {p.kind === 'schedule' && (
                    <>
                      <input className="input" type="date" style={{ maxWidth: 160 }} value={p.date} onChange={(e) => update(p.id, { date: e.target.value })} aria-label="Data" />
                      <input className="input" type="time" style={{ maxWidth: 110 }} value={p.start} onChange={(e) => update(p.id, { start: e.target.value })} aria-label="Início" />
                      <input className="input" type="time" style={{ maxWidth: 110 }} value={p.end} onChange={(e) => update(p.id, { end: e.target.value })} aria-label="Fim" />
                    </>
                  )}
                  {p.kind === 'create_task' && (
                    <>
                      <input className="input" value={p.task.title} onChange={(e) => update(p.id, { task: { ...p.task, title: e.target.value } })} aria-label="Título" />
                      <input className="input" type="date" style={{ maxWidth: 160 }} value={p.task.dueDate ?? ''} onChange={(e) => update(p.id, { task: { ...p.task, dueDate: e.target.value || undefined, plannedDate: p.task.plannedDate ? e.target.value || undefined : undefined } })} aria-label="Data" />
                      <input className="input" type="time" style={{ maxWidth: 110 }} value={p.task.plannedStart ?? p.task.dueTime ?? ''} onChange={(e) => update(p.id, { task: p.task.plannedStart ? { ...p.task, plannedStart: e.target.value } : { ...p.task, dueTime: e.target.value || undefined } })} aria-label="Horário" />
                    </>
                  )}
                  {p.kind === 'create_event' && (
                    <>
                      <input className="input" value={p.event.title} onChange={(e) => update(p.id, { event: { ...p.event, title: e.target.value } })} aria-label="Título" />
                      <input className="input" type="date" style={{ maxWidth: 160 }} value={p.event.date} onChange={(e) => update(p.id, { event: { ...p.event, date: e.target.value } })} aria-label="Data" />
                      <input className="input" type="time" style={{ maxWidth: 110 }} value={p.event.start} onChange={(e) => update(p.id, { event: { ...p.event, start: e.target.value } })} aria-label="Início" />
                    </>
                  )}
                  {p.kind === 'create_goal' && <input className="input" value={p.goal.name} onChange={(e) => update(p.id, { goal: { ...p.goal, name: e.target.value } })} aria-label="Nome" />}
                  {p.kind === 'create_exam' && (
                    <>
                      <input className="input" value={p.exam.title} onChange={(e) => update(p.id, { exam: { ...p.exam, title: e.target.value } })} aria-label="Título" />
                      <input className="input" type="date" style={{ maxWidth: 160 }} value={p.exam.date} onChange={(e) => update(p.id, { exam: { ...p.exam, date: e.target.value } })} aria-label="Data" />
                    </>
                  )}
                </div>
              )}
            </div>
            {p.status === 'pendente' && !readOnly && (
              <div className="row" style={{ gap: 0 }}>
                <button className="icon-btn sm" aria-label={isEditing ? 'Concluir edição' : `Editar: ${s.title}`} onClick={() => setEditing(isEditing ? null : p.id)}>
                  {isEditing ? <Check size={15} /> : <Pencil size={15} />}
                </button>
                <button className="icon-btn sm" aria-label={`Recusar: ${s.title}`} onClick={() => reject([p.id])}>
                  <X size={15} />
                </button>
              </div>
            )}
          </div>
        )
      })}
      {pending.length > 0 && !readOnly && (
        <div className="row wrap" style={{ marginTop: 12 }}>
          <button className="btn primary" disabled={busy || !pending.some((p) => sel.has(p.id))} onClick={() => accept(pending.filter((p) => sel.has(p.id)).map((p) => p.id))}>
            <Check size={16} /> {pending.every((p) => sel.has(p.id)) ? (pending.length > 1 ? 'Aceitar tudo' : 'Confirmar') : `Aceitar ${pending.filter((p) => sel.has(p.id)).length} selecionada(s)`}
          </button>
          <button className="btn" disabled={busy} onClick={() => reject(pending.map((p) => p.id))}>
            Recusar {pending.length > 1 ? 'tudo' : ''}
          </button>
        </div>
      )}
    </div>
  )
}
