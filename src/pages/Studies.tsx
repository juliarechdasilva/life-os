import { BookOpen, CalendarCheck, Check, ClipboardList, Edit3, ExternalLink, FileText, Pause, Play, Plus, RotateCcw, Square, Timer, Trash2, Wand2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ProposalList } from '../components/Proposals'
import { Card, ColorPick, Empty, Field, Modal, Progress, Switch, Tabs } from '../components/ui'
import { defaultExamChecklist } from '../lib/assistant'
import { addDays, diffDays, fmtDate, fmtDuration, fmtRelative, fromMin, nowMin, startOfWeek, today } from '../lib/dates'
import { plan } from '../lib/planner'
import { getState, patch, remove, save, saveMany, saveSettings, uid, useData, useSettings } from '../lib/store'
import { newTask } from '../lib/tasks'
import * as timer from '../lib/timer'
import type { Exam, Proposal, Subject, Task } from '../lib/types'
import { attempt, confirm, toast, useRoute } from '../lib/ui'

type Tab = 'materias' | 'planejamento' | 'cronometro' | 'revisoes' | 'historico'

export default function Studies() {
  const { params } = useRoute()
  const [tab, setTab] = useState<Tab>(() => (params.get('prova') ? 'planejamento' : (params.get('aba') as Tab) || 'materias'))
  const [openSubject, setOpenSubject] = useState<string | null>(params.get('materia'))
  const [openExam, setOpenExam] = useState<string | null>(params.get('prova'))
  const t = timer.useTimer()
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Estudos</h1>
          <p>Matérias, provas, sessões de foco e revisões.</p>
        </div>
        {t && tab !== 'cronometro' && (
          <button className="btn sm" onClick={() => setTab('cronometro')}>
            <Timer size={15} /> Cronômetro {t.running ? 'rodando' : 'pausado'}
          </button>
        )}
      </div>
      <Tabs
        label="Seções de estudos"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'materias', label: 'Matérias' },
          { value: 'planejamento', label: 'Provas e planejamento' },
          { value: 'cronometro', label: 'Cronômetro' },
          { value: 'revisoes', label: 'Revisões' },
          { value: 'historico', label: 'Histórico' },
        ]}
      />
      {tab === 'materias' && <Subjects onOpen={setOpenSubject} />}
      {tab === 'planejamento' && <Exams onOpen={setOpenExam} />}
      {tab === 'cronometro' && <FocusTimer />}
      {tab === 'revisoes' && <Reviews />}
      {tab === 'historico' && <History />}
      {openSubject && <SubjectDetail id={openSubject} onClose={() => setOpenSubject(null)} />}
      {openExam && <ExamDetail id={openExam} onClose={() => setOpenExam(null)} />}
    </div>
  )
}

function minutesThisWeek(subjectId: string, sessions: { subjectId?: string; date: string; durationMin: number }[], weekStart: 0 | 1) {
  const ws = startOfWeek(today(), weekStart)
  return sessions.filter((s) => s.subjectId === subjectId && s.date >= ws).reduce((a, s) => a + s.durationMin, 0)
}

