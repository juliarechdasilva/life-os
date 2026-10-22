import { CalendarArrowDown, Plus, Trash2, X } from 'lucide-react'
import { shareOrDownload } from '../lib/backup'
import { buildIcs } from '../lib/ics'
import { useMemo, useState } from 'react'
import { addDays, fmtRelative, fromMin, isValidDate, isValidTime, toMin, today } from '../lib/dates'
import { centsToInput, parseMoney } from '../lib/finance'
import { seriesConflicts } from '../lib/recurrence'
import { remove, save, uid, useData, useSettings } from '../lib/store'
import { newTask, PRIORITY_LABEL, STATUS_LABEL } from '../lib/tasks'
import type { CalEvent, Goal, Priority, Recurrence, Task, Transaction } from '../lib/types'
import { attempt, choose, closeEditor, confirm, toast } from '../lib/ui'
import { describeRecurrence } from '../lib/recurrence'
import { Field, Modal, Seg, Switch, TagInput, WeekdayPick } from './ui'

// ---------- Recorrência ----------

export function RecurrencePicker({ value, onChange, startDate }: { value?: Recurrence; onChange: (r?: Recurrence) => void; startDate?: string }) {
  const settings = useSettings()
  const freq = value?.freq ?? 'nenhuma'
  return (
    <div className="stack-sm">
      <select
        className="select"
        value={freq}
        aria-label="Repetição"
        onChange={(e) => {
          const f = e.target.value
          if (f === 'nenhuma') onChange(undefined)
          else
            onChange({
              freq: f as Recurrence['freq'],
              interval: 1,
              weekdays: f === 'semanal' && startDate ? [new Date(startDate + 'T12:00').getDay()] : undefined,
              until: value?.until,
            })
        }}
      >
        <option value="nenhuma">Não se repete</option>
        <option value="diaria">Diariamente</option>
        <option value="dias_uteis">Dias úteis (seg–sex)</option>
        <option value="semanal">Semanalmente</option>
        <option value="mensal">Mensalmente</option>
        <option value="anual">Anualmente</option>
      </select>
      {value && (
        <div className="row wrap" style={{ gap: 10 }}>
          {value.freq !== 'dias_uteis' && value.freq !== 'anual' && (
            <label className="row small">
              a cada
              <input
                className="input"
                style={{ width: 64 }}
                type="number"
                min={1}
                max={30}
                value={value.interval}
                onChange={(e) => onChange({ ...value, interval: Math.max(1, +e.target.value || 1) })}
              />
              {value.freq === 'diaria' ? 'dia(s)' : value.freq === 'semanal' ? 'semana(s)' : 'mês(es)'}
            </label>
          )}
          {value.freq === 'semanal' && <WeekdayPick value={value.weekdays ?? []} onChange={(w) => onChange({ ...value, weekdays: w })} weekStart={settings.weekStart} />}
          <label className="row small">
            até
            <input className="input" type="date" value={value.until ?? ''} onChange={(e) => onChange({ ...value, until: e.target.value || undefined })} style={{ width: 160 }} />
          </label>
        </div>
      )}
      {value && <span className="hint">{describeRecurrence(value)}</span>}
    </div>
  )
}

// ---------- Tarefa ----------

