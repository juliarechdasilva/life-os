import { AlertTriangle, Coffee, Info, Settings2, Wand2 } from 'lucide-react'
import { useState } from 'react'
import { ProposalList } from '../components/Proposals'
import { Card, Empty, Field, Progress, Switch } from '../components/ui'
import { fmtDuration, fmtRelative, fromMin, isValidTime, nowMin, toMin, today } from '../lib/dates'
import { plan, type PlanResult } from '../lib/planner'
import { useData, useSettings } from '../lib/store'
import { isDone, isOverdue } from '../lib/tasks'
import type { Proposal } from '../lib/types'
import { navigate, toast } from '../lib/ui'

export default function Reorganize() {
  const data = useData()
  const settings = useSettings()
  const ref = today()
  const [horizon, setHorizon] = useState(7)
  const [scope, setScope] = useState<'todas' | 'atrasadas' | 'hoje'>('todas')
  const [unavailable, setUnavailable] = useState(false)
  const [from, setFrom] = useState(fromMin(Math.ceil(nowMin() / 15) * 15))
  const [to, setTo] = useState(fromMin(Math.min(23 * 60 + 45, Math.ceil(nowMin() / 15) * 15 + 120)))
  const [replanFuture, setReplanFuture] = useState(false)
  const [result, setResult] = useState<PlanResult | null>(null)
  const [proposals, setProposals] = useState<Proposal[]>([])

  const pending = data.tasks.filter((t) => !isDone(t))
  const overdue = pending.filter((t) => isOverdue(t, ref))

  function generate() {
    if (unavailable && (!isValidTime(from) || !isValidTime(to) || toMin(to) <= toMin(from))) {
      toast('Informe um intervalo válido de indisponibilidade (o fim precisa ser depois do início).', 'erro')
      return
    }
    const only =
      scope === 'atrasadas'
        ? overdue.map((t) => t.id)
        : scope === 'hoje'
          ? pending.filter((t) => (t.dueDate && t.dueDate <= ref) || t.plannedDate === ref).map((t) => t.id)
          : undefined
    const r = plan({
      tasks: data.tasks,
      events: data.events,
      goals: data.goals,
      settings,
      horizonDays: horizon,
      onlyTaskIds: only,
      replanFuture,
      blocked: unavailable ? [{ date: ref, start: toMin(from), end: toMin(to), label: 'Indisponível' }] : [],
    })
    setResult(r)
    setProposals(r.proposals)
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Reorganizar minha vida</h1>
          <p>Analiso suas tarefas, prazos e compromissos e proponho um novo plano. Você aceita, edita ou recusa cada mudança.</p>
        </div>
      </div>

      <div className="dash">
        <div className="grid">
          <Card title="O que aconteceu?">
            <div className="stack">
              <div className="stat-row">
                <div className="stat">
                  <b>{pending.length}</b>
                  <span>pendentes</span>
                </div>
                <div className="stat">
                  <b className={overdue.length ? 'neg' : ''}>{overdue.length}</b>
                  <span>atrasadas</span>
                </div>
                <div className="stat">
                  <b>{pending.filter((t) => t.plannedDate && (t.plannedDate < ref || (t.plannedDate === ref && t.plannedEnd && toMin(t.plannedEnd) <= nowMin()))).length}</b>
                  <span>blocos perdidos</span>
                </div>
              </div>
              <Switch checked={unavailable} onChange={setUnavailable} label="Perdi tempo / não vou estar disponível hoje" />
              {unavailable && (
                <div className="row wrap">
                  <Field label="De">
                    <input className="input" type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
                  </Field>
                  <Field label="Até">
                    <input className="input" type="time" value={to} onChange={(e) => setTo(e.target.value)} />
                  </Field>
                  <p className="hint" style={{ flexBasis: '100%' }}>
                    Blocos planejados nesse intervalo serão remanejados. Tempo que já passou é considerado automaticamente: blocos não concluídos entram no replanejamento.
                  </p>
                </div>
              )}
              <div className="form-grid">
                <Field label="Quais tarefas">
                  <select className="select" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
                    <option value="todas">Todas as pendentes que precisam de horário</option>
                    <option value="hoje">Só as de hoje</option>
                    <option value="atrasadas">Só as atrasadas</option>
                  </select>
                </Field>
                <Field label="Período">
                  <select className="select" value={horizon} onChange={(e) => setHorizon(+e.target.value)}>
                    <option value={1}>Só hoje</option>
                    <option value={3}>Próximos 3 dias</option>
                    <option value={7}>Próximos 7 dias</option>
                    <option value={14}>Próximas 2 semanas</option>
                  </select>
                </Field>
              </div>
              <Switch checked={replanFuture} onChange={setReplanFuture} label="Também reorganizar blocos futuros já marcados" />
              <button className="btn primary" onClick={generate} disabled={!pending.length}>
                <Wand2 size={17} /> Gerar proposta
              </button>
              {!pending.length && <p className="hint">Você não tem tarefas pendentes para reorganizar.</p>}
            </div>
          </Card>

          {result && (
            <Card title="Proposta de planejamento">
              {proposals.length === 0 ? (
                <Empty compact title="Nada para mover" icon={<Coffee size={26} />}>
                  {result.unscheduled.length ? 'Não encontrei espaço para as tarefas abaixo.' : 'Seu plano atual já está de pé — nenhuma tarefa precisa de novo horário.'}
                </Empty>
              ) : (
                <ProposalList key={result.proposals.map((p) => p.id).join()} proposals={proposals} onChange={setProposals} />
              )}
              {result.unscheduled.length > 0 && (
                <div className="callout warn" style={{ marginTop: 14 }}>
                  <AlertTriangle size={17} />
                  <div className="stack-sm">
                    <b>Não couberam ({result.unscheduled.length})</b>
                    {result.unscheduled.map((u) => (
                      <span key={u.task.id} className="small">
                        <b>{u.task.title}</b> — {u.reason}
                      </span>
                    ))}
                    <span className="small">Opções: renegociar o prazo, dividir a tarefa em partes menores, reduzir o tempo estimado ou aumentar o limite diário em Configurações. Nada foi apagado.</span>
                  </div>
                </div>
              )}
              {result.warnings.map((w) => (
                <div key={w} className="callout danger" style={{ marginTop: 10 }}>
                  <AlertTriangle size={17} />
                  <span className="small">{w}</span>
                </div>
              ))}
              <p className="tiny faint" style={{ marginTop: 12 }}>
                A proposta é uma sugestão e pode ser ajustada a qualquer momento. Nenhum cronograma é perfeito — revise o que fizer sentido para você.
              </p>
            </Card>
          )}
        </div>

        <div className="grid">
          {result && (
            <Card title="Por que esta proposta">
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {result.explanation.map((e) => (
                  <li key={e} style={{ marginBottom: 4 }}>
                    {e}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {result && (
            <Card title="Carga por dia">
              <div className="stack">
                {result.freeByDay.map((d) => (
                  <div key={d.date} className="stack-sm">
                    <div className="row between small">
                      <span>{fmtRelative(d.date, ref)}</span>
                      <span className="faint num">
                        {fmtDuration(d.plannedMin)} de {fmtDuration(settings.planning.maxFocusMinPerDay)} · {fmtDuration(d.freeMin)} livres
                      </span>
                    </div>
                    <Progress value={(d.plannedMin / settings.planning.maxFocusMinPerDay) * 100} />
                  </div>
                ))}
              </div>
            </Card>
          )}
          <Card title="Regras que eu sigo">
            <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
              <li>Não movo compromissos fixos — conflitos viram avisos.</li>
              <li>Não apago tarefas.</li>
              <li>Não coloco duas atividades no mesmo horário.</li>
              <li>Só uso seus horários disponíveis e preservo os descansos.</li>
              <li>Não preencho todo o tempo livre: no máximo {fmtDuration(settings.planning.maxFocusMinPerDay)} de foco por dia e {settings.planning.bufferMin} min de respiro entre atividades.</li>
              <li>Nada é salvo até você aceitar.</li>
            </ul>
            <div className="row wrap" style={{ marginTop: 12 }}>
              {settings.planning.rest.map((r) => (
                <span key={r.id} className="tag">
                  <Coffee size={12} /> {r.label} {r.start}–{r.end}
                </span>
              ))}
            </div>
            <button className="link small" style={{ marginTop: 12 }} onClick={() => navigate('configuracoes?secao=planejamento')}>
              <Settings2 size={14} /> Ajustar horários e descansos
            </button>
          </Card>
          <div className="callout neutral">
            <Info size={17} />
            <span className="small">Funciona offline, por regras locais. Também dá para pedir pelo assistente: "perdi duas horas hoje e não consegui estudar".</span>
          </div>
        </div>
      </div>
    </div>
  )
}