function Subjects({ onOpen }: { onOpen: (id: string) => void }) {
  const data = useData()
  const settings = useSettings()
  const [editing, setEditing] = useState<Subject | 'new' | null>(null)
  const nextExam = data.exams.filter((e) => e.date >= today()).sort((a, b) => a.date.localeCompare(b.date))[0]
  return (
    <div className="dash">
      <div className="stack">
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn primary sm" onClick={() => setEditing('new')}>
            <Plus size={16} /> Nova matéria
          </button>
        </div>
        {data.subjects.length === 0 ? (
          <div className="card">
            <Empty title="Cadastre suas matérias" icon={<BookOpen size={34} />} action={<button className="btn primary" onClick={() => setEditing('new')}>Adicionar matéria</button>}>
              Defina uma meta semanal de horas e acompanhe o tempo dedicado a cada uma com o cronômetro de foco.
            </Empty>
          </div>
        ) : (
          data.subjects.map((s) => {
            const done = minutesThisWeek(s.id, data.sessions, settings.weekStart)
            const pct = s.weeklyGoalMin ? (done / s.weeklyGoalMin) * 100 : 0
            return (
              <button key={s.id} className="card entry-card" onClick={() => onOpen(s.id)}>
                <div className="row">
                  <span className="icon-tile" data-c={s.color}>
                    <BookOpen size={18} />
                  </span>
                  <div className="grow">
                    <b>{s.name}</b>
                    <div className="tiny faint">
                      {fmtDuration(done)} {s.weeklyGoalMin ? `de ${fmtDuration(s.weeklyGoalMin)} nesta semana` : 'nesta semana'}
                    </div>
                  </div>
                  {s.weeklyGoalMin > 0 && <span className="small faint num">{Math.round(pct)}%</span>}
                </div>
                {s.weeklyGoalMin > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <Progress value={pct} color={s.color} />
                  </div>
                )}
              </button>
            )
          })
        )}
      </div>
      <div className="grid">
        <Card title="Próxima prova">
          {nextExam ? (
            <div className="row">
              <span className="icon-tile">
                <CalendarCheck size={19} />
              </span>
              <div>
                <b>{nextExam.title}</b>
                <div className="small muted">
                  {fmtRelative(nextExam.date)} · {fmtDate(nextExam.date)} {nextExam.time && `· ${nextExam.time}`}
                </div>
                <div className="tiny faint">{diffDays(nextExam.date, today()) === 0 ? 'É hoje!' : `Faltam ${diffDays(nextExam.date, today())} dias`}</div>
              </div>
            </div>
          ) : (
            <p className="small muted">Nenhuma prova cadastrada.</p>
          )}
        </Card>
        <Card title="Horas nesta semana">
          <div className="big-money" style={{ fontSize: 30 }}>{fmtDuration(data.sessions.filter((s) => s.date >= startOfWeek(today(), settings.weekStart)).reduce((a, s) => a + s.durationMin, 0))}</div>
          <p className="tiny faint">Somadas das sessões registradas.</p>
        </Card>
      </div>
      {editing && <SubjectForm subject={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function SubjectForm({ subject, onClose }: { subject?: Subject; onClose: () => void }) {
  const [name, setName] = useState(subject?.name ?? '')
  const [color, setColor] = useState(subject?.color ?? 'ceu')
  const [goal, setGoal] = useState(subject ? String(subject.weeklyGoalMin / 60) : '3')
  const [err, setErr] = useState('')
  async function submit() {
    if (!name.trim()) return setErr('Dê um nome à matéria.')
    const h = parseFloat(goal.replace(',', '.'))
    if (goal && (isNaN(h) || h < 0 || h > 80)) return setErr('Meta semanal entre 0 e 80 horas.')
    const ok = await attempt(() => save('subjects', { ...(subject ?? { notes: '', materials: [] }), name: name.trim(), color, weeklyGoalMin: Math.round((h || 0) * 60) } as Subject), subject ? 'Matéria atualizada.' : 'Matéria criada.')
    if (ok) onClose()
  }
  return (
    <Modal title={subject ? 'Editar matéria' : 'Nova matéria'} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={submit}>Salvar</button></>}>
      <form className="stack" onSubmit={(e) => (e.preventDefault(), submit())}>
        <Field label="Nome" error={err}>
          <input className="input" autoFocus value={name} onChange={(e) => (setName(e.target.value), setErr(''))} placeholder="Ex.: Matemática" />
        </Field>
        <Field label="Meta semanal (horas)">
          <input className="input" inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} style={{ maxWidth: 120 }} />
        </Field>
        <div className="field">
          <span className="label">Cor</span>
          <ColorPick value={color} onChange={setColor} />
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

function SubjectDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const data = useData()
  const s = data.subjects.find((x) => x.id === id)
  const [edit, setEdit] = useState(false)
  const [notes, setNotes] = useState<string | null>(null)
  const [mat, setMat] = useState({ title: '', url: '', note: '' })
  if (!s)
    return (
      <Modal title="Matéria não encontrada" onClose={onClose}>
        <p className="muted">Ela pode ter sido excluída.</p>
      </Modal>
    )
  const sessions = data.sessions.filter((x) => x.subjectId === id).sort((a, b) => b.date.localeCompare(a.date))
  const total = sessions.reduce((a, x) => a + x.durationMin, 0)
  const validUrl = (u: string) => !u || /^https?:\/\//i.test(u)
  async function addMaterial() {
    if (!mat.title.trim()) return toast('Dê um título ao material.', 'erro')
    if (!validUrl(mat.url.trim())) return toast('O link precisa começar com http:// ou https://', 'erro')
    await attempt(() => patch('subjects', s!.id, { materials: [...s!.materials, { id: uid(), title: mat.title.trim(), url: mat.url.trim(), note: mat.note.trim() }] }), 'Material adicionado.')
    setMat({ title: '', url: '', note: '' })
  }
  async function del() {
    if (!(await confirm({ title: `Excluir "${s!.name}"?`, body: 'Materiais e anotações da matéria serão apagados. Sessões e tarefas continuam, sem vínculo.', confirmLabel: 'Excluir', danger: true }))) return
    const ok = await attempt(async () => {
      await remove('subjects', s!.id)
      return true
    }, 'Matéria excluída.')
    if (ok) onClose()
  }
  return (
    <Modal
      wide
      title={s.name}
      onClose={onClose}
      footer={
        <>
          <button className="btn danger left" onClick={del}>
            <Trash2 size={15} /> Excluir
          </button>
          <button className="btn" onClick={() => setEdit(true)}>
            <Edit3 size={15} /> Editar
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small muted">
          Total estudado: <b>{fmtDuration(total)}</b> em {sessions.length} sessão(ões).
        </p>
        <Field label="Anotações">
          <textarea className="textarea" value={notes ?? s.notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes != null && notes !== s.notes && attempt(() => patch('subjects', s.id, { notes }), 'Anotações salvas.')} placeholder="Resumos, fórmulas, dúvidas…" />
        </Field>
        <div className="field">
          <span className="label">Materiais</span>
          {s.materials.length === 0 && <span className="hint">Livros, links de vídeo, apostilas…</span>}
          <div className="list">
            {s.materials.map((m) => (
              <div key={m.id} className="list-item small">
                <FileText size={15} className="faint" />
                <span className="grow">
                  {m.url ? (
                    <a href={m.url} target="_blank" rel="noopener noreferrer">
                      {m.title} <ExternalLink size={11} />
                    </a>
                  ) : (
                    m.title
                  )}
                  {m.note && <div className="tiny faint">{m.note}</div>}
                </span>
                <button className="icon-btn sm" aria-label={`Remover ${m.title}`} onClick={() => attempt(() => patch('subjects', s.id, { materials: s.materials.filter((x) => x.id !== m.id) }))}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="row wrap">
            <input className="input" style={{ flex: '1 1 140px' }} placeholder="Título" value={mat.title} onChange={(e) => setMat({ ...mat, title: e.target.value })} aria-label="Título do material" />
            <input className="input" style={{ flex: '1 1 160px' }} placeholder="Link (opcional)" value={mat.url} onChange={(e) => setMat({ ...mat, url: e.target.value })} aria-label="Link do material" />
            <input className="input" style={{ flex: '1 1 140px' }} placeholder="Observação" value={mat.note} onChange={(e) => setMat({ ...mat, note: e.target.value })} aria-label="Observação" />
            <button className="btn sm" onClick={addMaterial}>
              <Plus size={15} /> Adicionar
            </button>
          </div>
        </div>
        {sessions.length > 0 && (
          <div className="field">
            <span className="label">Últimas sessões</span>
            {sessions.slice(0, 6).map((x) => (
              <span key={x.id} className="small">
                {fmtDate(x.date)} · {fmtDuration(x.durationMin)} {x.content && `· ${x.content}`}
              </span>
            ))}
          </div>
        )}
      </div>
      {edit && <SubjectForm subject={s} onClose={() => setEdit(false)} />}
    </Modal>
  )
}

function Exams({ onOpen }: { onOpen: (id: string) => void }) {
  const data = useData()
  const [form, setForm] = useState<Exam | 'new' | null>(null)
  const ref = today()
  const upcoming = data.exams.filter((e) => e.date >= ref).sort((a, b) => a.date.localeCompare(b.date))
  const past = data.exams.filter((e) => e.date < ref).sort((a, b) => b.date.localeCompare(a.date))
  const card = (e: Exam) => {
    const subj = data.subjects.find((s) => s.id === e.subjectId)
    const topicsDone = e.topics.filter((t) => t.done).length
    const prep = e.checklist.filter((t) => t.done).length
    return (
      <button key={e.id} className="card entry-card" onClick={() => onOpen(e.id)}>
        <div className="row">
          <span className="icon-tile" data-c={subj?.color ?? 'areia'}>
            {e.type === 'prova' ? <ClipboardList size={18} /> : <FileText size={18} />}
          </span>
          <div className="grow">
            <b>{e.title}</b>
            <div className="tiny faint">
              {e.type === 'prova' ? 'Prova' : 'Trabalho'}
              {subj && ` · ${subj.name}`} · {fmtRelative(e.date, ref)} {e.time && `às ${e.time}`}
            </div>
          </div>
          {e.date >= ref && <span className="tag">{diffDays(e.date, ref) === 0 ? 'hoje' : `${diffDays(e.date, ref)}d`}</span>}
        </div>
        {(e.topics.length > 0 || e.checklist.length > 0) && (
          <div className="row small faint" style={{ marginTop: 8, gap: 14 }}>
            {e.topics.length > 0 && <span>Conteúdo: {topicsDone}/{e.topics.length}</span>}
            {e.checklist.length > 0 && <span>Preparação: {prep}/{e.checklist.length}</span>}
          </div>
        )}
      </button>
    )
  }
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn primary sm" onClick={() => setForm('new')}>
          <Plus size={16} /> Nova prova ou trabalho
        </button>
      </div>
      {data.exams.length === 0 ? (
        <div className="card">
          <Empty title="Nenhuma prova ou entrega" icon={<CalendarCheck size={34} />} action={<button className="btn primary" onClick={() => setForm('new')}>Cadastrar prova</button>}>
            Cadastre a data, liste o conteúdo e gere um cronograma de estudos que se encaixa nos seus horários livres.
          </Empty>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && <div className="grid-2">{upcoming.map(card)}</div>}
          {past.length > 0 && (
            <>
              <div className="group-label">Anteriores</div>
              <div className="grid-2" style={{ opacity: 0.75 }}>
                {past.map(card)}
              </div>
            </>
          )}
        </>
      )}
      {form && <ExamForm exam={form === 'new' ? undefined : form} onClose={() => setForm(null)} />}
    </div>
  )
}

function ExamForm({ exam, onClose }: { exam?: Exam; onClose: () => void }) {
  const data = useData()
  const [e, setE] = useState({
    title: exam?.title ?? '',
    type: exam?.type ?? ('prova' as Exam['type']),
    subjectId: exam?.subjectId ?? '',
    date: exam?.date ?? addDays(today(), 7),
    time: exam?.time ?? '',
    topics: exam ? exam.topics.map((t) => t.title).join('\n') : '',
    notes: exam?.notes ?? '',
  })
  const [err, setErr] = useState<Record<string, string>>({})
  async function submit() {
    const er: Record<string, string> = {}
    if (!e.title.trim()) er.title = 'Dê um título.'
    if (!e.date) er.date = 'Escolha a data.'
    setErr(er)
    if (Object.keys(er).length) return
    const lines = e.topics.split('\n').map((x) => x.trim()).filter(Boolean)
    const topics = lines.map((title) => exam?.topics.find((t) => t.title === title) ?? { id: uid(), title, done: false })
    const ok = await attempt(
      () =>
        save('exams', {
          ...(exam ?? { checklist: defaultExamChecklist() }),
          title: e.title.trim(),
          type: e.type,
          subjectId: e.subjectId || undefined,
          date: e.date,
          time: e.time || undefined,
          topics,
          notes: e.notes,
        } as Exam),
      exam ? 'Atualizado.' : 'Cadastrado.',
    )
    if (ok) onClose()
  }
  return (
    <Modal title={exam ? 'Editar' : 'Nova prova ou trabalho'} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={submit}>Salvar</button></>}>
      <form className="form-grid" onSubmit={(ev) => (ev.preventDefault(), submit())}>
        <Field label="Título" className="full" error={err.title}>
          <input className="input" autoFocus value={e.title} onChange={(x) => setE({ ...e, title: x.target.value })} placeholder="Ex.: Prova de Matemática — Funções" />
        </Field>
        <Field label="Tipo">
          <select className="select" value={e.type} onChange={(x) => setE({ ...e, type: x.target.value as Exam['type'] })}>
            <option value="prova">Prova</option>
            <option value="trabalho">Trabalho / entrega</option>
          </select>
        </Field>
        <Field label="Matéria">
          <select className="select" value={e.subjectId} onChange={(x) => setE({ ...e, subjectId: x.target.value })}>
            <option value="">Nenhuma</option>
            {data.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Data" error={err.date}>
          <input className="input" type="date" value={e.date} onChange={(x) => setE({ ...e, date: x.target.value })} />
        </Field>
        <Field label="Horário (opcional)">
          <input className="input" type="time" value={e.time} onChange={(x) => setE({ ...e, time: x.target.value })} />
        </Field>
        <Field label="Conteúdo (um tópico por linha)" className="full">
          <textarea className="textarea" value={e.topics} onChange={(x) => setE({ ...e, topics: x.target.value })} placeholder={'Função afim\nFunção quadrática\nExponencial'} />
        </Field>
        <Field label="Observações" className="full">
          <input className="input" value={e.notes} onChange={(x) => setE({ ...e, notes: x.target.value })} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

function ExamDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const data = useData()
  const settings = useSettings()
  const e = data.exams.find((x) => x.id === id)
  const [edit, setEdit] = useState(false)
  const [perDay, setPerDay] = useState(60)
  const [sessionLen, setSessionLen] = useState(45)
  const [reviews, setReviews] = useState(true)
  const [proposals, setProposals] = useState<Proposal[] | null>(null)
  const [newCheck, setNewCheck] = useState('')
  if (!e)
    return (
      <Modal title="Não encontrado" onClose={onClose}>
        <p className="muted">Pode ter sido excluído.</p>
      </Modal>
    )
  const ref = today()
  const daysLeft = diffDays(e.date, ref)
  const subj = data.subjects.find((s) => s.id === e.subjectId)

  function generate() {
    const topics = e!.topics.filter((t) => !t.done).map((t) => t.title)
    const list = topics.length ? topics : [subj?.name ?? e!.title]
    const lastStudyDay = daysLeft > 0 ? addDays(e!.date, -1) : ref
    const days: string[] = []
    for (let d = ref; d <= lastStudyDay; d = addDays(d, 1)) days.push(d)
    const perDaySessions = Math.max(1, Math.floor(perDay / sessionLen))
    const tasks: (Partial<Task> & { title: string })[] = []
    let k = 0
    const reviewDay = reviews && days.length > 2 ? days[days.length - 1] : null
    for (const d of days) {
      if (d === reviewDay) {
        tasks.push({ title: `Revisão geral — ${e!.title}`, dueDate: d, estimateMin: Math.min(perDay, 90), priority: 'alta', subjectId: e!.subjectId, tags: ['estudos', 'revisao'] })
        continue
      }
      for (let j = 0; j < perDaySessions; j++) {
        const topic = list[k % list.length]
        const isReview = k >= list.length
        tasks.push({ title: `${isReview ? 'Revisar' : 'Estudar'}: ${topic}`, dueDate: d, estimateMin: sessionLen, priority: 'alta', subjectId: e!.subjectId, tags: ['estudos'] })
        k++
      }
    }
    if (!tasks.length) return toast('Não há dias de estudo antes da prova.', 'erro')
    const fake = tasks.map((t, i) => ({ ...newTask(t), id: `tmp${i}`, createdAt: '', updatedAt: '' }) as Task)
    const r = plan({ tasks: [...data.tasks, ...fake], events: data.events, settings, horizonDays: Math.max(1, days.length), onlyTaskIds: fake.map((f) => f.id), notBefore: Object.fromEntries(fake.map((f) => [f.id, f.dueDate!])) })
    setProposals(
      tasks.map((t, i) => {
        const slot = r.proposals.find((p) => p.taskId === `tmp${i}`)
        const task = slot ? { ...t, dueDate: slot.date, plannedDate: slot.date, plannedStart: slot.start, plannedEnd: slot.end } : t
        return { id: uid('p'), kind: 'create_task', task, reason: slot ? `Horário livre: ${fmtRelative(slot.date, ref).toLowerCase()}, ${slot.start}–${slot.end}.` : 'Sem horário livre encontrado no seu limite diário — fica só com a data.', status: 'pendente' } as Proposal
      }),
    )
  }
  const toggle = (field: 'topics' | 'checklist', tid: string) => attempt(() => patch('exams', e.id, { [field]: e[field].map((t) => (t.id === tid ? { ...t, done: !t.done } : t)) }))
  async function del() {
    if (!(await confirm({ title: 'Excluir?', body: `"${e!.title}" será excluído. Tarefas de estudo já criadas continuam.`, confirmLabel: 'Excluir', danger: true }))) return
    if (await attempt(() => remove('exams', e!.id).then(() => true), 'Excluído.')) onClose()
  }
  return (
    <Modal
      wide
      title={e.title}
      onClose={onClose}
      footer={
        <>
          <button className="btn danger left" onClick={del}>
            <Trash2 size={15} /> Excluir
          </button>
          <button className="btn" onClick={() => setEdit(true)}>
            <Edit3 size={15} /> Editar
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small muted">
          {e.type === 'prova' ? 'Prova' : 'Entrega'} {fmtRelative(e.date, ref).toLowerCase()} ({fmtDate(e.date)}
          {e.time && ` às ${e.time}`}) · {daysLeft < 0 ? 'já passou' : daysLeft === 0 ? 'é hoje' : `faltam ${daysLeft} dias`}
          {subj && ` · ${subj.name}`}
        </p>
        <div className="grid-2">
          <div className="field">
            <span className="label">Conteúdo ({e.topics.filter((t) => t.done).length}/{e.topics.length} estudados)</span>
            {e.topics.length === 0 && <span className="hint">Edite para listar os tópicos.</span>}
            {e.topics.map((t) => (
              <label key={t.id} className="row small">
                <input type="checkbox" className="check square" checked={t.done} onChange={() => toggle('topics', t.id)} />
                <span style={{ textDecoration: t.done ? 'line-through' : undefined }}>{t.title}</span>
              </label>
            ))}
          </div>
          <div className="field">
            <span className="label">Checklist de preparação</span>
            {e.checklist.map((t) => (
              <div key={t.id} className="row small">
                <input type="checkbox" className="check square" checked={t.done} onChange={() => toggle('checklist', t.id)} aria-label={t.title} />
                <span className="grow" style={{ textDecoration: t.done ? 'line-through' : undefined }}>{t.title}</span>
                <button className="icon-btn sm" aria-label={`Remover ${t.title}`} onClick={() => attempt(() => patch('exams', e.id, { checklist: e.checklist.filter((x) => x.id !== t.id) }))}>
                  <X size={13} />
                </button>
              </div>
            ))}
            <form className="row" onSubmit={(ev) => { ev.preventDefault(); if (!newCheck.trim()) return; attempt(() => patch('exams', e.id, { checklist: [...e.checklist, { id: uid(), title: newCheck.trim(), done: false }] })); setNewCheck('') }}>
              <input className="input" value={newCheck} onChange={(x) => setNewCheck(x.target.value)} placeholder="Novo item" aria-label="Novo item do checklist" />
              <button className="btn sm" type="submit" disabled={!newCheck.trim()}>
                <Plus size={14} />
              </button>
            </form>
          </div>
        </div>
        {daysLeft >= 0 && (
          <div className="card soft">
            <h3 style={{ marginBottom: 10 }}>Gerar cronograma de estudos</h3>
            <div className="row wrap">
              <Field label="Minutos por dia">
                <input className="input" type="number" min={15} step={15} value={perDay} onChange={(x) => setPerDay(Math.max(15, +x.target.value || 15))} style={{ width: 110 }} />
              </Field>
              <Field label="Duração da sessão">
                <input className="input" type="number" min={15} step={5} value={sessionLen} onChange={(x) => setSessionLen(Math.max(15, +x.target.value || 15))} style={{ width: 110 }} />
              </Field>
              <div style={{ alignSelf: 'flex-end', paddingBottom: 8 }}>
                <Switch checked={reviews} onChange={setReviews} label="Véspera para revisão" />
              </div>
            </div>
            <button className="btn primary sm" style={{ marginTop: 10 }} onClick={generate}>
              <Wand2 size={15} /> Sugerir cronograma
            </button>
            <p className="tiny faint" style={{ marginTop: 6 }}>Distribui os tópicos não estudados até a véspera e encaixa nos seus horários livres. É uma sugestão — não garante nota ou resultado.</p>
            {proposals && (
              <div style={{ marginTop: 10 }}>
                <ProposalList proposals={proposals} onChange={setProposals} />
              </div>
            )}
          </div>
        )}
        {e.notes && <p className="small muted">{e.notes}</p>}
      </div>
      {edit && <ExamForm exam={e} onClose={() => setEdit(false)} />}
    </Modal>
  )
}

function notifyEnd(title: string, body: string) {
  toast(`${title} — ${body}`, 'info')
  try {
    if (getState().settings.notifications.enabled && 'Notification' in window && Notification.permission === 'granted') new Notification(title, { body, icon: './icon-192.png' })
  } catch {
    /* sem suporte */
  }
}

/** Encerra a fase de foco: registra a sessão (e revisões) e prepara a pausa. */
export async function finishFocus(natural: boolean) {
  const s = timer.getTimer()
  if (!s || s.phase !== 'foco') return
  const p = getState().settings.pomodoro
  const minutes = Math.round(timer.focusElapsedMs(s) / 60000)
  timer.pause()
  const reviews = s.reviews ?? true
  if (minutes >= 1) {
    const start = fromMin(Math.max(0, nowMin() - minutes))
    const ok = await attempt(() => save('sessions', { subjectId: s.subjectId || undefined, date: today(), start, durationMin: minutes, content: s.content.trim() }))
    if (ok && reviews && s.content.trim()) {
      await attempt(() => saveMany('reviews', [1, 3, 7].map((d) => ({ subjectId: s.subjectId || undefined, topic: s.content.trim(), dueDate: addDays(today(), d), done: false }))))
    }
    if (ok) toast(`Sessão de ${fmtDuration(minutes)} registrada${reviews && s.content.trim() ? ' + revisões em 1, 3 e 7 dias' : ''}.`)
  } else if (!natural) toast('Sessão com menos de 1 minuto — não foi registrada.', 'info')
  if (natural) {
    const cycle = s.cycle + 1
    const long = cycle % p.cycles === 0
    notifyEnd('Foco concluído', long ? `Hora de uma pausa longa (${p.longMin} min).` : `Hora de uma pausa (${p.shortMin} min).`)
    const ms = (long ? p.longMin : p.shortMin) * 60000
    timer.update({ phase: long ? 'pausa_longa' : 'pausa_curta', cycle, running: false, endsAt: null, remainingMs: ms, totalMs: ms, focusAccumMs: 0 })
  } else timer.reset()
}

/** Montado no App: encerra fases mesmo fora da tela de Estudos. */
export function TimerWatcher() {
  const t = timer.useTimer()
  timer.useTick(!!t?.running)
  const ended = !!t?.running && timer.remaining(t) <= 0
  useEffect(() => {
    if (!ended || !t) return
    if (t.phase === 'foco') finishFocus(true)
    else {
      timer.update({ running: false, endsAt: null, remainingMs: 0 })
      notifyEnd('Pausa encerrada', 'Pronto para mais um foco?')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended])
  return null
}

function FocusTimer() {
  const data = useData()
  const settings = useSettings()
  const t = timer.useTimer()
  const p = settings.pomodoro
  timer.useTick(!!t?.running)
  const [subjectId, setSubjectId] = useState(t?.subjectId ?? '')
  const [content, setContent] = useState(t?.content ?? '')
  const scheduleReviews = t?.reviews ?? true
  const setScheduleReviews = (v: boolean) => timer.update({ reviews: v })
  const [cfg, setCfg] = useState(p)
  const rem = t ? timer.remaining(t) : p.focusMin * 60_000

  const total = t?.totalMs ?? p.focusMin * 60_000
  const pct = ((total - rem) / total) * 100
  const mm = String(Math.floor(rem / 60000)).padStart(2, '0')
  const ss = String(Math.floor((rem % 60000) / 1000)).padStart(2, '0')
  const phaseLabel = !t ? 'Pronto para focar' : t.phase === 'foco' ? 'Foco' : t.phase === 'pausa_curta' ? 'Pausa curta' : 'Pausa longa'

  return (
    <div className="dash">
      <Card>
        <div className="timer">
          <div className={`timer-ring${t && t.phase !== 'foco' ? ' pausa' : ''}`} style={{ ['--p' as string]: pct }}>
            <div>
              <span className="small muted">{phaseLabel}</span>
              <span className="clock" role="timer" aria-live="off">
                {mm}:{ss}
              </span>
              {t && <span className="tiny faint">Ciclo {(t.cycle % p.cycles) + (t.phase === 'foco' ? 1 : 0)} de {p.cycles}</span>}
            </div>
          </div>
          <div className="row wrap" style={{ justifyContent: 'center' }}>
            {!t && (
              <button className="btn primary" onClick={() => timer.startPhase('foco', p.focusMin, { subjectId, content, cycle: 0, reviews: true })}>
                <Play size={17} /> Iniciar foco ({p.focusMin} min)
              </button>
            )}
            {t?.running && (
              <button className="btn" onClick={timer.pause}>
                <Pause size={17} /> Pausar
              </button>
            )}
            {t && !t.running && rem > 0 && (
              <button className="btn primary" onClick={timer.resume}>
                <Play size={17} /> Continuar
              </button>
            )}
            {t && t.phase !== 'foco' && (
              <button className="btn primary" onClick={() => timer.startPhase('foco', p.focusMin, { subjectId, content })}>
                <Play size={17} /> {rem > 0 ? 'Pular pausa' : 'Próximo foco'}
              </button>
            )}
                        {t?.phase === 'foco' && (
              <button className="btn" onClick={() => finishFocus(false)}>
                <Square size={15} /> Encerrar e registrar
              </button>
            )}
            {t && (
              <button className="btn ghost" onClick={async () => (await confirm({ title: 'Zerar o cronômetro?', body: 'O tempo desta fase não será registrado.', confirmLabel: 'Zerar' })) && timer.reset()}>
                <RotateCcw size={15} /> Zerar
              </button>
            )}
          </div>
        </div>
      </Card>
      <div className="grid">
        <Card title="Sessão">
          <div className="stack">
            <Field label="Matéria">
              <select className="select" value={subjectId} onChange={(e) => (setSubjectId(e.target.value), timer.update({ subjectId: e.target.value }))}>
                <option value="">Sem matéria</option>
                {data.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="O que você está estudando?">
              <input className="input" value={content} onChange={(e) => (setContent(e.target.value), timer.update({ content: e.target.value }))} placeholder="Ex.: Função quadrática — exercícios" />
            </Field>
            <Switch checked={scheduleReviews} onChange={setScheduleReviews} label="Programar revisões (1, 3 e 7 dias)" />
            <p className="tiny faint">O tempo de foco é registrado ao final de cada ciclo ou ao clicar em "Encerrar e registrar". O cronômetro continua mesmo se você trocar de tela.</p>
          </div>
        </Card>
        <Card title="Configurar ciclos">
          <div className="form-grid">
            <Field label="Foco (min)">
              <input className="input" type="number" min={5} max={120} value={cfg.focusMin} onChange={(e) => setCfg({ ...cfg, focusMin: +e.target.value })} />
            </Field>
            <Field label="Pausa curta">
              <input className="input" type="number" min={1} max={60} value={cfg.shortMin} onChange={(e) => setCfg({ ...cfg, shortMin: +e.target.value })} />
            </Field>
            <Field label="Pausa longa">
              <input className="input" type="number" min={1} max={90} value={cfg.longMin} onChange={(e) => setCfg({ ...cfg, longMin: +e.target.value })} />
            </Field>
            <Field label="Focos até a pausa longa">
              <input className="input" type="number" min={1} max={10} value={cfg.cycles} onChange={(e) => setCfg({ ...cfg, cycles: +e.target.value })} />
            </Field>
          </div>
          <button
            className="btn sm"
            style={{ marginTop: 10 }}
            onClick={() => {
              const ok = cfg.focusMin >= 5 && cfg.focusMin <= 120 && cfg.shortMin >= 1 && cfg.longMin >= 1 && cfg.cycles >= 1 && cfg.cycles <= 10
              if (!ok) return toast('Valores fora do intervalo permitido.', 'erro')
              attempt(() => saveSettings({ pomodoro: cfg }), 'Ciclos salvos.')
            }}
          >
            <Check size={15} /> Salvar
          </button>
        </Card>
      </div>
    </div>
  )
}

function Reviews() {
  const data = useData()
  const ref = today()
  const due = data.reviews.filter((r) => !r.done && r.dueDate <= ref).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const next = data.reviews.filter((r) => !r.done && r.dueDate > ref).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const done = data.reviews.filter((r) => r.done).length
  const row = (r: (typeof data.reviews)[number]) => {
    const s = data.subjects.find((x) => x.id === r.subjectId)
    return (
      <div key={r.id} className="list-item">
        <input type="checkbox" className="check" checked={r.done} onChange={() => attempt(() => patch('reviews', r.id, { done: !r.done }), 'Revisão concluída.')} aria-label={`Concluir revisão ${r.topic}`} />
        <span className="grow">
          <div>{r.topic}</div>
          <div className="tiny faint">
            {s?.name ?? 'Sem matéria'} · {fmtRelative(r.dueDate, ref)}
          </div>
        </span>
        <button className="icon-btn sm" aria-label="Excluir revisão" onClick={() => attempt(() => remove('reviews', r.id))}>
          <Trash2 size={14} />
        </button>
      </div>
    )
  }
  return (
    <div className="grid-2">
      <Card title={`Para fazer agora (${due.length})`}>
        {due.length === 0 ? <Empty compact title="Nenhuma revisão pendente" icon={<Check size={26} />}>Revisões são criadas automaticamente após sessões de foco com conteúdo informado.</Empty> : <div className="list">{due.map(row)}</div>}
      </Card>
      <Card title={`Próximas (${next.length})`}>
        {next.length === 0 ? <p className="small muted">Nada programado.</p> : <div className="list">{next.slice(0, 20).map(row)}</div>}
        {done > 0 && <p className="tiny faint" style={{ marginTop: 8 }}>{done} revisão(ões) concluída(s) no total.</p>}
      </Card>
    </div>
  )
}

function History() {
  const data = useData()
  const [manual, setManual] = useState(false)
  const sessions = [...data.sessions].sort((a, b) => b.date.localeCompare(a.date) || b.start.localeCompare(a.start))
  const bySubject = data.subjects.map((s) => ({ s, min: data.sessions.filter((x) => x.subjectId === s.id).reduce((a, x) => a + x.durationMin, 0) })).filter((x) => x.min > 0).sort((a, b) => b.min - a.min)
  const max = Math.max(1, ...bySubject.map((x) => x.min))
  return (
    <div className="dash">
      <Card title="Sessões" action={<button className="btn sm" onClick={() => setManual(true)}><Plus size={15} /> Registrar manualmente</button>}>
        {sessions.length === 0 ? (
          <Empty compact title="Nenhuma sessão ainda" icon={<Timer size={26} />}>Use o cronômetro ou registre manualmente.</Empty>
        ) : (
          <div className="list">
            {sessions.slice(0, 60).map((x) => {
              const s = data.subjects.find((y) => y.id === x.subjectId)
              return (
                <div key={x.id} className="list-item small">
                  <i className="dot-c" data-c={s?.color ?? 'cinza'} />
                  <span className="grow">
                    <b>{s?.name ?? 'Sem matéria'}</b> · {fmtDuration(x.durationMin)}
                    <div className="tiny faint">
                      {fmtDate(x.date)} às {x.start} {x.content && `· ${x.content}`}
                    </div>
                  </span>
                  <button className="icon-btn sm" aria-label="Excluir sessão" onClick={async () => (await confirm({ title: 'Excluir sessão?', confirmLabel: 'Excluir', danger: true })) && attempt(() => remove('sessions', x.id), 'Sessão excluída.')}>
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </Card>
      <Card title="Horas por matéria (total)">
        {bySubject.length === 0 ? (
          <p className="small muted">Aparece quando houver sessões com matéria.</p>
        ) : (
          <div className="stack">
            {bySubject.map(({ s, min }) => (
              <div key={s.id} className="stack-sm">
                <div className="row between small">
                  <span>{s.name}</span>
                  <span className="num faint">{fmtDuration(min)}</span>
                </div>
                <Progress value={(min / max) * 100} color={s.color} />
              </div>
            ))}
          </div>
        )}
      </Card>
      {manual && <ManualSession onClose={() => setManual(false)} />}
    </div>
  )
}

function ManualSession({ onClose }: { onClose: () => void }) {
  const data = useData()
  const [s, setS] = useState({ subjectId: '', date: today(), start: fromMin(Math.max(0, nowMin() - 60)), durationMin: 60, content: '' })
  async function submit() {
    if (!(s.durationMin >= 1 && s.durationMin <= 720)) return toast('Duração entre 1 e 720 minutos.', 'erro')
    if (await attempt(() => save('sessions', { ...s, subjectId: s.subjectId || undefined }), 'Sessão registrada.')) onClose()
  }
  return (
    <Modal title="Registrar sessão de estudo" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={submit}>Salvar</button></>}>
      <form className="form-grid" onSubmit={(e) => (e.preventDefault(), submit())}>
        <Field label="Matéria" className="full">
          <select className="select" value={s.subjectId} onChange={(e) => setS({ ...s, subjectId: e.target.value })}>
            <option value="">Sem matéria</option>
            {data.subjects.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Data">
          <input className="input" type="date" value={s.date} onChange={(e) => setS({ ...s, date: e.target.value })} />
        </Field>
        <Field label="Início">
          <input className="input" type="time" value={s.start} onChange={(e) => setS({ ...s, start: e.target.value })} />
        </Field>
        <Field label="Duração (min)">
          <input className="input" type="number" min={1} value={s.durationMin} onChange={(e) => setS({ ...s, durationMin: +e.target.value })} />
        </Field>
        <Field label="Conteúdo" className="full">
          <input className="input" value={s.content} onChange={(e) => setS({ ...s, content: e.target.value })} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
