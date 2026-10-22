import { ArrowDown, ArrowUp, CheckCheck, ListChecks, Plus, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { TaskRow } from '../components/TaskRow'
import { Empty, Seg } from '../components/ui'
import { parseQuickTask } from '../lib/assistant'
import { addDays, fmtRelative, today } from '../lib/dates'
import { norm } from '../lib/nlp'
import { removeMany, save, saveMany, useData } from '../lib/store'
import { FILTER_LABEL, isDone, matchesFilter, newTask, PRIORITY_LABEL, PRIORITY_WEIGHT, STATUS_LABEL, type TaskFilter } from '../lib/tasks'
import type { Priority, Task } from '../lib/types'
import { attempt, confirm, openEditor, toast, useRoute } from '../lib/ui'

type Sort = 'manual' | 'prazo' | 'prioridade' | 'criacao'
const FILTERS: TaskFilter[] = ['hoje', 'semana', 'atrasadas', 'sem_data', 'importantes', 'concluidas', 'todas']

export default function Tasks() {
  const data = useData()
  const { params } = useRoute()
  const ref = today()
  const [view, setView] = useState<'lista' | 'quadro'>('lista')
  const [filter, setFilter] = useState<TaskFilter>((params.get('filtro') as TaskFilter) || 'todas')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [pri, setPri] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState<Sort>('prazo')
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [quick, setQuick] = useState('')

  useEffect(() => {
    const id = params.get('id')
    if (id) openEditor({ type: 'task', id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    let l = data.tasks.filter((t) => matchesFilter(t, filter, ref))
    if (q.trim()) {
      const n = norm(q)
      l = l.filter((t) => norm([t.title, t.description, t.notes, t.tags.join(' ')].join(' ')).includes(n))
    }
    if (cat) l = l.filter((t) => t.categoryId === cat)
    if (pri) l = l.filter((t) => t.priority === pri)
    if (status) l = l.filter((t) => t.status === status)
    const by: Record<Sort, (a: Task, b: Task) => number> = {
      manual: (a, b) => a.order - b.order,
      prazo: (a, b) => (a.dueDate ?? '9999') .localeCompare(b.dueDate ?? '9999') || (a.dueTime ?? '99').localeCompare(b.dueTime ?? '99') || PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority],
      prioridade: (a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'),
      criacao: (a, b) => b.createdAt.localeCompare(a.createdAt),
    }
    if (filter === 'concluidas') return l.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    return l.sort(by[sort])
  }, [data.tasks, filter, q, cat, pri, status, sort, ref])

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f, data.tasks.filter((t) => matchesFilter(t, f, ref)).length])), [data.tasks, ref])

  // Agrupamento da lista
  const groups = useMemo(() => {
    if (sort !== 'prazo' || filter === 'concluidas') return [{ label: '', items: filtered }]
    const g: { label: string; items: Task[] }[] = []
    const push = (label: string, t: Task) => {
      const x = g.find((y) => y.label === label)
      if (x) x.items.push(t)
      else g.push({ label, items: [t] })
    }
    for (const t of filtered) {
      if (isDone(t)) push('Concluídas', t)
      else if (!t.dueDate) push('Sem data', t)
      else if (t.dueDate < ref) push('Atrasadas', t)
      else if (t.dueDate === ref) push('Hoje', t)
      else if (t.dueDate === addDays(ref, 1)) push('Amanhã', t)
      else if (t.dueDate <= addDays(ref, 7)) push('Próximos 7 dias', t)
      else push('Mais tarde', t)
    }
    const order = ['Atrasadas', 'Hoje', 'Amanhã', 'Próximos 7 dias', 'Mais tarde', 'Sem data', 'Concluídas']
    return g.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label))
  }, [filtered, sort, filter, ref])

  async function quickAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!quick.trim()) return
    const parsed = parseQuickTask(quick, ref)
    if (!parsed.dueDate && filter === 'hoje') parsed.dueDate = ref
    const ok = await attempt(() => save('tasks', newTask(parsed)))
    if (ok) {
      toast(`Tarefa criada${parsed.dueDate ? ` para ${fmtRelative(parsed.dueDate, ref).toLowerCase()}${parsed.dueTime ? ' às ' + parsed.dueTime : ''}` : ''}.`)
      setQuick('')
    }
  }

  async function move(t: Task, dir: -1 | 1) {
    const list = filtered
    const i = list.findIndex((x) => x.id === t.id)
    const j = i + dir
    if (j < 0 || j >= list.length) return
    // normaliza a ordem da lista atual e troca as duas posições
    const reordered = list.map((x, k) => ({ ...x, order: k * 10 }))
    reordered[i].order = j * 10
    reordered[j].order = i * 10
    await attempt(() => saveMany('tasks', reordered))
  }

  const selTasks = data.tasks.filter((t) => selected.has(t.id))
  async function bulk(action: 'concluir' | 'hoje' | 'amanha' | 'excluir' | Priority) {
    if (!selTasks.length) return
    if (action === 'excluir') {
      if (!(await confirm({ title: `Excluir ${selTasks.length} tarefa(s)?`, body: 'Esta ação não pode ser desfeita.', confirmLabel: 'Excluir', danger: true }))) return
      await attempt(() => removeMany('tasks', selTasks.map((t) => t.id)), `${selTasks.length} tarefa(s) excluída(s).`)
    } else {
      const now = new Date().toISOString()
      const changes: Partial<Task> =
        action === 'concluir'
          ? { status: 'concluida', completedAt: now }
          : action === 'hoje'
            ? { dueDate: ref, plannedDate: undefined, plannedStart: undefined, plannedEnd: undefined }
            : action === 'amanha'
              ? { dueDate: addDays(ref, 1), plannedDate: undefined, plannedStart: undefined, plannedEnd: undefined }
              : { priority: action }
      await attempt(() => saveMany('tasks', selTasks.map((t) => ({ ...t, ...changes }))), `${selTasks.length} tarefa(s) atualizada(s).`)
    }
    setSelected(new Set())
    setSelecting(false)
  }

  // Kanban (arrastar entre colunas muda o status)
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const drop = (st: Task['status']) => {
    const t = data.tasks.find((x) => x.id === dragId)
    setOver(null)
    setDragId(null)
    if (!t || t.status === st) return
    attempt(() => save('tasks', { ...t, status: st, completedAt: st === 'concluida' ? new Date().toISOString() : undefined }), `Movida para "${STATUS_LABEL[st]}".`)
  }

  const nothing = data.tasks.length === 0
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Tarefas</h1>
          <p>
            {data.tasks.filter((t) => !isDone(t)).length} pendente(s) · {data.tasks.filter(isDone).length} concluída(s)
          </p>
        </div>
        <div className="row wrap">
          <Seg
            label="Visualização"
            value={view}
            onChange={setView}
            options={[
              { value: 'lista', label: 'Lista' },
              { value: 'quadro', label: 'Quadro' },
            ]}
          />
          <button className="btn primary sm" onClick={() => openEditor({ type: 'task', preset: filter === 'hoje' ? { dueDate: ref } : undefined })}>
            <Plus size={16} /> Nova tarefa
          </button>
        </div>
      </div>

      <form onSubmit={quickAdd} className="composer" style={{ marginBottom: 14 }}>
        <Plus size={18} className="faint" style={{ marginLeft: 6 }} />
        <input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder='Criação rápida: "Ligar para o médico amanhã 10h #saude !alta"' aria-label="Criação rápida de tarefa" />
        <button className="send" type="submit" disabled={!quick.trim()} aria-label="Criar tarefa">
          <ArrowUp size={18} />
        </button>
      </form>

      <div className="chips" style={{ marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {FILTER_LABEL[f]} <span className="n">{counts[f]}</span>
          </button>
        ))}
      </div>

      <div className="row wrap" style={{ marginBottom: 14, gap: 8 }}>
        <label className="searchbox" style={{ minWidth: 0, flex: '1 1 220px', display: 'flex' }}>
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar tarefas…" style={{ border: 0, background: 'none', minWidth: 0, flex: 1 }} aria-label="Buscar tarefas" />
        </label>
        <select className="select" style={{ width: 'auto', minHeight: 40 }} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filtrar por categoria">
          <option value="">Todas as categorias</option>
          {data.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="select" style={{ width: 'auto', minHeight: 40 }} value={pri} onChange={(e) => setPri(e.target.value)} aria-label="Filtrar por prioridade">
          <option value="">Qualquer prioridade</option>
          {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
        {view === 'lista' && (
          <>
            <select className="select" style={{ width: 'auto', minHeight: 40 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrar por status">
              <option value="">Qualquer status</option>
              {(Object.keys(STATUS_LABEL) as Task['status'][]).map((p) => (
                <option key={p} value={p}>
                  {STATUS_LABEL[p]}
                </option>
              ))}
            </select>
            <select className="select" style={{ width: 'auto', minHeight: 40 }} value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Ordenar">
              <option value="prazo">Ordenar por prazo</option>
              <option value="prioridade">Por prioridade</option>
              <option value="criacao">Mais recentes</option>
              <option value="manual">Ordem personalizada</option>
            </select>
            <button className="btn sm" aria-pressed={selecting} onClick={() => (setSelecting((s) => !s), setSelected(new Set()))}>
              {selecting ? <X size={15} /> : <ListChecks size={15} />} {selecting ? 'Cancelar' : 'Selecionar'}
            </button>
          </>
        )}
      </div>

      {selecting && (
        <div className="card soft row wrap" style={{ marginBottom: 12, padding: 10 }}>
          <span className="small">
            <b>{selected.size}</b> selecionada(s)
          </span>
          <button className="btn sm ghost" onClick={() => setSelected(new Set(filtered.map((t) => t.id)))}>
            Selecionar todas
          </button>
          <span className="grow" />
          <button className="btn sm" disabled={!selected.size} onClick={() => bulk('concluir')}>
            <CheckCheck size={15} /> Concluir
          </button>
          <button className="btn sm" disabled={!selected.size} onClick={() => bulk('hoje')}>
            Para hoje
          </button>
          <button className="btn sm" disabled={!selected.size} onClick={() => bulk('amanha')}>
            Para amanhã
          </button>
          <select className="select" style={{ width: 'auto', minHeight: 32 }} disabled={!selected.size} value="" onChange={(e) => e.target.value && bulk(e.target.value as Priority)} aria-label="Mudar prioridade">
            <option value="">Prioridade…</option>
            {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
          <button className="btn sm danger" disabled={!selected.size} onClick={() => bulk('excluir')}>
            <Trash2 size={15} /> Excluir
          </button>
        </div>
      )}

      {nothing ? (
        <div className="card">
          <Empty title="Sua lista está limpa" icon={<ListChecks size={34} />} action={<button className="btn primary" onClick={() => openEditor({ type: 'task' })}>Criar primeira tarefa</button>}>
            Use a criação rápida acima — dá para escrever a data e o horário do seu jeito, como "estudar química sexta 16h".
          </Empty>
        </div>
      ) : view === 'lista' ? (
        filtered.length === 0 ? (
          <div className="card">
            <Empty compact title={filter === 'atrasadas' ? 'Nada atrasado. 🌿' : 'Nenhuma tarefa aqui'}>
              {filter === 'hoje' ? 'Nada para hoje — aproveite ou adiante algo da semana.' : 'Tente outro filtro ou limpe a busca.'}
            </Empty>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.label || 'all'}>
              {g.label && (
                <div className="group-label">
                  <span className={g.label === 'Atrasadas' ? 'warn-text' : ''}>{g.label}</span>
                  <span className="faint">{g.items.length}</span>
                </div>
              )}
              <div className="stack-sm">
                {g.items.map((t, i) => (
                  <div key={t.id} className="row" style={{ alignItems: 'stretch' }}>
                    <div className="grow">
                      <TaskRow task={t} selectable={selecting} selected={selected.has(t.id)} onSelect={(v) => setSelected((s) => { const n = new Set(s); if (v) n.add(t.id); else n.delete(t.id); return n })} />
                      {filter === 'concluidas' && t.completedAt && (
                        <div className="tiny faint" style={{ margin: '2px 0 0 48px' }}>
                          Concluída {fmtRelative(today(new Date(t.completedAt)), ref).toLowerCase()} às {new Date(t.completedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                    {sort === 'manual' && (
                      <div className="stack-sm" style={{ justifyContent: 'center', gap: 0 }}>
                        <button className="icon-btn sm" aria-label={`Mover ${t.title} para cima`} disabled={i === 0} onClick={() => move(t, -1)}>
                          <ArrowUp size={15} />
                        </button>
                        <button className="icon-btn sm" aria-label={`Mover ${t.title} para baixo`} disabled={i === g.items.length - 1} onClick={() => move(t, 1)}>
                          <ArrowDown size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))
        )
      ) : (
        <div className="kanban">
          {(['a_fazer', 'em_andamento', 'concluida'] as Task['status'][]).map((st) => {
            const items = filtered.filter((t) => t.status === st)
            return (
              <div
                key={st}
                className={`kcol${over === st ? ' over' : ''}`}
                onDragOver={(e) => (e.preventDefault(), setOver(st))}
                onDragLeave={() => setOver(null)}
                onDrop={() => drop(st)}
                aria-label={STATUS_LABEL[st]}
              >
                <h3>
                  {STATUS_LABEL[st]} <span className="faint">{items.length}</span>
                </h3>
                {items.map((t) => {
                  const order: Task['status'][] = ['a_fazer', 'em_andamento', 'concluida']
                  const i = order.indexOf(st)
                  const moveTo = (to: Task['status']) => attempt(() => save('tasks', { ...t, status: to, completedAt: to === 'concluida' ? new Date().toISOString() : undefined }), `Movida para "${STATUS_LABEL[to]}".`)
                  return (
                    <div key={t.id} className={dragId === t.id ? 'dragging' : ''}>
                      <TaskRow task={t} draggable onDragStart={(e) => (e.dataTransfer.setData('text/plain', t.id), setDragId(t.id))} onDragEnd={() => setDragId(null)} />
                      <div className="row" style={{ justifyContent: 'space-between', padding: '2px 4px 0' }}>
                        {i > 0 ? (
                          <button className="link tiny" onClick={() => moveTo(order[i - 1])} aria-label={`Mover ${t.title} para ${STATUS_LABEL[order[i - 1]]}`}>
                            ← {STATUS_LABEL[order[i - 1]]}
                          </button>
                        ) : <span />}
                        {i < 2 && (
                          <button className="link tiny" onClick={() => moveTo(order[i + 1])} aria-label={`Mover ${t.title} para ${STATUS_LABEL[order[i + 1]]}`}>
                            {STATUS_LABEL[order[i + 1]]} →
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
                {items.length === 0 && <p className="tiny faint" style={{ padding: 6 }}>Arraste tarefas para cá ou use os botões ← → dos cartões.</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
