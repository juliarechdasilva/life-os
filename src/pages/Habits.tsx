import { Check, Coffee, Edit3, MoreVertical, Pause, Play, Plus, Sprout, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Card, ColorPick, Empty, Field, Menu, Modal, Seg, Switch, Tabs, WeekdayPick } from '../components/ui'
import { addDays, fmtLong, parseDate, startOfWeek, today, WEEKDAYS_LETTER } from '../lib/dates'
import { describeFreq, encouragement, habitStats, isScheduled, weekCount } from '../lib/habits'
import { patch, remove, save, useData, useSettings } from '../lib/store'
import type { Habit, HabitFreq } from '../lib/types'
import { attempt, confirm, navigate, useRoute } from '../lib/ui'
import { toggleHabit } from './Dashboard'

export default function Habits() {
  const data = useData()
  const settings = useSettings()
  const { params } = useRoute()
  const ref = today()
  const [tab, setTab] = useState<'hoje' | 'estatisticas'>('hoje')
  const [editing, setEditing] = useState<Habit | 'new' | null>(null)
  useEffect(() => {
    if (params.get('novo')) {
      setEditing('new')
      navigate('habitos')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const habits = [...data.habits].sort((a, b) => a.order - b.order)
  const active = habits.filter((h) => !h.paused)
  const todayList = active.filter((h) => isScheduled(h, ref))
  const notToday = active.filter((h) => !isScheduled(h, ref))
  const paused = habits.filter((h) => h.paused)
  const ws = startOfWeek(ref, settings.weekStart)
  const week = Array.from({ length: 7 }, (_, i) => addDays(ws, i))
  const doneToday = todayList.filter((h) => h.log[ref] === 'feito').length

  const menu = (h: Habit) => (
    <Menu
      trigger={<MoreVertical size={17} />}
      label={`Opções de ${h.name}`}
      items={[
        { label: h.log[ref] === 'descanso' ? 'Remover descanso de hoje' : 'Hoje é dia de descanso', icon: <Coffee size={16} />, onClick: () => toggleHabit(h, ref, 'descanso') },
        { label: 'Editar', icon: <Edit3 size={16} />, onClick: () => setEditing(h) },
        h.paused
          ? { label: 'Retomar', icon: <Play size={16} />, onClick: () => attempt(() => patch('habits', h.id, { paused: false }), 'Hábito retomado.') }
          : { label: 'Pausar', icon: <Pause size={16} />, onClick: () => attempt(() => patch('habits', h.id, { paused: true }), 'Hábito pausado. Sem pressa.') },
        {
          label: 'Excluir',
          icon: <Trash2 size={16} />,
          danger: true,
          onClick: async () => (await confirm({ title: 'Excluir hábito?', body: `"${h.name}" e todo o histórico serão apagados. Se quiser só dar um tempo, use "Pausar".`, confirmLabel: 'Excluir', danger: true })) && attempt(() => remove('habits', h.id), 'Hábito excluído.'),
        },
      ]}
    />
  )

  const row = (h: Habit) => {
    const st = h.log[ref]
    return (
      <div key={h.id} className="habit-row" data-c={h.color}>
        <span className="icon-tile" data-c={h.color}>
          <Sprout size={18} />
        </span>
        <div className="grow">
          <b>{h.name}</b>
          <div className="tiny faint">
            {h.target && `${h.target} · `}
            {describeFreq(h)}
            {h.frequency.type === 'vezes_semana' && ` · ${weekCount(h, ref, settings.weekStart)}/${h.frequency.times} nesta semana`}
            {st === 'descanso' && ' · descanso hoje'}
          </div>
        </div>
        {menu(h)}
        <button className={`habit-check ${st ?? ''}`} onClick={() => toggleHabit(h, ref)} aria-pressed={st === 'feito'} aria-label={st === 'feito' ? `Desmarcar ${h.name}` : `Marcar ${h.name} como feito hoje`}>
          {st === 'descanso' ? <Coffee size={15} /> : <Check size={17} />}
        </button>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Hábitos</h1>
          <p>{todayList.length ? `${doneToday} de ${todayList.length} hoje · ${fmtLong(ref)}` : 'Constância, não perfeição.'}</p>
        </div>
        <button className="btn primary sm" onClick={() => setEditing('new')}>
          <Plus size={16} /> Novo hábito
        </button>
      </div>
      <Tabs
        label="Seções"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'hoje', label: 'Hoje' },
          { value: 'estatisticas', label: 'Estatísticas' },
        ]}
      />

      {habits.length === 0 ? (
        <div className="card">
          <Empty title="Plante um hábito" icon={<Sprout size={34} />} action={<button className="btn primary" onClick={() => setEditing('new')}>Criar hábito</button>}>
            Beber água, ler 20 minutos, caminhar… Comece pequeno. Dias de descanso são permitidos e não quebram sua sequência.
          </Empty>
        </div>
      ) : tab === 'hoje' ? (
        <div className="dash">
          <div className="stack">
            {todayList.length === 0 && <p className="muted small">Nenhum hábito programado para hoje.</p>}
            {todayList.map(row)}
            {notToday.length > 0 && (
              <>
                <div className="group-label">Não programados para hoje</div>
                {notToday.map(row)}
              </>
            )}
            {paused.length > 0 && (
              <>
                <div className="group-label">Pausados</div>
                {paused.map((h) => (
                  <div key={h.id} className="habit-row" style={{ opacity: 0.65 }}>
                    <span className="icon-tile" data-c={h.color}>
                      <Pause size={18} />
                    </span>
                    <div className="grow">
                      <b>{h.name}</b>
                      <div className="tiny faint">Pausado — retome quando fizer sentido.</div>
                    </div>
                    {menu(h)}
                  </div>
                ))}
              </>
            )}
          </div>
          <Card title="Consistência da semana">
            <div className="stack">
              {active.map((h) => (
                <div key={h.id}>
                  <div className="small ellipsis" style={{ marginBottom: 2 }}>
                    {h.name}
                  </div>
                  <div className="week-dots">
                    {week.map((d) => (
                      <span key={d}>
                        {WEEKDAYS_LETTER[parseDate(d).getDay()]}
                        <i className={h.log[d] === 'feito' ? 'on' : ''} style={h.log[d] === 'descanso' ? { background: 'var(--gold-soft)', boxShadow: 'inset 0 0 0 1px var(--gold)' } : !isScheduled(h, d) ? { background: 'transparent', boxShadow: 'inset 0 0 0 1px var(--line)' } : undefined} />
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              <p className="tiny faint">Verde: feito · dourado: descanso · contorno: não programado. Dias sem registro não são "falhas" — a vida acontece.</p>
            </div>
          </Card>
        </div>
      ) : (
        <div className="grid-2">
          {habits.map((h) => {
            const s = habitStats(h, ref, settings.weekStart)
            const weeks = 17
            const start = addDays(startOfWeek(ref, settings.weekStart), -7 * (weeks - 1))
            return (
              <Card key={h.id} title={<h3>{h.name}</h3>} action={<span className="tiny faint">{describeFreq(h)}</span>}>
                <div className="stat-row" style={{ marginBottom: 12 }}>
                  <div className="stat">
                    <b>{s.rate30 == null ? '—' : `${s.rate30}%`}</b>
                    <span>{h.frequency.type === 'vezes_semana' ? 'semanas na meta' : 'últimos 30 dias'}</span>
                  </div>
                  <div className="stat">
                    <b>{s.streak}</b>
                    <span>{h.frequency.type === 'vezes_semana' ? 'semanas seguidas' : 'sequência atual'}</span>
                  </div>
                  <div className="stat">
                    <b>{s.doneTotal}</b>
                    <span>vezes no total</span>
                  </div>
                </div>
                <div className="heatmap" role="grid" aria-label={`Calendário de ${h.name}`}>
                  {Array.from({ length: weeks * 7 }, (_, i) => {
                    const d = addDays(start, i)
                    const future = d > ref
                    const v = h.log[d]
                    return (
                      <i
                        key={d}
                        className={`${v ?? ''}${future ? ' future' : ''}${!v && !isScheduled(h, d) ? ' off' : ''}`}
                        title={`${d.split('-').reverse().join('/')}${v ? ' — ' + v : ''}`}
                        onClick={() => !future && toggleHabit(h, d)}
                        style={{ cursor: future ? 'default' : 'pointer' }}
                      />
                    )
                  })}
                </div>
                <p className="small muted" style={{ marginTop: 10 }}>
                  {encouragement(s.rate30)} {s.best > s.streak && `Melhor sequência: ${s.best}.`}
                </p>
                <p className="tiny faint">Toque em um dia passado para registrar ou corrigir.</p>
              </Card>
            )
          })}
        </div>
      )}
      {editing && <HabitForm habit={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function HabitForm({ habit, onClose }: { habit?: Habit; onClose: () => void }) {
  const settings = useSettings()
  const [h, setH] = useState({
    name: habit?.name ?? '',
    target: habit?.target ?? '',
    color: habit?.color ?? 'salvia',
    frequency: habit?.frequency ?? ({ type: 'diaria' } as HabitFreq),
    reminderTime: habit?.reminderTime ?? '',
    paused: habit?.paused ?? false,
  })
  const [err, setErr] = useState('')
  async function submit() {
    if (!h.name.trim()) return setErr('Dê um nome ao hábito.')
    if (h.frequency.type === 'dias' && !h.frequency.days.length) return setErr('Escolha ao menos um dia da semana.')
    const ok = await attempt(
      () =>
        save('habits', {
          ...(habit ?? { log: {}, order: Date.now() }),
          name: h.name.trim(),
          target: h.target.trim(),
          color: h.color,
          frequency: h.frequency,
          reminderTime: h.reminderTime || undefined,
          paused: h.paused,
        } as Habit),
      habit ? 'Hábito atualizado.' : 'Hábito criado.',
    )
    if (ok) onClose()
  }
  const f = h.frequency
  return (
    <Modal
      title={habit ? 'Editar hábito' : 'Novo hábito'}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={submit}>
            Salvar
          </button>
        </>
      }
    >
      <form className="stack" onSubmit={(e) => (e.preventDefault(), submit())}>
        <Field label="Nome" error={err}>
          <input className="input" autoFocus value={h.name} onChange={(e) => (setH({ ...h, name: e.target.value }), setErr(''))} placeholder="Ex.: Ler" />
        </Field>
        <Field label="Meta (opcional)">
          <input className="input" value={h.target} onChange={(e) => setH({ ...h, target: e.target.value })} placeholder="Ex.: 20 min, 8 copos" />
        </Field>
        <div className="field">
          <span className="label">Frequência</span>
          <Seg
            label="Frequência"
            value={f.type}
            onChange={(t) => setH({ ...h, frequency: t === 'diaria' ? { type: 'diaria' } : t === 'dias' ? { type: 'dias', days: [1, 2, 3, 4, 5] } : { type: 'vezes_semana', times: 3 } })}
            options={[
              { value: 'diaria', label: 'Todo dia' },
              { value: 'dias', label: 'Dias específicos' },
              { value: 'vezes_semana', label: 'X por semana' },
            ]}
          />
          {f.type === 'dias' && <WeekdayPick value={f.days} onChange={(days) => setH({ ...h, frequency: { type: 'dias', days } })} weekStart={settings.weekStart} />}
          {f.type === 'vezes_semana' && (
            <label className="row small">
              <input className="input" type="number" min={1} max={7} style={{ width: 70 }} value={f.times} onChange={(e) => setH({ ...h, frequency: { type: 'vezes_semana', times: Math.max(1, Math.min(7, +e.target.value || 1)) } })} />
              vezes por semana, nos dias que você escolher
            </label>
          )}
        </div>
        <Field label="Lembrete (opcional)" hint="Aviso enquanto o Life OS estiver aberto, se você ainda não registrou o hábito.">
          <input className="input" type="time" value={h.reminderTime} onChange={(e) => setH({ ...h, reminderTime: e.target.value })} style={{ maxWidth: 160 }} />
        </Field>
        <div className="field">
          <span className="label">Cor</span>
          <ColorPick value={h.color} onChange={(color) => setH({ ...h, color })} />
        </div>
        {habit && <Switch checked={h.paused} onChange={(paused) => setH({ ...h, paused })} label="Pausado" />}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