export function TaskForm({ id, preset }: { id?: string; preset?: Partial<Task> }) {
  const data = useData()
  const settings = useSettings()
  const existing = id ? data.tasks.find((t) => t.id === id) : undefined
  const [t, setT] = useState<Task>(() =>
    existing ? structuredClone(existing) : ({ ...newTask({ title: '', ...preset }), id: '', createdAt: '', updatedAt: '' } as Task),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [newSub, setNewSub] = useState('')
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setT((p) => ({ ...p, [k]: v }))

  if (id && !existing)
    return (
      <Modal title="Tarefa não encontrada" onClose={closeEditor}>
        <p className="muted">Ela pode ter sido excluída.</p>
      </Modal>
    )

  async function submit() {
    const e: Record<string, string> = {}
    if (!t.title.trim()) e.title = 'Dê um título à tarefa.'
    if (t.dueTime && !t.dueDate) e.dueDate = 'Para definir horário, escolha também a data.'
    if (t.dueDate && !isValidDate(t.dueDate)) e.dueDate = 'Data inválida.'
    if (t.estimateMin != null && (t.estimateMin < 1 || t.estimateMin > 24 * 60)) e.estimate = 'Use um valor entre 1 e 1440 minutos.'
    if (t.plannedDate || t.plannedStart || t.plannedEnd) {
      if (!t.plannedDate || !isValidTime(t.plannedStart) || !isValidTime(t.plannedEnd)) e.planned = 'Preencha data, início e fim do bloco — ou limpe os três.'
      else if (toMin(t.plannedEnd!) <= toMin(t.plannedStart!)) e.planned = 'O fim precisa ser depois do início.'
    }
    setErrors(e)
    if (Object.keys(e).length) return
    const { id: _id, ...rest } = t
    void _id
    const payload = { ...rest, title: t.title.trim(), id: existing?.id }
    if (!payload.dueDate) payload.dueTime = undefined
    const ok = await attempt(() => save('tasks', payload), existing ? 'Tarefa atualizada.' : 'Tarefa criada.')
    if (ok) closeEditor()
  }

  async function del() {
    if (!existing) return
    if (await confirm({ title: 'Excluir tarefa?', body: `"${existing.title}" será excluída permanentemente.`, confirmLabel: 'Excluir', danger: true })) {
      const ok = await attempt(() => remove('tasks', existing.id).then(() => true), 'Tarefa excluída.')
      if (ok) closeEditor()
    }
  }

  const goals = data.goals.filter((g) => g.status !== 'concluido' || g.id === t.goalId)
  return (
    <Modal
      wide
      title={existing ? 'Editar tarefa' : 'Nova tarefa'}
      onClose={closeEditor}
      footer={
        <>
          {existing && (
            <button className="btn danger left" onClick={del}>
              <Trash2 size={16} /> Excluir
            </button>
          )}
          <button className="btn ghost" onClick={closeEditor}>
            Cancelar
          </button>
          <button className="btn primary" onClick={submit}>
            Salvar
          </button>
        </>
      }
    >
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label="Título" className="full" error={errors.title}>
          <input className="input" autoFocus value={t.title} onChange={(e) => set('title', e.target.value)} aria-invalid={!!errors.title} placeholder="O que precisa ser feito?" />
        </Field>
        <Field label="Descrição" className="full">
          <textarea className="textarea" rows={2} style={{ minHeight: 60 }} value={t.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <Field label="Vencimento" error={errors.dueDate}>
          <input className="input" type="date" value={t.dueDate ?? ''} onChange={(e) => set('dueDate', e.target.value || undefined)} />
        </Field>
        <Field label="Horário (opcional)">
          <input className="input" type="time" value={t.dueTime ?? ''} onChange={(e) => set('dueTime', e.target.value || undefined)} />
        </Field>
        <Field label="Prioridade">
          <select className="select" value={t.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
            {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select className="select" value={t.status} onChange={(e) => set('status', e.target.value as Task['status'])}>
            {(Object.keys(STATUS_LABEL) as Task['status'][]).map((p) => (
              <option key={p} value={p}>
                {STATUS_LABEL[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Categoria">
          <select className="select" value={t.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value || undefined)}>
            <option value="">Sem categoria</option>
            {data.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tempo estimado (min)" error={errors.estimate} hint={`Se vazio, o planejador usa ${settings.planning.defaultTaskMin} min.`}>
          <input className="input" type="number" min={1} step={5} value={t.estimateMin ?? ''} onChange={(e) => set('estimateMin', e.target.value ? +e.target.value : undefined)} />
        </Field>
        <Field label="Projeto / objetivo">
          <select className="select" value={t.goalId ?? ''} onChange={(e) => set('goalId', e.target.value || undefined)}>
            <option value="">Nenhum</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Matéria">
          <select className="select" value={t.subjectId ?? ''} onChange={(e) => set('subjectId', e.target.value || undefined)}>
            <option value="">Nenhuma</option>
            {data.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Evento associado" className="full">
          <select className="select" value={t.eventId ?? ''} onChange={(e) => set('eventId', e.target.value || undefined)}>
            <option value="">Nenhum</option>
            {[...data.events]
              .sort((a, b) => (a.date < b.date ? 1 : -1))
              .slice(0, 80)
              .map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title} — {ev.date.split('-').reverse().join('/')} {ev.start}
                </option>
              ))}
          </select>
        </Field>
        <div className="field full">
          <span className="label">Bloco planejado na agenda</span>
          <div className="row wrap">
            <input className="input" style={{ maxWidth: 170 }} type="date" aria-label="Data do bloco" value={t.plannedDate ?? ''} onChange={(e) => set('plannedDate', e.target.value || undefined)} />
            <input className="input" style={{ maxWidth: 120 }} type="time" aria-label="Início do bloco" value={t.plannedStart ?? ''} onChange={(e) => set('plannedStart', e.target.value || undefined)} />
            <span className="faint">até</span>
            <input className="input" style={{ maxWidth: 120 }} type="time" aria-label="Fim do bloco" value={t.plannedEnd ?? ''} onChange={(e) => set('plannedEnd', e.target.value || undefined)} />
            {(t.plannedDate || t.plannedStart) && (
              <button type="button" className="btn ghost sm" onClick={() => setT((p) => ({ ...p, plannedDate: undefined, plannedStart: undefined, plannedEnd: undefined }))}>
                Limpar
              </button>
            )}
          </div>
          {errors.planned ? <span className="error">{errors.planned}</span> : <span className="hint">Opcional. Reserva um horário para fazer a tarefa — o "Reorganizar minha vida" pode sugerir um.</span>}
        </div>
        <div className="field full">
          <span className="label">Subtarefas</span>
          <div className="stack-sm">
            {t.subtasks.map((s, i) => (
              <div key={s.id} className="row">
                <input
                  type="checkbox"
                  className="check square"
                  checked={s.done}
                  aria-label={`Concluir ${s.title}`}
                  onChange={() => set('subtasks', t.subtasks.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}
                />
                <input className="input" value={s.title} onChange={(e) => set('subtasks', t.subtasks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} aria-label="Subtarefa" />
                <button type="button" className="icon-btn sm" aria-label="Remover subtarefa" onClick={() => set('subtasks', t.subtasks.filter((_, j) => j !== i))}>
                  <X size={16} />
                </button>
              </div>
            ))}
            <div className="row">
              <input
                className="input"
                placeholder="Adicionar subtarefa"
                value={newSub}
                onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newSub.trim()) {
                    e.preventDefault()
                    set('subtasks', [...t.subtasks, { id: uid(), title: newSub.trim(), done: false }])
                    setNewSub('')
                  }
                }}
              />
              <button
                type="button"
                className="btn sm"
                disabled={!newSub.trim()}
                onClick={() => {
                  set('subtasks', [...t.subtasks, { id: uid(), title: newSub.trim(), done: false }])
                  setNewSub('')
                }}
              >
                <Plus size={15} /> Adicionar
              </button>
            </div>
          </div>
        </div>
        <Field label="Tags" hint="Separe por vírgulas.">
          <TagInput value={t.tags} onChange={(v) => set('tags', v)} />
        </Field>
        <div className="field">
          <span className="label">Repetição</span>
          <RecurrencePicker value={t.recurrence} onChange={(r) => set('recurrence', r)} startDate={t.dueDate} />
          {t.recurrence && !t.dueDate && <span className="hint">Defina um vencimento para a repetição funcionar.</span>}
        </div>
        <Field label="Observações" className="full">
          <textarea className="textarea" rows={2} style={{ minHeight: 60 }} value={t.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

// ---------- Evento ----------

export function EventForm({ id, date, preset }: { id?: string; date?: string; preset?: Partial<CalEvent> }) {
  const data = useData()
  const settings = useSettings()
  const existing = id ? data.events.find((e) => e.id === id) : undefined
  const [ev, setEv] = useState<CalEvent>(() =>
    existing
      ? structuredClone(existing)
      : {
          id: '',
          createdAt: '',
          updatedAt: '',
          title: '',
          description: '',
          date: date ?? today(),
          start: fromMin(Math.min(22 * 60, Math.ceil((new Date().getHours() * 60 + new Date().getMinutes()) / 30) * 30 + 30)),
          durationMin: 60,
          location: '',
          exceptions: [],
          doneDates: [],
          reminderMin: 15,
          ...preset,
        },
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmConflict, setConfirmConflict] = useState(false)
  const set = <K extends keyof CalEvent>(k: K, v: CalEvent[K]) => {
    setEv((p) => ({ ...p, [k]: v }))
    setConfirmConflict(false)
  }
  const conflicts = useMemo(() => {
    if (!isValidDate(ev.date) || !isValidTime(ev.start) || !(ev.durationMin > 0)) return []
    const list = seriesConflicts(data.events, { ...ev, id: existing?.id ?? '__novo__' }, 60)
    const seen = new Set<string>()
    return list.filter((o) => {
      const k = o.event.id + o.date
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }, [ev, data.events, existing?.id])

  if (id && !existing)
    return (
      <Modal title="Evento não encontrado" onClose={closeEditor}>
        <p className="muted">Ele pode ter sido excluído.</p>
      </Modal>
    )

  const end = isValidTime(ev.start) ? toMin(ev.start) + (ev.durationMin || 0) : 0

  async function submit() {
    const e: Record<string, string> = {}
    if (!ev.title.trim()) e.title = 'Dê um título ao evento.'
    if (!isValidDate(ev.date)) e.date = 'Escolha uma data válida.'
    if (!isValidTime(ev.start)) e.start = 'Escolha um horário.'
    if (!(ev.durationMin >= 5)) e.duration = 'A duração mínima é 5 minutos.'
    else if (end > 24 * 60) e.duration = 'O evento precisa terminar no mesmo dia (até 23:59).'
    setErrors(e)
    if (Object.keys(e).length) return
    if (conflicts.length && !confirmConflict) {
      setConfirmConflict(true)
      toast('Há conflito de horário. Revise e clique em "Salvar mesmo assim" para confirmar.', 'info')
      return
    }
    const { id: _id, ...rest } = ev
    void _id
    const ok = await attempt(() => save('events', { ...rest, title: ev.title.trim(), id: existing?.id }), existing ? 'Evento atualizado.' : 'Evento criado.')
    if (ok) closeEditor()
  }

  async function del() {
    if (!existing) return
    if (existing.recurrence) {
      const v = await choose({
        title: 'Excluir evento recorrente',
        body: `"${existing.title}" se repete. O que deseja excluir?`,
        danger: true,
        options: [
          { label: `Só em ${fmtRelative(date ?? existing.date).toLowerCase()}`, value: 'one' },
          { label: 'Toda a série', value: 'all' },
        ],
      })
      if (v === 'one') {
        const d = date ?? existing.date
        const ok = await attempt(() => save('events', { ...existing, exceptions: [...existing.exceptions, d] }), 'Ocorrência removida.')
        if (ok) closeEditor()
      } else if (v === 'all') {
        const ok = await attempt(() => remove('events', existing.id).then(() => true), 'Série excluída.')
        if (ok) closeEditor()
      }
      return
    }
    if (await confirm({ title: 'Excluir evento?', body: `"${existing.title}" será excluído permanentemente.`, confirmLabel: 'Excluir', danger: true })) {
      const ok = await attempt(() => remove('events', existing.id).then(() => true), 'Evento excluído.')
      if (ok) closeEditor()
    }
  }

  const linkedTasks = existing ? data.tasks.filter((t) => t.eventId === existing.id) : []

  return (
    <Modal
      wide
      title={existing ? 'Editar evento' : 'Novo evento'}
      onClose={closeEditor}
      footer={
        <>
          {existing && (
            <button className="btn danger left" onClick={del}>
              <Trash2 size={16} /> Excluir
            </button>
          )}
          {existing && (
            <button
              className="btn ghost"
              title="Adicionar ao calendário do celular (avisa mesmo com o app fechado)"
              onClick={() => {
                const { ics } = buildIcs({ events: [existing], tasks: [], settings, includeEvents: true, includeTasks: false, from: '0000-01-01' })
                shareOrDownload(`${existing.title.replace(/[^\p{L}\d]+/gu, '-').slice(0, 40) || 'evento'}.ics`, ics, 'text/calendar')
              }}
            >
              <CalendarArrowDown size={16} /> Calendário
            </button>
          )}
          <button className="btn ghost" onClick={closeEditor}>
            Cancelar
          </button>
          <button className={`btn ${confirmConflict ? 'danger solid' : 'primary'}`} onClick={submit}>
            {confirmConflict ? 'Salvar mesmo assim' : 'Salvar'}
          </button>
        </>
      }
    >
      <form className="form-grid" onSubmit={(e) => (e.preventDefault(), submit())}>
        <Field label="Título" className="full" error={errors.title}>
          <input className="input" autoFocus value={ev.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex.: Consulta no dentista" aria-invalid={!!errors.title} />
        </Field>
        <Field label="Data" error={errors.date}>
          <input className="input" type="date" value={ev.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <Field label="Início" error={errors.start}>
          <input className="input" type="time" value={ev.start} onChange={(e) => set('start', e.target.value)} />
        </Field>
        <Field label="Duração (min)" error={errors.duration} hint={isValidTime(ev.start) && ev.durationMin > 0 && end <= 1440 ? `Termina às ${fromMin(end)}` : undefined}>
          <input className="input" type="number" min={5} step={5} value={ev.durationMin || ''} onChange={(e) => set('durationMin', +e.target.value)} />
        </Field>
        <Field label="Categoria">
          <select className="select" value={ev.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value || undefined)}>
            <option value="">Sem categoria</option>
            {data.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Local">
          <input className="input" value={ev.location} onChange={(e) => set('location', e.target.value)} placeholder="Opcional" />
        </Field>
        <Field label="Lembrete" hint="Funciona enquanto o Life OS estiver aberto.">
          <select className="select" value={ev.reminderMin ?? -1} onChange={(e) => set('reminderMin', +e.target.value < 0 ? null : +e.target.value)}>
            <option value={-1}>Sem lembrete</option>
            <option value={0}>Na hora</option>
            <option value={5}>5 min antes</option>
            <option value={15}>15 min antes</option>
            <option value={30}>30 min antes</option>
            <option value={60}>1 hora antes</option>
            <option value={120}>2 horas antes</option>
          </select>
        </Field>
        <div className="field full">
          <span className="label">Repetição</span>
          <RecurrencePicker value={ev.recurrence} onChange={(r) => set('recurrence', r)} startDate={ev.date} />
        </div>
        <Field label="Descrição" className="full">
          <textarea className="textarea" rows={2} style={{ minHeight: 60 }} value={ev.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        {conflicts.length > 0 && (
          <div className="callout danger full" role="alert">
            <span>
              <b>Conflito de horário</b> com{' '}
              {conflicts.slice(0, 4).map((o, i) => (
                <span key={o.event.id + o.date}>
                  {i > 0 && ', '}"{o.event.title}" ({fmtRelative(o.date).toLowerCase()}, {fromMin(o.startMin)}–{fromMin(o.endMin)})
                </span>
              ))}
              {conflicts.length > 4 && ` e mais ${conflicts.length - 4}`}.
            </span>
          </div>
        )}
        {linkedTasks.length > 0 && (
          <div className="field full">
            <span className="label">Tarefas associadas</span>
            {linkedTasks.map((t) => (
              <span key={t.id} className="small">
                • {t.title} {t.status === 'concluida' && '✓'}
              </span>
            ))}
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

// ---------- Objetivo / projeto ----------

export function GoalForm({ id }: { id?: string }) {
  const data = useData()
  const existing = id ? data.goals.find((g) => g.id === id) : undefined
  const [g, setG] = useState<Goal>(() =>
    existing
      ? structuredClone(existing)
      : { id: '', createdAt: '', updatedAt: '', name: '', description: '', kind: 'objetivo', status: 'ativo', steps: [], notes: '', history: [] },
  )
  const [err, setErr] = useState('')
  const [step, setStep] = useState('')
  const set = <K extends keyof Goal>(k: K, v: Goal[K]) => setG((p) => ({ ...p, [k]: v }))

  async function submit() {
    if (!g.name.trim()) return setErr('Dê um nome ao objetivo.')
    const { id: _id, ...rest } = g
    void _id
    const history = existing ? rest.history : [{ date: new Date().toISOString(), text: 'Criado', progress: 0 }]
    const ok = await attempt(() => save('goals', { ...rest, history, name: g.name.trim(), id: existing?.id }), existing ? 'Objetivo atualizado.' : 'Objetivo criado.')
    if (ok) closeEditor()
  }
  const addStep = () => {
    if (!step.trim()) return
    set('steps', [...g.steps, { id: uid(), title: step.trim(), done: false }])
    setStep('')
  }
  return (
    <Modal
      wide
      title={existing ? 'Editar objetivo' : 'Novo objetivo'}
      onClose={closeEditor}
      footer={
        <>
          <button className="btn ghost" onClick={closeEditor}>
            Cancelar
          </button>
          <button className="btn primary" onClick={submit}>
            Salvar
          </button>
        </>
      }
    >
      <form className="form-grid" onSubmit={(e) => (e.preventDefault(), submit())}>
        <Field label="Nome" className="full" error={err}>
          <input className="input" autoFocus value={g.name} onChange={(e) => (set('name', e.target.value), setErr(''))} placeholder="Ex.: Aprender francês" />
        </Field>
        <Field label="Descrição" className="full">
          <textarea className="textarea" rows={2} style={{ minHeight: 60 }} value={g.description} onChange={(e) => set('description', e.target.value)} placeholder="Por que isso importa para você?" />
        </Field>
        <div className="field">
          <span className="label">Tipo</span>
          <Seg
            label="Tipo"
            value={g.kind}
            onChange={(v) => set('kind', v)}
            options={[
              { value: 'objetivo', label: 'Objetivo' },
              { value: 'projeto', label: 'Projeto' },
            ]}
          />
        </div>
        <Field label="Data-alvo (opcional)">
          <input className="input" type="date" value={g.targetDate ?? ''} onChange={(e) => set('targetDate', e.target.value || undefined)} />
        </Field>
        <Field label="Categoria">
          <select className="select" value={g.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value || undefined)}>
            <option value="">Sem categoria</option>
            {data.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select className="select" value={g.status} onChange={(e) => set('status', e.target.value as Goal['status'])}>
            <option value="ativo">Em andamento</option>
            <option value="pausado">Pausado</option>
            <option value="concluido">Concluído</option>
          </select>
        </Field>
        <div className="field full">
          <span className="label">Etapas</span>
          <div className="stack-sm">
            {g.steps.map((s, i) => (
              <div key={s.id} className="row">
                <span className="faint small num" style={{ width: 18 }}>
                  {i + 1}.
                </span>
                <input className="input" value={s.title} onChange={(e) => set('steps', g.steps.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} aria-label={`Etapa ${i + 1}`} />
                <button type="button" className="icon-btn sm" aria-label="Remover etapa" onClick={() => set('steps', g.steps.filter((_, j) => j !== i))}>
                  <X size={16} />
                </button>
              </div>
            ))}
            <div className="row">
              <input className="input" placeholder="Nova etapa" value={step} onChange={(e) => setStep(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addStep())} />
              <button type="button" className="btn sm" onClick={addStep} disabled={!step.trim()}>
                <Plus size={15} /> Adicionar
              </button>
            </div>
          </div>
        </div>
        <Field label="Notas" className="full">
          <textarea className="textarea" rows={2} style={{ minHeight: 60 }} value={g.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

// ---------- Movimentação financeira ----------

export function TransactionForm({ id, preset }: { id?: string; preset?: Partial<Transaction> }) {
  const data = useData()
  const existing = id ? data.transactions.find((t) => t.id === id) : undefined
  const [t, setT] = useState<Transaction>(() =>
    existing
      ? structuredClone(existing)
      : { id: '', createdAt: '', updatedAt: '', type: 'despesa', amountCents: 0, date: today(), description: '', recurring: false, notes: '', ...preset },
  )
  const [amount, setAmount] = useState(existing ? centsToInput(existing.amountCents) : '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = <K extends keyof Transaction>(k: K, v: Transaction[K]) => setT((p) => ({ ...p, [k]: v }))
  const cats = data.finCategories.filter((c) => c.kind === t.type)

  async function submit() {
    const e: Record<string, string> = {}
    const cents = parseMoney(amount)
    if (cents == null || cents <= 0) e.amount = 'Informe um valor maior que zero (ex.: 25,90).'
    if (!t.description.trim()) e.description = 'Descreva a movimentação.'
    if (!isValidDate(t.date)) e.date = 'Data inválida.'
    setErrors(e)
    if (Object.keys(e).length) return
    const { id: _id, ...rest } = t
    void _id
    const ok = await attempt(() => save('transactions', { ...rest, amountCents: cents!, description: t.description.trim(), id: existing?.id }), existing ? 'Movimentação atualizada.' : 'Movimentação registrada.')
    if (ok) closeEditor()
  }
  async function del() {
    if (!existing) return
    if (await confirm({ title: 'Excluir movimentação?', body: `"${existing.description}" será excluída.`, confirmLabel: 'Excluir', danger: true })) {
      const ok = await attempt(() => remove('transactions', existing.id).then(() => true), 'Movimentação excluída.')
      if (ok) closeEditor()
    }
  }
  return (
    <Modal
      title={existing ? 'Editar movimentação' : 'Nova movimentação'}
      onClose={closeEditor}
      footer={
        <>
          {existing && (
            <button className="btn danger left" onClick={del}>
              <Trash2 size={16} /> Excluir
            </button>
          )}
          <button className="btn ghost" onClick={closeEditor}>
            Cancelar
          </button>
          <button className="btn primary" onClick={submit}>
            Salvar
          </button>
        </>
      }
    >
      <form className="form-grid" onSubmit={(e) => (e.preventDefault(), submit())}>
        <div className="full">
          <Seg
            full
            label="Tipo"
            value={t.type}
            onChange={(v) => setT((p) => ({ ...p, type: v, categoryId: undefined }))}
            options={[
              { value: 'despesa', label: 'Despesa' },
              { value: 'receita', label: 'Receita' },
            ]}
          />
        </div>
        <Field label="Valor (R$)" error={errors.amount}>
          <input className="input num" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" aria-invalid={!!errors.amount} />
        </Field>
        <Field label="Data" error={errors.date}>
          <input className="input" type="date" value={t.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <Field label="Descrição" className="full" error={errors.description}>
          <input className="input" value={t.description} onChange={(e) => set('description', e.target.value)} placeholder={t.type === 'despesa' ? 'Ex.: Mercado' : 'Ex.: Salário'} />
        </Field>
        <Field label="Categoria">
          <select className="select" value={t.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value || undefined)}>
            <option value="">Sem categoria</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="field" style={{ justifyContent: 'flex-end' }}>
          <Switch checked={t.recurring} onChange={(v) => set('recurring', v)} label="Recorrente (todo mês)" />
        </div>
        <Field label="Observações" className="full">
          <input className="input" value={t.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

export const tomorrow = () => addDays(today(), 1)
