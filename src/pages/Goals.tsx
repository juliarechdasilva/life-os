import { ArrowLeft, Check, ChevronRight, Edit3, FolderKanban, ListPlus, Pause, Play, Plus, Target, Trash2, Trophy } from 'lucide-react'
import { useState } from 'react'
import { TaskRow } from '../components/TaskRow'
import { Card, Empty, Menu, Progress, Ring, Seg } from '../components/ui'
import { fmtDate, fmtRelative, today } from '../lib/dates'
import { goalProgress, nextStep } from '../lib/goals'
import { patch, remove, saveMany, uid, useData } from '../lib/store'
import { newTask } from '../lib/tasks'
import type { Goal, Task } from '../lib/types'
import { attempt, choose, confirm, navigate, openEditor, useRoute } from '../lib/ui'

type Filter = 'todos' | 'ativo' | 'pausado' | 'concluido'

export default function Goals() {
  const { params } = useRoute()
  const id = params.get('id')
  return id ? <GoalDetail id={id} /> : <GoalList />
}

function GoalList() {
  const data = useData()
  const [f, setF] = useState<Filter>('todos')
  const list = data.goals.filter((g) => f === 'todos' || g.status === f).sort((a, b) => (a.status === b.status ? (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999') : a.status === 'ativo' ? -1 : 1))
  const cat = (id?: string) => data.categories.find((c) => c.id === id)
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Meus objetivos</h1>
          <p>Transforme sonhos grandes em etapas pequenas.</p>
        </div>
        <button className="btn primary sm" onClick={() => openEditor({ type: 'goal' })}>
          <Plus size={16} /> Novo objetivo
        </button>
      </div>
      <div style={{ marginBottom: 16 }}>
        <Seg
          label="Filtrar objetivos"
          value={f}
          onChange={setF}
          options={[
            { value: 'todos', label: `Todos (${data.goals.length})` },
            { value: 'ativo', label: 'Em andamento' },
            { value: 'pausado', label: 'Pausados' },
            { value: 'concluido', label: 'Concluídos' },
          ]}
        />
      </div>
      {list.length === 0 ? (
        <div className="card">
          <Empty
            title={data.goals.length ? 'Nada neste filtro' : 'Qual é o seu próximo grande passo?'}
            icon={<Target size={34} />}
            action={
              <div className="row wrap" style={{ justifyContent: 'center' }}>
                <button className="btn primary" onClick={() => openEditor({ type: 'goal' })}>
                  Criar objetivo
                </button>
                <button className="btn" onClick={() => navigate('assistente')}>
                  Pedir ao assistente
                </button>
              </div>
            }
          >
            Aprender um idioma, ler 12 livros, planejar uma viagem… O assistente pode dividir seu objetivo em etapas: "quero aprender francês em três meses".
          </Empty>
        </div>
      ) : (
        <div className="grid-3">
          {list.map((g) => {
            const p = goalProgress(g, data.tasks)
            const c = cat(g.categoryId)
            return (
              <button key={g.id} className="card entry-card" onClick={() => navigate(`objetivos?id=${g.id}`)}>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <span className="icon-tile" data-c={c?.color ?? 'salvia'}>
                    {g.kind === 'projeto' ? <FolderKanban size={19} /> : <Target size={19} />}
                  </span>
                  <div className="grow">
                    <b>{g.name}</b>
                    <div className="tiny faint">
                      {g.kind === 'projeto' ? 'Projeto' : 'Objetivo'} · {g.status === 'ativo' ? 'Em andamento' : g.status === 'pausado' ? 'Pausado' : 'Concluído'} · {p.pct}%
                    </div>
                  </div>
                  <ChevronRight size={18} className="faint" />
                </div>
                <div style={{ margin: '12px 0 8px' }}>
                  <Progress value={p.pct} color={c?.color} />
                </div>
                <div className="row between tiny faint">
                  <span>
                    {p.done}/{p.total} {p.total === 1 ? 'item' : 'itens'}
                  </span>
                  {g.targetDate && <span>Prazo: {fmtDate(g.targetDate)}</span>}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function GoalDetail({ id }: { id: string }) {
  const data = useData()
  const g = data.goals.find((x) => x.id === id)
  const [step, setStep] = useState('')
  const [notes, setNotes] = useState<string | null>(null)
  if (!g)
    return (
      <div className="page">
        <Empty title="Objetivo não encontrado" action={<button className="btn" onClick={() => navigate('objetivos')}>Voltar</button>}>
          Ele pode ter sido excluído.
        </Empty>
      </div>
    )
  const tasks = data.tasks.filter((t) => t.goalId === g.id)
  const p = goalProgress(g, data.tasks)
  const ns = nextStep(g, data.tasks)
  const ref = today()

  async function update(changes: Partial<Goal>, logText?: string) {
    const next = { ...g!, ...changes }
    const prog = goalProgress(next, data.tasks).pct
    const history = logText ? [...g!.history, { date: new Date().toISOString(), text: logText, progress: prog }] : g!.history
    await attempt(() => patch('goals', g!.id, { ...changes, history }))
  }
  const toggleStep = (sid: string) => {
    const s = g.steps.find((x) => x.id === sid)!
    update({ steps: g.steps.map((x) => (x.id === sid ? { ...x, done: !x.done, doneAt: !x.done ? new Date().toISOString() : undefined } : x)) }, `${s.done ? 'Etapa reaberta' : 'Etapa concluída'}: ${s.title}`)
  }
  const addStep = () => {
    if (!step.trim()) return
    update({ steps: [...g.steps, { id: uid(), title: step.trim(), done: false }] }, `Nova etapa: ${step.trim()}`)
    setStep('')
  }
  async function toProject() {
    const pendingSteps = g!.steps.filter((s) => !s.done)
    const v = await choose({
      title: 'Transformar em projeto',
      body: `O objetivo passa a ser um projeto.${pendingSteps.length ? ` Também posso criar ${pendingSteps.length} tarefa(s) a partir das etapas pendentes, vinculadas a ele.` : ''}`,
      options: pendingSteps.length
        ? [
            { label: 'Só transformar', value: 'only' },
            { label: 'Transformar e criar tarefas', value: 'tasks' },
          ]
        : [{ label: 'Transformar', value: 'only' }],
    })
    if (!v) return
    await update({ kind: 'projeto' }, 'Transformado em projeto')
    if (v === 'tasks') await attempt(() => saveMany('tasks', pendingSteps.map((s, i) => newTask({ title: s.title, goalId: g!.id, categoryId: g!.categoryId, order: Date.now() + i }))), `${pendingSteps.length} tarefa(s) criada(s).`)
  }
  async function del() {
    if (!(await confirm({ title: 'Excluir objetivo?', body: `"${g!.name}" e seu histórico serão excluídos.${tasks.length ? ` As ${tasks.length} tarefa(s) vinculada(s) continuam existindo, sem vínculo.` : ''}`, confirmLabel: 'Excluir', danger: true }))) return
    const ok = await attempt(async () => {
      if (tasks.length) await saveMany('tasks', tasks.map((t) => ({ ...t, goalId: undefined }) as Task))
      await remove('goals', g!.id)
      return true
    }, 'Objetivo excluído.')
    if (ok) navigate('objetivos')
  }

  return (
    <div className="page">
      <button className="link" onClick={() => navigate('objetivos')} style={{ marginBottom: 10 }}>
        <ArrowLeft size={16} /> Objetivos
      </button>
      <div className="page-head">
        <div className="row" style={{ alignItems: 'center', gap: 14 }}>
          <Ring value={p.pct} label={`Progresso: ${p.pct}%`} />
          <div>
            <h1>{g.name}</h1>
            <p>
              {g.kind === 'projeto' ? 'Projeto' : 'Objetivo'} · {g.status === 'ativo' ? 'Em andamento' : g.status === 'pausado' ? 'Pausado' : 'Concluído'}
              {g.targetDate && ` · prazo ${fmtRelative(g.targetDate, ref).toLowerCase()}`}
            </p>
          </div>
        </div>
        <div className="row">
          <button className="btn sm" onClick={() => openEditor({ type: 'goal', id: g.id })}>
            <Edit3 size={15} /> Editar
          </button>
          <Menu
            trigger={<ChevronRight size={18} style={{ transform: 'rotate(90deg)' }} />}
            items={[
              ...(g.kind === 'objetivo' ? [{ label: 'Transformar em projeto', icon: <FolderKanban size={16} />, onClick: toProject }] : []),
              g.status === 'pausado'
                ? { label: 'Retomar', icon: <Play size={16} />, onClick: () => update({ status: 'ativo' }, 'Retomado') }
                : { label: 'Pausar', icon: <Pause size={16} />, onClick: () => update({ status: 'pausado' }, 'Pausado') },
              g.status === 'concluido'
                ? { label: 'Reabrir', icon: <Play size={16} />, onClick: () => update({ status: 'ativo' }, 'Reaberto') }
                : { label: 'Marcar como concluído', icon: <Trophy size={16} />, onClick: () => update({ status: 'concluido' }, 'Concluído 🎉') },
              { label: 'Excluir', icon: <Trash2 size={16} />, onClick: del, danger: true },
            ]}
          />
        </div>
      </div>
      {g.description && <p className="muted" style={{ marginBottom: 16, maxWidth: 720 }}>{g.description}</p>}

      <div className="dash">
        <div className="grid">
          {ns && g.status === 'ativo' && (
            <div className="callout">
              <Check size={17} />
              <span>
                <b>Próxima ação recomendada:</b> {ns}
              </span>
            </div>
          )}
          <Card title={`Etapas (${g.steps.filter((s) => s.done).length}/${g.steps.length})`}>
            {g.steps.length === 0 && <p className="small muted">Divida o objetivo em etapas concretas. O progresso é calculado só pelo que você realmente concluir.</p>}
            <div className="list">
              {g.steps.map((s, i) => (
                <div key={s.id} className="list-item">
                  <input type="checkbox" className="check" checked={s.done} onChange={() => toggleStep(s.id)} aria-label={`Concluir etapa ${s.title}`} />
                  <span className="grow" style={{ textDecoration: s.done ? 'line-through' : undefined, color: s.done ? 'var(--text-3)' : undefined }}>
                    <span className="faint small num">{i + 1}. </span>
                    {s.title}
                    {s.doneAt && <span className="tiny faint"> · {fmtDate(today(new Date(s.doneAt)))}</span>}
                  </span>
                  <button className="icon-btn sm" aria-label={`Criar tarefa da etapa ${s.title}`} title="Criar tarefa desta etapa" onClick={() => openEditor({ type: 'task', preset: { title: s.title, goalId: g.id, categoryId: g.categoryId } })}>
                    <ListPlus size={15} />
                  </button>
                  <button
                    className="icon-btn sm"
                    aria-label={`Remover etapa ${s.title}`}
                    onClick={async () => (await confirm({ title: 'Remover etapa?', body: s.title, confirmLabel: 'Remover', danger: true })) && update({ steps: g.steps.filter((x) => x.id !== s.id) }, `Etapa removida: ${s.title}`)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            <form className="row" style={{ marginTop: 10 }} onSubmit={(e) => (e.preventDefault(), addStep())}>
              <input className="input" value={step} onChange={(e) => setStep(e.target.value)} placeholder="Nova etapa" aria-label="Nova etapa" />
              <button className="btn sm" type="submit" disabled={!step.trim()}>
                <Plus size={15} /> Adicionar
              </button>
            </form>
          </Card>

          <Card
            title={`Tarefas relacionadas (${tasks.length})`}
            action={
              <button className="link small" onClick={() => openEditor({ type: 'task', preset: { goalId: g.id, categoryId: g.categoryId } })}>
                <Plus size={14} /> Nova tarefa
              </button>
            }
          >
            {tasks.length === 0 ? <p className="small muted">Nenhuma tarefa vinculada. Tarefas concluídas também contam para o progresso.</p> : <div className="stack-sm">{tasks.map((t) => <TaskRow key={t.id} task={t} compact />)}</div>}
          </Card>
        </div>

        <div className="grid">
          <Card title="Notas">
            <textarea
              className="textarea"
              value={notes ?? g.notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes != null && notes !== g.notes && attempt(() => patch('goals', g.id, { notes }), 'Notas salvas.')}
              placeholder="Ideias, links, aprendizados…"
              aria-label="Notas do objetivo"
            />
          </Card>
          <Card title="Histórico de evolução">
            {g.history.length === 0 ? (
              <p className="small muted">As mudanças aparecerão aqui.</p>
            ) : (
              <div className="list">
                {[...g.history].reverse().slice(0, 30).map((h, i) => (
                  <div key={i} className="list-item small">
                    <span className="grow">{h.text}</span>
                    <span className="tiny faint num" style={{ textAlign: 'right' }}>
                      {h.progress}%<br />
                      {fmtDate(today(new Date(h.date)))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
