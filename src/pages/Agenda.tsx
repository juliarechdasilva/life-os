import { AlertTriangle, CalendarArrowDown, CalendarPlus, ChevronLeft, ChevronRight, MapPin, Repeat, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, Empty, Modal, Seg, Switch } from '../components/ui'
import { shareOrDownload } from '../lib/backup'
import { buildIcs } from '../lib/ics'
import {
  addDays,
  addMonths,
  fmtLong,
  fmtMonth,
  fmtRelative,
  fmtT,
  fromMin,
  nowMin,
  parseDate,
  startOfWeek,
  toMin,
  today,
  WEEKDAYS_SHORT,
} from '../lib/dates'
import { norm } from '../lib/nlp'
import { describeRecurrence, eventOccurrences, type Occurrence } from '../lib/recurrence'
import { patch, useData, useSettings } from '../lib/store'
import { isDone } from '../lib/tasks'
import type { DateStr, Task } from '../lib/types'
import { attempt, navigate, openEditor, toast, useRoute } from '../lib/ui'

type View = 'dia' | 'semana' | 'mes'
const HOUR = 52

interface Block {
  key: string
  date: DateStr
  start: number
  end: number
  title: string
  sub?: string
  color?: string
  kind: 'evento' | 'tarefa'
  done: boolean
  conflict?: boolean
  open: () => void
  col?: number
  cols?: number
}

function layout(blocks: Block[]): Block[] {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end)
  const out: Block[] = []
  let cluster: Block[] = []
  let clusterEnd = -1
  const flush = () => {
    const cols: number[] = []
    for (const b of cluster) {
      let c = cols.findIndex((end) => end <= b.start)
      if (c < 0) c = cols.length
      cols[c] = b.end
      b.col = c
    }
    for (const b of cluster) b.cols = cols.length
    out.push(...cluster)
    cluster = []
  }
  for (const b of sorted) {
    if (b.start >= clusterEnd && cluster.length) flush()
    cluster.push({ ...b })
    clusterEnd = Math.max(clusterEnd, b.end)
  }
  if (cluster.length) flush()
  return out
}

