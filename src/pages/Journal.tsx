import { Camera, Download, History as HistoryIcon, Image as ImageIcon, Lock, MapPin, Paperclip, Plus, Search, Star, Trash2, Unlock, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, Empty, Field, Modal, Tabs, TagInput } from '../components/ui'
import { download, journalToMarkdown } from '../lib/backup'
import { deleteFile } from '../lib/db'
import { getAttachment, lock, putAttachment, unlock } from '../lib/vault'
import { addDays, addMonths, fmtLong, fmtRelative, today } from '../lib/dates'
import { norm } from '../lib/nlp'
import { remove, save, uid, useData, useSettings } from '../lib/store'
import type { Attachment, JournalEntry, MemoryItem } from '../lib/types'
import { attempt, confirm, navigate, toast, useJournalUnlocked, useRoute } from '../lib/ui'

const MAX_FILE = 8 * 1024 * 1024
const MOODS = ['😞', '😕', '😐', '🙂', '😄']
const MEMORY_KIND: Record<MemoryItem['kind'], string> = { momento: 'Momento', viagem: 'Viagem', conquista: 'Conquista', experiencia: 'Experiência' }

export default function Journal() {
  const settings = useSettings()
  const unlocked = useJournalUnlocked()
  if (settings.journalLock.enabled && !unlocked) return <LockScreen />
  return <JournalInner />
}

function LockScreen() {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!pw) return
    setBusy(true)
    const ok = await unlock(pw).catch(() => false)
    setBusy(false)
    if (!ok) {
      setErr('Senha incorreta.')
      setPw('')
    }
  }
  return (
    <div className="page" style={{ maxWidth: 380, textAlign: 'center', paddingTop: 30 }}>
      <Lock size={32} style={{ color: 'var(--sage)' }} />
      <h1 style={{ marginTop: 10 }}>Diário protegido</h1>
      <p className="muted small" style={{ margin: '6px 0 18px' }}>Seu diário e suas memórias estão criptografados neste aparelho. Digite sua senha para abrir.</p>
      <form className="stack" onSubmit={submit}>
        <input className="input" type="password" autoFocus autoComplete="current-password" value={pw} onChange={(e) => (setPw(e.target.value), setErr(''))} placeholder="Senha do diário" aria-label="Senha do diário" />
        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn primary" type="submit" disabled={busy || !pw}>
          <Unlock size={17} /> {busy ? 'Abrindo…' : 'Desbloquear'}
        </button>
      </form>
      <p className="tiny faint" style={{ marginTop: 20 }}>A senha não fica guardada em lugar nenhum. Se você esquecê-la, não há como recuperar o diário — nem pelo backup.</p>
    </div>
  )
}

function useObjectUrl(id: string | undefined, type = 'application/octet-stream') {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let u: string | null = null
    let alive = true
    if (id)
      getAttachment(id, type)
        .then((b) => {
          if (b && alive) {
            u = URL.createObjectURL(b)
            setUrl(u)
          }
        })
        .catch(() => {})
    return () => {
      alive = false
      if (u) URL.revokeObjectURL(u)
    }
  }, [id])
  return url
}

function Thumb({ a, onRemove }: { a: Attachment; onRemove?: () => void }) {
  const url = useObjectUrl(a.id, a.type)
  return (
    <div className="thumb" title={a.name}>
      {onRemove && (
        <button className="rm" onClick={onRemove} aria-label={`Remover ${a.name}`}>
          <X size={12} />
        </button>
      )}
      {url && a.type.startsWith('image/') ? (
        <img src={url} alt={a.name} />
      ) : url ? (
        <a href={url} download={a.name} className="small">
          <Paperclip size={14} /> {a.name}
        </a>
      ) : (
        <span className="tiny faint">{a.name}</span>
      )}
    </div>
  )
}

