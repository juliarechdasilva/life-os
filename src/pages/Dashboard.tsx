import { AlarmClock, ArrowRight, CalendarPlus, Check, Clock, Coffee, ListPlus, Moon, Pin, PinOff, Sparkles, Sun, Sunrise, Target, Trash2, Wand2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { TaskRow } from '../components/TaskRow'
import { NewerBackupBanner, useCloud } from '../components/Cloud'
import { Card, Empty, Progress } from '../components/ui'
import { addDays, fmtT, fmtDuration, fmtLong, fromMin, greeting, nowMin, startOfWeek, toMin, today, weekday } from '../lib/dates'
import { fmtMoney } from '../lib/finance'
import { goalProgress, nextStep } from '../lib/goals'
import { isScheduled } from '../lib/habits'
import { freeMinutes, freeSlots, nextAction } from '../lib/planner'
import { eventOccurrences } from '../lib/recurrence'
import { patch, remove, save, useData, useSettings } from '../lib/store'
import { isDone, isOverdue, sortByUrgency } from '../lib/tasks'
import type { Habit } from '../lib/types'
import { attempt, confirm, navigate, openEditor, useRoute } from '../lib/ui'

export async function toggleHabit(h: Habit, d: string, value: 'feito' | 'descanso' = 'feito') {
  const log = { ...h.log }
  if (log[d] === value) delete log[d]
  else log[d] = value
  await attempt(() => patch('habits', h.id, { log }))
}

export default function Dashboard() {
  const data = useData()
  const settings = useSettings()
  const cloud = useCloud()
  const { params } = useRoute()
  const now = new Date()
  const ref = today(now)
  const m = nowMin(now)
  const h = now.getHours()

  const next = nextAction({ ...data, settings, now })
  const todayOcc = eventOccurrences(data.events, ref, ref)
  const pending = data.tasks.filter((t) => !isDone(t))
  const priority = sortByUrgency(
    pending.filter((t) => (t.dueDate && t.dueDate <= addDays(ref, 2)) || t.plannedDate === ref || t.priority === 'alta' || t.priority === 'urgente'),
    ref,
    data.goals,
  ).slice(0, 6)
  const doneToday = data.tasks.filter((t) => t.completedAt && today(new Date(t.completedAt)) === ref)
  const dueToday = pending.filter((t) => (t.dueDate && t.dueDate <= ref) || t.plannedDate === ref)
  const free = freeMinutes(freeSlots(ref, { ...data, settings, now }))

  // Linha do tempo do dia
  type Item = { start: number; end: number; title: string; kind: 'evento' | 'tarefa' | 'descanso'; color?: string; onClick?: () => void; done?: boolean }
  const timeline: Item[] = useMemo(() => {
    const items: Item[] = []
    for (const o of todayOcc) {
      const c = data.categories.find((c) => c.id === o.event.categoryId)
      items.push({ start: o.startMin, end: o.endMin, title: o.event.title, kind: 'evento', color: c?.color, done: o.done, onClick: () => openEditor({ type: 'event', id: o.event.id, date: ref }) })
    }
    for (const t of data.tasks) {
      const time = t.plannedDate === ref ? t.plannedStart : t.dueDate === ref && !t.plannedDate ? t.dueTime : undefined
      if (!time) continue
      const end = t.plannedDate === ref && t.plannedEnd ? toMin(t.plannedEnd) : toMin(time) + (t.estimateMin ?? 30)
      const c = data.categories.find((c) => c.id === t.categoryId)
      items.push({ start: toMin(time), end, title: t.title, kind: 'tarefa', color: c?.color ?? 'salvia', done: isDone(t), onClick: () => openEditor({ type: 'task', id: t.id }) })
    }
    for (const r of settings.planning.rest) if (r.days.includes(weekday(ref))) items.push({ start: toMin(r.start), end: toMin(r.end), title: r.label, kind: 'descanso' })
    return items.sort((a, b) => a.start - b.start)
  }, [data, settings, ref, todayOcc])

  const activeGoals = data.goals.filter((g) => g.status === 'ativo').slice(0, 4)
  const habits = data.habits.filter((h) => isScheduled(h, ref)).sort((a, b) => a.order - b.order)

  // Resumo semanal (dados reais)
  const ws = startOfWeek(ref, settings.weekStart)
  const we = addDays(ws, 6)
  const inWeek = (d?: string) => !!d && d >= ws && d <= we
  const weekDone = data.tasks.filter((t) => t.completedAt && inWeek(today(new Date(t.completedAt)))).length
  const weekEvents = eventOccurrences(data.events, ws, we).length
  const weekStudy = data.sessions.filter((s) => inWeek(s.date)).reduce((s, x) => s + x.durationMin, 0)
  const weekHabits = data.habits.reduce((s, h) => s + Object.entries(h.log).filter(([d, v]) => v === 'feito' && inWeek(d)).length, 0)
  const weekSpent = data.transactions.filter((t) => t.type === 'despesa' && inWeek(t.date)).reduce((s, t) => s + t.amountCents, 0)

  const records = Object.values(data).reduce((a, l) => a + l.length, 0) - data.categories.length - data.finCategories.length
  const lastBk = [settings.lastBackupAt, cloud?.enabled ? cloud.lastAt : undefined].filter(Boolean).sort().pop()
  const backupDays = lastBk ? Math.floor((now.getTime() - new Date(lastBk).getTime()) / 86400000) : null
  const needBackup = records >= 10 && (backupDays == null || backupDays >= 7) && !(cloud?.enabled && !cloud.lastError)
  const isEmpty = !data.tasks.length && !data.events.length && !data.goals.length && !data.habits.length

  return (
    <div className="page">
      <div className="hello">
        <div>
          <h1>
            {greeting(now)}
            {settings.name ? `, ${settings.name}` : ''}!
          </h1>
          <p className="date">{fmtLong(ref)}</p>
        </div>
        <span className="sun" aria-hidden="true">
          {h < 5 || h >= 18 ? <Moon size={30} /> : h < 9 ? <Sunrise size={30} /> : <Sun size={30} />}
        </span>
      </div>

      {isEmpty && (
        <div className="callout" style={{ marginBottom: 16 }}>
          <Sparkles size={18} />
          <span>
            Bem-vindo(a)! Comece adicionando uma tarefa ou um compromisso — ou escreva do seu jeito para o{' '}
            <button className="link" onClick={() => navigate('assistente')}>
              Life OS AI
            </button>
            , ex.: "tenho prova sexta e preciso estudar três matérias".
          </span>
        </div>
      )}

      <NewerBackupBanner />
      {needBackup && (
        <div className="callout warn" style={{ marginBottom: 16 }}>
          <span className="grow">
            {backupDays == null ? 'Você ainda não fez nenhum backup.' : `Seu último backup foi há ${backupDays} dias.`} Seus dados ficam só neste aparelho — um backup protege contra perda.
          </span>
          <button className="btn sm" onClick={() => navigate('configuracoes?secao=dados')}>
            Fazer backup
          </button>
        </div>
      )}

      <div className="dash">
        <div className="grid">
          {/* Próxima atividade */}
          <div className="next-card">
            <span className="icon-tile">
              <Clock size={20} />
            </span>
            <div className="grow">
              <div className="small muted">{next?.kind === 'evento' ? 'Sua próxima atividade' : next?.kind === 'tarefa' ? 'Sugestão de próxima ação' : 'Agora'}</div>
              {next?.kind === 'evento' && <b>{next.title}</b>}
              {next?.kind === 'tarefa' && <b>{next.task.title}</b>}
              {next?.kind === 'livre' && <b>Tempo livre</b>}
              <div className="small faint">{next?.detail}</div>
            </div>
            {next?.kind === 'tarefa' && (
              <button className="btn sm" onClick={() => openEditor({ type: 'task', id: next.task.id })}>
                Abrir
              </button>
            )}
          </div>

          {/* Seu dia, do seu jeito */}
          <Card
            title={<h2 className="serif" style={{ fontSize: 21 }}>Seu dia, do seu jeito</h2>}
            action={
              <button className="link small" onClick={() => navigate(`agenda?data=${ref}`)}>
                Ver agenda <ArrowRight size={14} />
              </button>
            }
          >
            <div className="row wrap small muted" style={{ marginBottom: 10, gap: 14 }}>
              <span className="row" style={{ gap: 5 }}>
                <Coffee size={15} /> {free > 0 ? `${fmtDuration(free)} livres até o fim do dia` : 'Sem horários livres restantes hoje'}
              </span>
              <span>
                {todayOcc.length} compromisso{todayOcc.length === 1 ? '' : 's'} · {dueToday.length} tarefa{dueToday.length === 1 ? '' : 's'} para hoje
              </span>
            </div>
            {timeline.filter((i) => i.kind !== 'descanso').length === 0 ? (
              <Empty compact title="Dia em branco" icon={<CalendarPlus size={28} />}>
                Nenhum compromisso ou bloco planejado para hoje. Adicione um evento ou use "Reorganizar minha vida" para encaixar suas tarefas nos horários livres.
              </Empty>
            ) : (
              <div className="timeline">
                {timeline.map((i, k) => {
                  const past = i.end <= m
                  const cur = i.start <= m && i.end > m
                  return (
                    <div
                      key={k}
                      className={`tl-item${i.kind === 'descanso' ? ' rest' : ''}${past ? ' past' : ''}${cur ? ' now' : ''}`}
                      data-c={i.color}
                      role={i.onClick ? 'button' : undefined}
                      tabIndex={i.onClick ? 0 : undefined}
                      onClick={i.onClick}
                      onKeyDown={(e) => e.key === 'Enter' && i.onClick?.()}
                      style={{ cursor: i.onClick ? 'pointer' : undefined }}
                    >
                      <span className="t">{fmtT(fromMin(i.start))}</span>
                      <span className="bar" />
                      <span className="what ellipsis" style={{ textDecoration: i.done ? 'line-through' : undefined }}>
                        {i.title}
                      </span>
                      <span className="tiny faint">{i.kind === 'tarefa' ? 'tarefa' : i.kind === 'descanso' ? 'descanso' : `até ${fmtT(fromMin(i.end))}`}</span>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="row wrap" style={{ marginTop: 12 }}>
              <button className="btn sm" onClick={() => openEditor({ type: 'event', date: ref })}>
                <CalendarPlus size={15} /> Evento
              </button>
              <button className="btn sm" onClick={() => navigate('reorganizar')}>
                <Wand2 size={15} /> Reorganizar meu dia
              </button>
            </div>
          </Card>

          {/* Tarefas prioritárias */}
          <Card
            title="Tarefas prioritárias"
            action={
              <button className="link small" onClick={() => navigate('tarefas?filtro=hoje')}>
                Ver todas <ArrowRight size={14} />
              </button>
            }
          >
            {priority.length === 0 ? (
              <Empty compact title="Nada urgente" icon={<Check size={26} />}>
                Nenhuma tarefa com prazo próximo ou prioridade alta.
              </Empty>
            ) : (
              <div className="stack-sm">
                {priority.map((t) => (
                  <TaskRow key={t.id} task={t} compact />
                ))}
              </div>
            )}
            <QuickTask />
          </Card>

          <QuickNotes highlight={params.get('nota')} />
        </div>

        <div className="grid">
          <Card title="Tarefas de hoje">
            <div className="stat-row">
              <div className="stat">
                <b>{doneToday.length}</b>
                <span>concluída{doneToday.length === 1 ? '' : 's'}</span>
              </div>
              <div className="stat">
                <b>{dueToday.length}</b>
                <span>pendente{dueToday.length === 1 ? '' : 's'}</span>
              </div>
              <div className="stat">
                <b className={pending.some((t) => isOverdue(t, ref)) ? 'neg' : ''}>{pending.filter((t) => isOverdue(t, ref)).length}</b>
                <span>atrasada{pending.filter((t) => isOverdue(t, ref)).length === 1 ? '' : 's'}</span>
              </div>
            </div>
            {doneToday.length + dueToday.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <Progress value={(doneToday.length / (doneToday.length + dueToday.length)) * 100} />
              </div>
            )}
          </Card>

          <Card title="Acesso rápido">
            <div className="quick-actions">
              <button onClick={() => openEditor({ type: 'task' })}>
                <ListPlus size={20} /> Tarefa
              </button>
              <button onClick={() => openEditor({ type: 'event' })}>
                <CalendarPlus size={20} /> Evento
              </button>
              <button onClick={() => openEditor({ type: 'goal' })}>
                <Target size={20} /> Meta
              </button>
              <button onClick={() => openEditor({ type: 'task', preset: { tags: ['lembrete'], dueDate: ref } })}>
                <AlarmClock size={20} /> Lembrete
              </button>
            </div>
          </Card>

          <Card
            title="Hábitos de hoje"
            action={
              <button className="link small" onClick={() => navigate('habitos')}>
                Ver <ArrowRight size={14} />
              </button>
            }
          >
            {habits.length === 0 ? (
              <Empty compact title="Nenhum hábito para hoje">
                <button className="link" onClick={() => navigate('habitos?novo=1')}>
                  Criar um hábito
                </button>
              </Empty>
            ) : (
              <div className="row wrap" style={{ gap: 14 }}>
                {habits.map((hb) => (
                  <button
                    key={hb.id}
                    onClick={() => toggleHabit(hb, ref)}
                    style={{ background: 'none', border: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 64 }}
                    aria-pressed={hb.log[ref] === 'feito'}
                    aria-label={`${hb.name}: ${hb.log[ref] === 'feito' ? 'feito' : 'marcar como feito'}`}
                  >
                    <span className={`habit-check ${hb.log[ref] ?? ''}`}>
                      <Check size={17} />
                    </span>
                    <span className="tiny muted ellipsis" style={{ maxWidth: 64 }}>
                      {hb.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card
            title="Metas em andamento"
            action={
              <button className="link small" onClick={() => navigate('objetivos')}>
                Ver <ArrowRight size={14} />
              </button>
            }
          >
            {activeGoals.length === 0 ? (
              <Empty compact title="Nenhuma meta ativa">
                <button className="link" onClick={() => openEditor({ type: 'goal' })}>
                  Criar objetivo
                </button>
              </Empty>
            ) : (
              <div className="stack">
                {activeGoals.map((g) => {
                  const p = goalProgress(g, data.tasks)
                  const ns = nextStep(g, data.tasks)
                  return (
                    <button key={g.id} className="stack-sm" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => navigate(`objetivos?id=${g.id}`)}>
                      <div className="row between small">
                        <b className="ellipsis">{g.name}</b>
                        <span className="faint num">
                          {p.done}/{p.total}
                        </span>
                      </div>
                      <Progress value={p.pct} />
                      {ns && <span className="tiny faint ellipsis">Próximo: {ns}</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </Card>

          <Card title="Resumo da semana">
            <table className="simple">
              <tbody>
                <tr>
                  <td>Tarefas concluídas</td>
                  <td className="num" style={{ textAlign: 'right' }}>{weekDone}</td>
                </tr>
                <tr>
                  <td>Compromissos</td>
                  <td className="num" style={{ textAlign: 'right' }}>{weekEvents}</td>
                </tr>
                <tr>
                  <td>Horas de estudo</td>
                  <td className="num" style={{ textAlign: 'right' }}>{fmtDuration(weekStudy)}</td>
                </tr>
                <tr>
                  <td>Hábitos registrados</td>
                  <td className="num" style={{ textAlign: 'right' }}>{weekHabits}</td>
                </tr>
                <tr>
                  <td>Gastos</td>
                  <td className="num" style={{ textAlign: 'right' }}>{fmtMoney(weekSpent)}</td>
                </tr>
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </div>
  )
}

function QuickTask() {
  const [title, setTitle] = useState('')
  return (
    <form
      className="row"
      style={{ marginTop: 12 }}
      onSubmit={async (e) => {
        e.preventDefault()
        if (!title.trim()) return
        const ok = await attempt(
          () =>
            save('tasks', {
              title: title.trim(),
              description: '',
              priority: 'media',
              status: 'a_fazer',
              subtasks: [],
              tags: [],
              notes: '',
              order: Date.now(),
              dueDate: today(),
            }),
          'Tarefa adicionada para hoje.',
        )
        if (ok) setTitle('')
      }}
    >
      <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Adicionar tarefa para hoje…" aria-label="Nova tarefa para hoje" />
      <button className="btn primary" type="submit" disabled={!title.trim()} aria-label="Adicionar tarefa">
        <ListPlus size={17} />
      </button>
    </form>
  )
}

function QuickNotes({ highlight }: { highlight: string | null }) {
  const data = useData()
  const [text, setText] = useState('')
  const notes = [...data.notes].sort((a, b) => (a.pinned === b.pinned ? (a.createdAt < b.createdAt ? 1 : -1) : a.pinned ? -1 : 1))
  return (
    <Card title="Anotações rápidas">
      <form
        className="stack-sm"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!text.trim()) return
          const ok = await attempt(() => save('notes', { text: text.trim(), pinned: false }), 'Anotação salva.')
          if (ok) setText('')
        }}
      >
        <textarea className="textarea" style={{ minHeight: 70 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Lembrete: comprar o presente da amiga…" aria-label="Nova anotação" />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn primary sm" type="submit" disabled={!text.trim()}>
            Salvar
          </button>
        </div>
      </form>
      {notes.length > 0 && (
        <div className="list" style={{ marginTop: 8 }}>
          {notes.map((n) => (
            <div key={n.id} className="list-item" style={highlight === n.id ? { background: 'var(--sage-soft)', borderRadius: 10 } : undefined}>
              <span className="grow small" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {n.text}
              </span>
              <button className="icon-btn sm" aria-label={n.pinned ? 'Desafixar' : 'Fixar'} onClick={() => attempt(() => patch('notes', n.id, { pinned: !n.pinned }))}>
                {n.pinned ? <PinOff size={15} /> : <Pin size={15} />}
              </button>
              <button
                className="icon-btn sm"
                aria-label="Excluir anotação"
                onClick={async () => {
                  if (await confirm({ title: 'Excluir anotação?', body: n.text.slice(0, 120), confirmLabel: 'Excluir', danger: true })) attempt(() => remove('notes', n.id), 'Anotação excluída.')
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