export default function Agenda() {
  const data = useData()
  const settings = useSettings()
  const { params } = useRoute()
  const ref = today()
  const [view, setView] = useState<View>(() => {
    try {
      return (localStorage.getItem('agenda-view') as View) || 'dia'
    } catch {
      return 'dia'
    }
  })
  const [date, setDate] = useState<DateStr>(params.get('data') ?? ref)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string | null>(null)
  const [showTasks, setShowTasks] = useState(true)
  const [exporting, setExporting] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem('agenda-view', view)
    } catch {
      /* armazenamento indisponível */
    }
  }, [view])
  useEffect(() => {
    const id = params.get('id')
    const d = params.get('data')
    if (d) setDate(d)
    if (id) openEditor({ type: 'event', id, date: d ?? undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const range = useMemo(() => {
    if (view === 'dia') return [date, date] as const
    if (view === 'semana') {
      const s = startOfWeek(date, settings.weekStart)
      return [s, addDays(s, 6)] as const
    }
    const first = date.slice(0, 8) + '01'
    const s = startOfWeek(first, settings.weekStart)
    return [s, addDays(s, 41)] as const
  }, [view, date, settings.weekStart])

  const events = cat ? data.events.filter((e) => e.categoryId === cat) : data.events
  const occ = eventOccurrences(events, range[0], range[1])
  const conflictKeys = useMemo(() => {
    const k = new Set<string>()
    for (let i = 0; i < occ.length; i++)
      for (let j = i + 1; j < occ.length; j++) {
        const a = occ[i]
        const b = occ[j]
        if (a.date === b.date && a.startMin < b.endMin && b.startMin < a.endMin) {
          k.add(a.event.id + a.date)
          k.add(b.event.id + b.date)
        }
      }
    return k
  }, [occ])

  const catOf = (id?: string) => data.categories.find((c) => c.id === id)
  const blocksFor = (d: DateStr): Block[] => {
    const list: Block[] = occ
      .filter((o) => o.date === d)
      .map((o) => ({
        key: o.event.id + d,
        date: d,
        start: o.startMin,
        end: Math.max(o.endMin, o.startMin + 20),
        title: o.event.title,
        sub: `${fmtT(fromMin(o.startMin))}–${fmtT(fromMin(o.endMin))}${o.event.location ? ' · ' + o.event.location : ''}`,
        color: catOf(o.event.categoryId)?.color ?? 'salvia',
        kind: 'evento',
        done: o.done,
        conflict: conflictKeys.has(o.event.id + d),
        open: () => openEditor({ type: 'event', id: o.event.id, date: d }),
      }))
    if (showTasks)
      for (const t of data.tasks) {
        if (cat && t.categoryId !== cat) continue
        const time = t.plannedDate === d ? t.plannedStart : t.dueDate === d && !t.plannedDate ? t.dueTime : undefined
        if (!time) continue
        const s = toMin(time)
        const e = t.plannedDate === d && t.plannedEnd ? toMin(t.plannedEnd) : s + (t.estimateMin ?? 30)
        list.push({ key: 't' + t.id, date: d, start: s, end: Math.max(e, s + 20), title: t.title, sub: 'Tarefa', color: catOf(t.categoryId)?.color ?? 'salvia', kind: 'tarefa', done: isDone(t), open: () => openEditor({ type: 'task', id: t.id }) })
      }
    return layout(list)
  }
  const unscheduledTasks = (d: DateStr): Task[] =>
    showTasks ? data.tasks.filter((t) => t.dueDate === d && !t.dueTime && t.plannedDate !== d && (!cat || t.categoryId === cat)) : []

  const step = (n: number) => setDate((d) => (view === 'dia' ? addDays(d, n) : view === 'semana' ? addDays(d, 7 * n) : addMonths(d.slice(0, 8) + '01', n)))

  const allBlocks = view !== 'mes' ? (view === 'dia' ? blocksFor(date) : []) : []
  const firstHour = Math.min(7, ...allBlocks.map((b) => Math.floor(b.start / 60)), ...settings.planning.availability.filter((a) => a.enabled).map((a) => +a.start.slice(0, 2)))
  const hours = Array.from({ length: 24 - firstHour }, (_, i) => firstHour + i)

  useEffect(() => {
    // rola até perto da hora atual
    if (scrollRef.current && view !== 'mes') {
      const target = date === ref ? Math.max(0, (nowMin() / 60 - firstHour - 1) * HOUR) : Math.max(0, (8 - firstHour) * HOUR)
      scrollRef.current.scrollTop = target
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, date])

  // Busca
  const results = q.trim().length >= 2 ? data.events.filter((e) => norm([e.title, e.description, e.location].join(' ')).includes(norm(q))) : null
  const upcoming = eventOccurrences(events, ref, addDays(ref, 30)).filter((o) => o.date > ref || o.endMin > nowMin()).slice(0, 8)

  const ws = startOfWeek(date, settings.weekStart)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(ws, i))
  const markOccurrence = (o: Occurrence) => {
    const done = o.event.doneDates.includes(o.date)
    attempt(() => patch('events', o.event.id, { doneDates: done ? o.event.doneDates.filter((d) => d !== o.date) : [...o.event.doneDates, o.date] }), done ? 'Marcado como pendente.' : 'Compromisso concluído.')
  }

  const hourGrid = (d: DateStr, blocks: Block[]) => (
    <div className="hours-col" style={{ height: hours.length * HOUR }} onDoubleClick={(e) => {
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
      const min = Math.floor(((e.clientY - rect.top) / HOUR) * 2) * 30 + firstHour * 60
      openEditor({ type: 'event', date: d, preset: { start: fromMin(Math.min(min, 23 * 60)) } })
    }}>
      {hours.map((h) => (
        <div key={h} className="hour-line" style={{ height: HOUR }} />
      ))}
      {d === ref && nowMin() / 60 >= firstHour && <div className="now-line" style={{ top: (nowMin() / 60 - firstHour) * HOUR }} aria-hidden="true" />}
      {blocks.map((b) => (
        <button
          key={b.key}
          className={`ev-block${b.kind === 'tarefa' ? ' task' : ''}${b.done ? ' done' : ''}${b.conflict ? ' conflict' : ''}`}
          data-c={b.color}
          style={{
            top: (b.start / 60 - firstHour) * HOUR + 1,
            height: Math.max(22, ((b.end - b.start) / 60) * HOUR - 3),
            left: `calc(${((b.col ?? 0) / (b.cols ?? 1)) * 100}% + 4px)`,
            width: `calc(${100 / (b.cols ?? 1)}% - 8px)`,
            right: 'auto',
          }}
          onClick={b.open}
          title={`${b.title} — ${b.sub}${b.conflict ? ' (conflito de horário)' : ''}`}
        >
          <div className="ttl ellipsis" style={{ fontWeight: 550 }}>
            {b.conflict && <AlertTriangle size={11} style={{ color: 'var(--danger)', marginRight: 3 }} />}
            {b.title}
          </div>
          {b.end - b.start >= 40 && <div className="sub ellipsis">{b.sub}</div>}
        </button>
      ))}
    </div>
  )

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{view === 'dia' ? fmtLong(date) : fmtMonth(view === 'mes' ? date.slice(0, 8) + '01' : date)}</h1>
          <p>{view === 'dia' ? fmtRelative(date, ref) : view === 'semana' ? `Semana de ${fmtRelative(ws, ref).toLowerCase()}` : 'Visão mensal'}</p>
        </div>
        <div className="row wrap">
          <button className="icon-btn" aria-label="Anterior" onClick={() => step(-1)}>
            <ChevronLeft size={20} />
          </button>
          <button className="btn sm" onClick={() => setDate(ref)}>
            Hoje
          </button>
          <button className="icon-btn" aria-label="Próximo" onClick={() => step(1)}>
            <ChevronRight size={20} />
          </button>
          <button className="btn sm" onClick={() => setExporting(true)} title="Levar para o calendário do celular">
            <CalendarArrowDown size={16} /> <span className="desktop-only">Calendário do celular</span>
          </button>
          <button className="btn primary sm" onClick={() => openEditor({ type: 'event', date: view === 'dia' ? date : undefined })}>
            <CalendarPlus size={16} /> Novo evento
          </button>
        </div>
      </div>

      <div className="row wrap between" style={{ marginBottom: 12, gap: 10 }}>
        <Seg
          label="Visualização"
          value={view}
          onChange={setView}
          options={[
            { value: 'dia', label: 'Dia' },
            { value: 'semana', label: 'Semana' },
            { value: 'mes', label: 'Mês' },
          ]}
        />
        <div className="row wrap">
          <Switch checked={showTasks} onChange={setShowTasks} label="Mostrar tarefas" />
          <label className="searchbox" style={{ minWidth: 200, display: 'flex' }}>
            <Search size={15} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar eventos" style={{ border: 0, background: 'none', minWidth: 0, flex: 1 }} aria-label="Pesquisar eventos" />
          </label>
        </div>
      </div>
      <div className="chips" style={{ marginBottom: 14 }}>
        <button className="chip" aria-pressed={cat === null} onClick={() => setCat(null)}>
          Todas
        </button>
        {data.categories.map((c) => (
          <button key={c.id} className="chip" aria-pressed={cat === c.id} onClick={() => setCat(cat === c.id ? null : c.id)} data-c={c.color}>
            <i className="dot-c" /> {c.name}
          </button>
        ))}
      </div>

      {results ? (
        <Card title={`${results.length} evento${results.length === 1 ? '' : 's'} encontrado${results.length === 1 ? '' : 's'}`}>
          {results.length === 0 ? (
            <Empty compact title="Nenhum evento encontrado" />
          ) : (
            <div className="list">
              {results.map((e) => (
                <button key={e.id} className="list-item clickable" style={{ border: 0, borderBottom: '1px solid var(--line)', background: 'none', width: '100%', textAlign: 'left' }} onClick={() => openEditor({ type: 'event', id: e.id, date: e.date })}>
                  <i className="dot-c" data-c={catOf(e.categoryId)?.color} />
                  <span className="grow">
                    <div>{e.title}</div>
                    <div className="tiny faint">
                      {e.date.split('-').reverse().join('/')} · {e.start} {e.recurrence && `· ${describeRecurrence(e.recurrence)}`}
                    </div>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>
      ) : (
        <div className="dash">
          <Card className="flat" soft={false}>
            {view === 'dia' && (
              <>
                <div className="week-strip" style={{ marginBottom: 12 }}>
                  {weekDays.map((d) => {
                    const has = eventOccurrences(events, d, d).length + data.tasks.filter((t) => !isDone(t) && (t.dueDate === d || t.plannedDate === d)).length
                    return (
                      <button key={d} aria-selected={d === date} className={d === ref ? 'today' : ''} onClick={() => setDate(d)} aria-label={fmtLong(d)}>
                        {WEEKDAYS_SHORT[parseDate(d).getDay()].charAt(0).toUpperCase()}
                        <span className="d">{parseDate(d).getDate()}</span>
                        <span className="marks">{has > 0 && <i />}</span>
                      </button>
                    )
                  })}
                </div>
                {unscheduledTasks(date).length > 0 && (
                  <div className="stack-sm" style={{ marginBottom: 12 }}>
                    <span className="tiny faint">Tarefas do dia, sem horário</span>
                    <div className="chips" style={{ flexWrap: 'wrap' }}>
                      {unscheduledTasks(date).map((t) => (
                        <button key={t.id} className="chip" onClick={() => openEditor({ type: 'task', id: t.id })} style={{ textDecoration: isDone(t) ? 'line-through' : undefined }}>
                          ☐ {t.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div ref={scrollRef} style={{ maxHeight: '62vh', overflowY: 'auto' }}>
                  <div className="day-view">
                    <div>
                      {hours.map((h) => (
                        <div key={h} className="hour-label" style={{ height: HOUR }}>
                          {fmtT(`${String(h).padStart(2, '0')}:00`)}
                        </div>
                      ))}
                    </div>
                    {hourGrid(date, allBlocks)}
                  </div>
                </div>
                <p className="tiny faint" style={{ marginTop: 8 }}>
                  Dica: clique duas vezes em um horário vazio para criar um evento. Blocos tracejados são tarefas planejadas.
                </p>
              </>
            )}
            {view === 'semana' && (
              <div ref={scrollRef} style={{ maxHeight: '68vh', overflow: 'auto' }}>
                <div className="week-grid" style={{ minWidth: 640 }}>
                  <div />
                  {weekDays.map((d) => (
                    <div key={d} className={`colhead${d === ref ? ' today' : ''}`} onClick={() => (setDate(d), setView('dia'))} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && (setDate(d), setView('dia'))}>
                      {WEEKDAYS_SHORT[parseDate(d).getDay()]}
                      <b>{parseDate(d).getDate()}</b>
                    </div>
                  ))}
                  <div>
                    {hours.map((h) => (
                      <div key={h} className="hour-label" style={{ height: HOUR }}>
                        {String(h).padStart(2, '0')}h
                      </div>
                    ))}
                  </div>
                  {weekDays.map((d) => (
                    <div key={d}>{hourGrid(d, blocksFor(d))}</div>
                  ))}
                </div>
              </div>
            )}
            {view === 'mes' && (
              <div className="month-grid">
                {Array.from({ length: 7 }, (_, i) => (
                  <div key={i} className="dow">
                    {WEEKDAYS_SHORT[(i + settings.weekStart) % 7]}
                  </div>
                ))}
                {Array.from({ length: 42 }, (_, i) => {
                  const d = addDays(range[0], i)
                  const items = blocksFor(d).sort((a, b) => a.start - b.start)
                  const other = d.slice(0, 7) !== date.slice(0, 7)
                  return (
                    <button key={d} className={`month-cell${other ? ' other' : ''}${d === ref ? ' today' : ''}`} onClick={() => (setDate(d), setView('dia'))} aria-label={`${fmtLong(d)}: ${items.length} item(ns)`}>
                      <span className="n">{parseDate(d).getDate()}</span>
                      {items.slice(0, 3).map((b) => (
                        <span key={b.key} className="pill" data-c={b.color} style={{ textDecoration: b.done ? 'line-through' : undefined }}>
                          {fmtT(fromMin(b.start))} {b.title}
                        </span>
                      ))}
                      {items.length > 3 && <span className="tiny faint">+{items.length - 3}</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </Card>

          <Card title="Próximos compromissos">
            {upcoming.length === 0 ? (
              <Empty compact title="Nada nos próximos 30 dias" icon={<CalendarPlus size={26} />}>
                Seus compromissos aparecerão aqui.
              </Empty>
            ) : (
              <div className="list">
                {upcoming.map((o) => (
                  <div key={o.event.id + o.date} className="list-item">
                    <input type="checkbox" className="check" checked={o.done} onChange={() => markOccurrence(o)} aria-label={`Concluir ${o.event.title}`} />
                    <button className="task-body" onClick={() => openEditor({ type: 'event', id: o.event.id, date: o.date })}>
                      <div className="row" style={{ gap: 6 }}>
                        <i className="dot-c" data-c={catOf(o.event.categoryId)?.color ?? 'salvia'} />
                        <span className="ellipsis" style={{ textDecoration: o.done ? 'line-through' : undefined }}>
                          {o.event.title}
                        </span>
                        {conflictKeys.has(o.event.id + o.date) && <AlertTriangle size={13} style={{ color: 'var(--danger)' }} aria-label="Conflito" />}
                      </div>
                      <div className="tiny faint row" style={{ gap: 6 }}>
                        {fmtRelative(o.date, ref)} · {fmtT(fromMin(o.startMin))}–{fmtT(fromMin(o.endMin))}
                        {o.event.recurrence && <Repeat size={11} />}
                        {o.event.location && (
                          <>
                            <MapPin size={11} /> {o.event.location}
                          </>
                        )}
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button className="link small" style={{ marginTop: 10 }} onClick={() => navigate('configuracoes?secao=categorias')}>
              Gerenciar categorias
            </button>
          </Card>
        </div>
      )}
      {exporting && <IcsExport onClose={() => setExporting(false)} />}
    </div>
  )
}

function IcsExport({ onClose }: { onClose: () => void }) {
  const data = useData()
  const settings = useSettings()
  const [ev, setEv] = useState(true)
  const [tk, setTk] = useState(true)
  const { count } = buildIcs({ events: data.events, tasks: data.tasks, settings, includeEvents: ev, includeTasks: tk })
  async function go() {
    const { ics, count } = buildIcs({ events: data.events, tasks: data.tasks, settings, includeEvents: ev, includeTasks: tk })
    if (!count) return toast('Nada para exportar com essas opções.', 'info')
    const r = await shareOrDownload(`life-os-agenda-${today()}.ics`, ics, 'text/calendar')
    if (r !== 'cancelado') {
      toast(`${count} item(ns) exportado(s). Abra o arquivo para adicionar ao calendário.`)
      onClose()
    }
  }
  return (
    <Modal
      title="Levar para o calendário do celular"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={go} disabled={!count}>
            Gerar arquivo ({count})
          </button>
        </>
      }
    >
      <div className="stack small">
        <p>
          Gera um arquivo de calendário (.ics) com seus compromissos e tarefas com horário. Ao abri-lo, eles vão para o <b>Calendário do seu celular</b> (iPhone, Google
          Agenda etc.), que <b>avisa nos horários mesmo com o Life OS fechado</b>.
        </p>
        <Switch checked={ev} onChange={setEv} label="Compromissos (com o lembrete de cada um, inclusive os que se repetem)" />
        <Switch checked={tk} onChange={setTk} label={`Tarefas com horário ou bloco planejado (aviso ${settings.notifications.leadMin} min antes)`} />
        <div className="callout neutral">
          <span>
            <b>No iPhone:</b> toque em "Gerar arquivo" → escolha <b>Calendário</b> (ou "Salvar em Arquivos" e depois toque no arquivo) → <b>Adicionar Todos</b>.
            <br />
            <b>Atenção:</b> é uma cópia. Se você mudar algo no Life OS, exporte de novo — importar duas vezes pode duplicar itens no calendário.
          </span>
        </div>
      </div>
    </Modal>
  )
}