function JournalInner() {
  const data = useData()
  const settings = useSettings()
  const { params } = useRoute()
  const [tab, setTab] = useState<'entradas' | 'memorias'>(params.get('memoria') ? 'memorias' : 'entradas')
  const [q, setQ] = useState('')
  const [period, setPeriod] = useState<'tudo' | '7' | '30' | '365' | 'importantes'>('tudo')
  const [editing, setEditing] = useState<JournalEntry | 'new' | null>(null)
  const [editingMem, setEditingMem] = useState<MemoryItem | 'new' | null>(null)
  const ref = today()

  useEffect(() => {
    const id = params.get('id')
    const mid = params.get('memoria')
    if (params.get('nova')) setEditing('new')
    if (id) {
      const e = data.journal.find((x) => x.id === id)
      if (e) setEditing(e)
    }
    if (mid) {
      const m = data.memories.find((x) => x.id === mid)
      if (m) setEditingMem(m)
    }
    if (id || mid || params.get('nova')) navigate('diario')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const entries = useMemo(() => {
    let l = [...data.journal].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    if (period === 'importantes') l = l.filter((e) => e.important)
    else if (period !== 'tudo') l = l.filter((e) => e.date >= addDays(ref, -+period))
    if (q.trim()) l = l.filter((e) => norm([e.title, e.text, e.tags.join(' ')].join(' ')).includes(norm(q)))
    return l
  }, [data.journal, period, q, ref])

  // Retrospectiva: "neste dia" em meses/anos anteriores
  const onThisDay = data.journal.filter((e) => e.date !== ref && (e.date.slice(5) === ref.slice(5) || e.date === addMonths(ref, -1) || e.date === addDays(ref, -7)))

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Diário</h1>
          <p>Um espaço privado. Nada é compartilhado.</p>
        </div>
        <div className="row">
          {settings.journalLock.enabled && (
            <button className="btn sm ghost" onClick={() => lock()}>
              <Lock size={15} /> Bloquear
            </button>
          )}
          <button className="btn primary sm" onClick={() => (tab === 'entradas' ? setEditing('new') : setEditingMem('new'))}>
            <Plus size={16} /> {tab === 'entradas' ? 'Nova entrada' : 'Nova memória'}
          </button>
        </div>
      </div>
      <Tabs
        label="Seções do diário"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'entradas', label: `Entradas (${data.journal.length})` },
          { value: 'memorias', label: `Memórias (${data.memories.length})` },
        ]}
      />
      {tab === 'entradas' ? (
        <div className="dash">
          <div className="stack">
            <div className="row wrap">
              <label className="searchbox" style={{ minWidth: 0, flex: '1 1 200px', display: 'flex' }}>
                <Search size={15} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar no diário" style={{ border: 0, background: 'none', minWidth: 0, flex: 1 }} aria-label="Pesquisar no diário" />
              </label>
              <select className="select" style={{ width: 'auto' }} value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} aria-label="Período">
                <option value="tudo">Todo o período</option>
                <option value="7">Últimos 7 dias</option>
                <option value="30">Últimos 30 dias</option>
                <option value="365">Último ano</option>
                <option value="importantes">Só importantes ⭐</option>
              </select>
            </div>
            {entries.length === 0 ? (
              <div className="card">
                <Empty title={data.journal.length ? 'Nada encontrado' : 'Como foi seu dia?'} icon={<HistoryIcon size={32} />} action={!data.journal.length && <button className="btn primary" onClick={() => setEditing('new')}>Escrever a primeira entrada</button>}>
                  {data.journal.length ? 'Tente outra palavra ou período.' : 'Escreva livremente — sobre o dia, uma ideia, algo que você quer lembrar.'}
                </Empty>
              </div>
            ) : (
              entries.map((e) => (
                <button key={e.id} className="card entry-card" onClick={() => setEditing(e)}>
                  <div className="row between small">
                    <b>{fmtLong(e.date, e.date.slice(0, 4) !== ref.slice(0, 4))}</b>
                    <span className="row" style={{ gap: 6 }}>
                      {e.mood && <span aria-label={`Humor ${e.mood} de 5`}>{MOODS[e.mood - 1]}</span>}
                      {e.important && <Star size={14} fill="var(--gold)" color="var(--gold)" aria-label="Importante" />}
                      {e.attachments.length > 0 && <Paperclip size={13} className="faint" aria-label="Com anexos" />}
                    </span>
                  </div>
                  {e.title && <div style={{ fontWeight: 600, marginTop: 4 }}>{e.title}</div>}
                  <div className="excerpt">{e.text || <span className="faint">(sem texto)</span>}</div>
                  {e.tags.length > 0 && (
                    <div className="row wrap" style={{ marginTop: 8, gap: 5 }}>
                      {e.tags.map((t) => (
                        <span key={t} className="tag">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
          <div className="grid">
            <Card title="Retrospectiva">
              {onThisDay.length === 0 ? (
                <p className="small muted">Aqui aparecem entradas de uma semana, um mês e um ano atrás. Continue escrevendo — um dia você vai gostar de reler.</p>
              ) : (
                <div className="list">
                  {onThisDay.map((e) => (
                    <button key={e.id} className="list-item clickable" style={{ border: 0, borderBottom: '1px solid var(--line)', background: 'none', width: '100%', textAlign: 'left' }} onClick={() => setEditing(e)}>
                      <span className="grow">
                        <div className="tiny faint">{fmtRelative(e.date, ref)} · {e.date.split('-').reverse().join('/')}</div>
                        <div className="small ellipsis">{e.title || e.text.slice(0, 80)}</div>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
            <Card title="Exportar">
              <p className="small muted" style={{ marginBottom: 10 }}>Baixe uma cópia do diário. O arquivo fica no seu aparelho — guarde em local seguro.</p>
              <div className="row wrap">
                <button className="btn sm" disabled={!data.journal.length} onClick={() => download(`diario-life-os-${ref}.md`, journalToMarkdown(data.journal), 'text/markdown')}>
                  <Download size={15} /> Texto (.md)
                </button>
                <button className="btn sm" disabled={!data.journal.length && !data.memories.length} onClick={() => download(`diario-life-os-${ref}.json`, JSON.stringify({ app: 'life-os', tipo: 'diario', exportadoEm: new Date().toISOString(), entradas: data.journal, memorias: data.memories }, null, 2))}>
                  <Download size={15} /> Dados (.json)
                </button>
              </div>
              <p className="tiny faint" style={{ marginTop: 8 }}>Anexos (fotos) vão no backup completo, em Configurações.</p>
            </Card>
          </div>
        </div>
      ) : (
        <Memories onOpen={setEditingMem} />
      )}
      {editing && <EntryForm entry={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {editingMem && <MemoryForm memory={editingMem === 'new' ? undefined : editingMem} onClose={() => setEditingMem(null)} />}
    </div>
  )
}

function Memories({ onOpen }: { onOpen: (m: MemoryItem | 'new') => void }) {
  const data = useData()
  const list = [...data.memories].sort((a, b) => b.date.localeCompare(a.date))
  if (!list.length)
    return (
      <div className="card">
        <Empty title="Guarde seus momentos" icon={<Camera size={32} />} action={<button className="btn primary" onClick={() => onOpen('new')}>Registrar memória</button>}>
          Viagens, conquistas, experiências e acontecimentos que você quer lembrar — com fotos, se quiser.
        </Empty>
      </div>
    )
  return (
    <div className="grid-3">
      {list.map((m) => (
        <button key={m.id} className="card entry-card" onClick={() => onOpen(m)}>
          {m.attachments.find((a) => a.type.startsWith('image/')) && <Cover a={m.attachments.find((a) => a.type.startsWith('image/'))!} />}
          <div className="tiny faint">
            {MEMORY_KIND[m.kind]} · {m.date.split('-').reverse().join('/')}
          </div>
          <b className="serif" style={{ fontSize: 19, fontWeight: 500 }}>{m.title}</b>
          {m.place && (
            <div className="tiny muted row" style={{ gap: 4 }}>
              <MapPin size={12} /> {m.place}
            </div>
          )}
          {m.text && <div className="excerpt" style={{ fontSize: 15 }}>{m.text}</div>}
        </button>
      ))}
    </div>
  )
}

function Cover({ a }: { a: Attachment }) {
  const url = useObjectUrl(a.id, a.type)
  return url ? <img src={url} alt="" style={{ width: '100%', height: 150, objectFit: 'cover', borderRadius: 12, marginBottom: 10 }} /> : null
}

function useAttachments(initial: Attachment[]) {
  const [list, setList] = useState(initial)
  const added = useRef<string[]>([])
  const removed = useRef<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  async function add(files: FileList | null) {
    if (!files) return
    for (const f of Array.from(files)) {
      if (f.size > MAX_FILE) {
        toast(`"${f.name}" passa de 8 MB e não foi anexado.`, 'erro')
        continue
      }
      const id = uid('f')
      const ok = await attempt(() => putAttachment(id, f).then(() => true))
      if (ok) {
        added.current.push(id)
        setList((l) => [...l, { id, name: f.name, type: f.type || 'application/octet-stream', size: f.size }])
      }
    }
  }
  const rm = (id: string) => {
    removed.current.push(id)
    setList((l) => l.filter((a) => a.id !== id))
  }
  /** Ao cancelar: apaga arquivos adicionados agora. Ao salvar: apaga os removidos. */
  const cleanup = async (saved: boolean) => {
    const ids = saved ? removed.current : added.current
    for (const id of ids) await deleteFile(id).catch(() => {})
  }
  const picker = (
    <>
      <input ref={inputRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => (add(e.target.files), (e.target.value = ''))} />
      <button type="button" className="btn sm" onClick={() => inputRef.current?.click()}>
        <ImageIcon size={15} /> Anexar foto ou PDF
      </button>
    </>
  )
  return { list, rm, cleanup, picker }
}

function EntryForm({ entry, onClose }: { entry?: JournalEntry; onClose: () => void }) {
  const [e, setE] = useState({ date: entry?.date ?? today(), title: entry?.title ?? '', text: entry?.text ?? '', tags: entry?.tags ?? [], important: entry?.important ?? false, mood: entry?.mood })
  const att = useAttachments(entry?.attachments ?? [])
  const close = async () => {
    await att.cleanup(false)
    onClose()
  }
  async function submit() {
    if (!e.text.trim() && !e.title.trim() && !att.list.length) return toast('Escreva algo antes de salvar.', 'erro')
    const ok = await attempt(() => save('journal', { ...(entry ?? {}), ...e, attachments: att.list } as JournalEntry), entry ? 'Entrada atualizada.' : 'Entrada salva.')
    if (ok) {
      await att.cleanup(true)
      onClose()
    }
  }
  async function del() {
    if (!entry) return
    if (!(await confirm({ title: 'Excluir entrada?', body: 'O texto e os anexos serão apagados permanentemente.', confirmLabel: 'Excluir', danger: true }))) return
    const ok = await attempt(async () => {
      await remove('journal', entry.id)
      for (const a of entry.attachments) await deleteFile(a.id).catch(() => {})
      return true
    }, 'Entrada excluída.')
    if (ok) onClose()
  }
  return (
    <Modal
      wide
      title={entry ? 'Entrada do diário' : 'Nova entrada'}
      onClose={close}
      footer={
        <>
          {entry && (
            <button className="btn danger left" onClick={del}>
              <Trash2 size={15} /> Excluir
            </button>
          )}
          <button className="btn ghost" onClick={close}>
            Cancelar
          </button>
          <button className="btn primary" onClick={submit}>
            Salvar
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="row wrap between">
          <input className="input" type="date" value={e.date} onChange={(x) => setE({ ...e, date: x.target.value })} style={{ maxWidth: 170 }} aria-label="Data" />
          <div className="row" role="group" aria-label="Humor">
            {MOODS.map((m, i) => (
              <button key={i} type="button" className="icon-btn sm" aria-pressed={e.mood === i + 1} aria-label={`Humor ${i + 1} de 5`} onClick={() => setE({ ...e, mood: e.mood === i + 1 ? undefined : ((i + 1) as JournalEntry['mood']) })} style={{ fontSize: 18, opacity: e.mood && e.mood !== i + 1 ? 0.35 : 1 }}>
                {m}
              </button>
            ))}
            <button type="button" className="icon-btn sm" aria-pressed={e.important} aria-label="Marcar como acontecimento importante" title="Acontecimento importante" onClick={() => setE({ ...e, important: !e.important })}>
              <Star size={17} fill={e.important ? 'var(--gold)' : 'none'} color={e.important ? 'var(--gold)' : 'currentColor'} />
            </button>
          </div>
        </div>
        <input className="input title-input" value={e.title} onChange={(x) => setE({ ...e, title: x.target.value })} placeholder="Título (opcional)" aria-label="Título" />
        <textarea className="textarea journal-text" autoFocus value={e.text} onChange={(x) => setE({ ...e, text: x.target.value })} placeholder="Escreva livremente…" aria-label="Texto" />
        <Field label="Tags" hint="Separe por vírgulas.">
          <TagInput value={e.tags} onChange={(tags) => setE({ ...e, tags })} />
        </Field>
        <div className="thumbs">
          {att.list.map((a) => (
            <Thumb key={a.id} a={a} onRemove={() => att.rm(a.id)} />
          ))}
        </div>
        <div>{att.picker}</div>
      </div>
    </Modal>
  )
}

function MemoryForm({ memory, onClose }: { memory?: MemoryItem; onClose: () => void }) {
  const [m, setM] = useState({ date: memory?.date ?? today(), title: memory?.title ?? '', text: memory?.text ?? '', kind: memory?.kind ?? ('momento' as MemoryItem['kind']), place: memory?.place ?? '' })
  const [err, setErr] = useState('')
  const att = useAttachments(memory?.attachments ?? [])
  const close = async () => {
    await att.cleanup(false)
    onClose()
  }
  async function submit() {
    if (!m.title.trim()) return setErr('Dê um título à memória.')
    const ok = await attempt(() => save('memories', { ...(memory ?? {}), ...m, title: m.title.trim(), attachments: att.list } as MemoryItem), memory ? 'Memória atualizada.' : 'Memória guardada.')
    if (ok) {
      await att.cleanup(true)
      onClose()
    }
  }
  async function del() {
    if (!memory) return
    if (!(await confirm({ title: 'Excluir memória?', body: 'O texto e as fotos serão apagados permanentemente.', confirmLabel: 'Excluir', danger: true }))) return
    const ok = await attempt(async () => {
      await remove('memories', memory.id)
      for (const a of memory.attachments) await deleteFile(a.id).catch(() => {})
      return true
    }, 'Memória excluída.')
    if (ok) onClose()
  }
  return (
    <Modal
      wide
      title={memory ? 'Memória' : 'Nova memória'}
      onClose={close}
      footer={
        <>
          {memory && (
            <button className="btn danger left" onClick={del}>
              <Trash2 size={15} /> Excluir
            </button>
          )}
          <button className="btn ghost" onClick={close}>
            Cancelar
          </button>
          <button className="btn primary" onClick={submit}>
            Salvar
          </button>
        </>
      }
    >
      <form className="form-grid" onSubmit={(e) => (e.preventDefault(), submit())}>
        <Field label="Título" className="full" error={err}>
          <input className="input" autoFocus value={m.title} onChange={(e) => (setM({ ...m, title: e.target.value }), setErr(''))} placeholder="Ex.: Viagem inesquecível para Gramado" />
        </Field>
        <Field label="Tipo">
          <select className="select" value={m.kind} onChange={(e) => setM({ ...m, kind: e.target.value as MemoryItem['kind'] })}>
            {Object.entries(MEMORY_KIND).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Data">
          <input className="input" type="date" value={m.date} onChange={(e) => setM({ ...m, date: e.target.value })} />
        </Field>
        <Field label="Lugar (opcional)" className="full">
          <input className="input" value={m.place} onChange={(e) => setM({ ...m, place: e.target.value })} />
        </Field>
        <Field label="O que aconteceu" className="full">
          <textarea className="textarea journal-text" style={{ minHeight: 140 }} value={m.text} onChange={(e) => setM({ ...m, text: e.target.value })} />
        </Field>
        <div className="full stack-sm">
          <div className="thumbs">
            {att.list.map((a) => (
              <Thumb key={a.id} a={a} onRemove={() => att.rm(a.id)} />
            ))}
          </div>
          <div>{att.picker}</div>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
