import {
  Bell,
  BookOpen,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Home,
  ListPlus,
  Menu as MenuIcon,
  Moon,
  NotebookPen,
  Plus,
  Repeat,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Sprout,
  Sun,
  Target,
  Wallet,
  Wand2,
  AlarmClock,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { addDays, today } from '../lib/dates'
import { GROUP_ORDER, searchAll } from '../lib/search'
import { saveSettings, useData, useSettings } from '../lib/store'
import { isOverdue } from '../lib/tasks'
import {
  attempt,
  clearReminders,
  closeEditor,
  markRemindersRead,
  navigate,
  openEditor,
  useEditor,
  useJournalUnlocked,
  useReminders,
  useRoute,
  type Page,
} from '../lib/ui'
import { EventForm, GoalForm, TaskForm, TransactionForm } from './forms'
import { Leaf, Modal } from './ui'

export const NAV: { page: Page; label: string; icon: ReactNode; section?: string }[] = [
  { page: 'inicio', label: 'Início', icon: <Home size={18} /> },
  { page: 'agenda', label: 'Agenda', icon: <CalendarDays size={18} /> },
  { page: 'tarefas', label: 'Tarefas', icon: <CheckCircle2 size={18} /> },
  { page: 'assistente', label: 'Life OS AI', icon: <Sparkles size={18} />, section: 'Inteligência' },
  { page: 'reorganizar', label: 'Reorganizar minha vida', icon: <Wand2 size={18} /> },
  { page: 'objetivos', label: 'Projetos e objetivos', icon: <Target size={18} />, section: 'Vida' },
  { page: 'estudos', label: 'Estudos', icon: <BookOpen size={18} /> },
  { page: 'habitos', label: 'Hábitos', icon: <Sprout size={18} /> },
  { page: 'financas', label: 'Finanças', icon: <Wallet size={18} /> },
  { page: 'diario', label: 'Diário e memórias', icon: <NotebookPen size={18} /> },
]

export function Sidebar() {
  const { page } = useRoute()
  const data = useData()
  const ref = today()
  const counts: Partial<Record<Page, number>> = {
    tarefas: data.tasks.filter((t) => t.status !== 'concluida' && ((t.dueDate && t.dueDate <= ref) || t.plannedDate === ref)).length,
  }
  return (
    <aside className="sidebar" aria-label="Navegação principal">
      <a className="brand" href="#/inicio">
        <Leaf size={30} /> Life OS
      </a>
      <nav className="nav-list">
        {NAV.map((n) => (
          <div key={n.page}>
            {n.section && <div className="nav-section">{n.section}</div>}
            <button className="nav-item" aria-current={page === n.page ? 'page' : undefined} onClick={() => navigate(n.page)}>
              {n.icon}
              {n.label}
              {counts[n.page] ? <span className="count">{counts[n.page]}</span> : null}
            </button>
          </div>
        ))}
        <div className="nav-section">Sistema</div>
        <button className="nav-item" onClick={() => openEditor({ type: 'search' })}>
          <Search size={18} /> Buscar
        </button>
        <button className="nav-item" aria-current={page === 'configuracoes' ? 'page' : undefined} onClick={() => navigate('configuracoes')}>
          <SettingsIcon size={18} /> Configurações
        </button>
      </nav>
      <div className="foot">Planeje. Conquiste. Viva.</div>
    </aside>
  )
}

const TITLES: Record<Page, string> = {
  inicio: 'Início',
  agenda: 'Agenda',
  tarefas: 'Tarefas',
  assistente: 'Life OS AI',
  reorganizar: 'Reorganizar',
  estudos: 'Estudos',
  objetivos: 'Objetivos',
  habitos: 'Hábitos',
  financas: 'Finanças',
  diario: 'Diário',
  busca: 'Buscar',
  configuracoes: 'Configurações',
  mais: 'Mais',
}

export function Topbar() {
  const { page } = useRoute()
  const settings = useSettings()
  const dark = settings.theme === 'escuro' || (settings.theme === 'sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  return (
    <header className="topbar">
      <span className="mobile-only" style={{ color: 'var(--sage)' }}>
        <Leaf size={24} />
      </span>
      <span className="topbar-title" aria-label={TITLES[page]}>Life OS</span>
      <button className="searchbox" onClick={() => openEditor({ type: 'search' })} aria-label="Buscar no Life OS">
        <Search size={16} /> Buscar no Life OS… <kbd>{navigator.platform?.includes('Mac') ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      <span className="grow" />
      <button className="icon-btn mobile-only" aria-label="Buscar" onClick={() => openEditor({ type: 'search' })}>
        <Search size={19} />
      </button>
      <button
        className="icon-btn"
        aria-label={dark ? 'Usar tema claro' : 'Usar tema escuro'}
        title={dark ? 'Tema claro' : 'Tema escuro'}
        onClick={() => attempt(() => saveSettings({ theme: dark ? 'claro' : 'escuro' }))}
      >
        {dark ? <Sun size={19} /> : <Moon size={19} />}
      </button>
      <NotificationsButton />
      <button className="btn primary sm desktop-only" onClick={() => openEditor({ type: 'quickadd' })}>
        <Plus size={16} /> Adicionar
      </button>
    </header>
  )
}

function NotificationsButton() {
  const list = useReminders()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const unread = list.filter((r) => !r.read).length
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div className="menu" ref={ref}>
      <button
        className="icon-btn"
        aria-label={`Lembretes${unread ? ` (${unread} novos)` : ''}`}
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o)
          markRemindersRead()
        }}
      >
        <Bell size={19} />
        {unread > 0 && <span className="dot" />}
      </button>
      {open && (
        <div className="notif-panel card" role="dialog" aria-label="Lembretes">
          <div className="card-head">
            <h3>Lembretes</h3>
            {list.length > 0 && (
              <button className="link small" onClick={clearReminders}>
                Limpar
              </button>
            )}
          </div>
          {list.length === 0 ? (
            <p className="muted small">
              Nenhum lembrete nesta sessão. Os lembretes aparecem aqui enquanto o Life OS estiver aberto. Ative notificações do navegador em Configurações.
            </p>
          ) : (
            <div className="list">
              {list.map((r) => (
                <button
                  key={r.key}
                  className="list-item clickable"
                  style={{ border: 0, background: 'none', textAlign: 'left', width: '100%' }}
                  onClick={() => {
                    setOpen(false)
                    navigate(r.route)
                  }}
                >
                  <AlarmClock size={16} className="faint" />
                  <span className="grow">
                    <b className="small">{r.title}</b>
                    <div className="tiny muted">{r.body}</div>
                  </span>
                  <span className="tiny faint">{new Date(r.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function BottomNav() {
  const { page } = useRoute()
  const main: Page[] = ['inicio', 'agenda']
  const isMore = !['inicio', 'agenda', 'busca'].includes(page)
  return (
    <nav className="bottomnav" aria-label="Navegação">
      {main.map((p) => (
        <button key={p} aria-current={page === p ? 'page' : undefined} onClick={() => navigate(p)}>
          {p === 'inicio' ? <Home size={21} /> : <CalendarDays size={21} />}
          {p === 'inicio' ? 'Início' : 'Agenda'}
        </button>
      ))}
      <button onClick={() => openEditor({ type: 'quickadd' })} aria-label="Adicionar">
        <span className="fab">
          <Plus size={24} />
        </span>
        Adicionar
      </button>
      <button onClick={() => openEditor({ type: 'search' })}>
        <Search size={21} />
        Buscar
      </button>
      <button aria-current={isMore ? 'page' : undefined} onClick={() => navigate('mais')}>
        <MenuIcon size={21} />
        Mais
      </button>
    </nav>
  )
}

export function MorePage() {
  return (
    <div className="page">
      <div className="page-head">
        <h1>Tudo no Life OS</h1>
      </div>
      <div className="more-grid">
        {[...NAV, { page: 'configuracoes' as Page, label: 'Configurações', icon: <SettingsIcon size={18} /> }].map((n) => (
          <button key={n.page} onClick={() => navigate(n.page)}>
            {n.icon}
            {n.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function QuickAdd() {
  const items = [
    { label: 'Tarefa', desc: 'Algo para fazer', icon: <ListPlus size={20} />, run: () => openEditor({ type: 'task' }) },
    { label: 'Evento', desc: 'Compromisso com horário', icon: <CalendarPlus size={20} />, run: () => openEditor({ type: 'event' }) },
    { label: 'Lembrete', desc: 'Tarefa com hora para avisar', icon: <AlarmClock size={20} />, run: () => openEditor({ type: 'task', preset: { tags: ['lembrete'], dueDate: today() } }) },
    { label: 'Meta', desc: 'Objetivo ou projeto', icon: <Target size={20} />, run: () => openEditor({ type: 'goal' }) },
    { label: 'Movimentação', desc: 'Receita ou despesa', icon: <Wallet size={20} />, run: () => openEditor({ type: 'transaction' }) },
    { label: 'Diário', desc: 'Escrever sobre o dia', icon: <NotebookPen size={20} />, run: () => (closeEditor(), navigate('diario?nova=1')) },
    { label: 'Hábito', desc: 'Algo para repetir', icon: <Repeat size={20} />, run: () => (closeEditor(), navigate('habitos?novo=1')) },
    { label: 'Pedir ao assistente', desc: 'Escreva do seu jeito', icon: <Sparkles size={20} />, run: () => (closeEditor(), navigate('assistente')) },
  ]
  return (
    <Modal title="Adicionar" onClose={closeEditor}>
      <div className="list">
        {items.map((i) => (
          <button key={i.label} className="list-item clickable" style={{ border: 0, borderBottom: '1px solid var(--line)', background: 'none', width: '100%', textAlign: 'left' }} onClick={i.run}>
            <span className="icon-tile">{i.icon}</span>
            <span className="grow">
              <b>{i.label}</b>
              <div className="small muted">{i.desc}</div>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  )
}

export function SearchPalette({ onClose }: { onClose: () => void }) {
  const data = useData()
  const unlocked = useJournalUnlocked()
  const settings = useSettings()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const journalHidden = settings.journalLock.enabled && !unlocked
  const hits = useMemo(() => searchAll(data, q, { includeJournal: !journalHidden }), [data, q, journalHidden])
  const grouped = useMemo(() => {
    const g = new Map<string, typeof hits>()
    for (const h of hits) g.set(h.group, [...(g.get(h.group) ?? []), h])
    return GROUP_ORDER.filter((k) => g.has(k)).map((k) => [k, g.get(k)!] as const)
  }, [hits])
  const flat = grouped.flatMap(([, l]) => l.slice(0, 8))
  useEffect(() => {
    inputRef.current?.focus()
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onClose])
  useEffect(() => setSel(0), [q])
  const go = (route: string) => {
    onClose()
    navigate(route)
  }
  const ref = today()
  const overdue = data.tasks.filter((t) => isOverdue(t, ref)).length
  let idx = -1
  return (
    <div className="overlay search-modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="search-panel" role="dialog" aria-modal="true" aria-label="Busca global">
        <div className="q">
          <Search size={20} className="faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar tarefas, eventos, diário, finanças…"
            aria-label="Buscar"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => Math.min(flat.length - 1, s + 1)))
              if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(0, s - 1)))
              if (e.key === 'Enter' && flat[sel]) go(flat[sel].route)
            }}
          />
          <button className="icon-btn sm" onClick={onClose} aria-label="Fechar busca">
            <X size={18} />
          </button>
        </div>
        <div className="search-results">
          {q.trim().length < 2 ? (
            <div className="stack" style={{ padding: 8 }}>
              <p className="small muted">Digite ao menos 2 letras. Atalhos:</p>
              <div className="chips" style={{ flexWrap: 'wrap' }}>
                <button className="chip" onClick={() => go('tarefas?filtro=hoje')}>Tarefas de hoje</button>
                {overdue > 0 && <button className="chip" onClick={() => go('tarefas?filtro=atrasadas')}>Atrasadas ({overdue})</button>}
                <button className="chip" onClick={() => go(`agenda?data=${addDays(ref, 1)}`)}>Agenda de amanhã</button>
                <button className="chip" onClick={() => go('reorganizar')}>Reorganizar minha vida</button>
                <button className="chip" onClick={() => go('assistente')}>Life OS AI</button>
              </div>
              {journalHidden && <p className="tiny faint">O diário está bloqueado e não aparece na busca até ser desbloqueado.</p>}
            </div>
          ) : grouped.length === 0 ? (
            <div className="empty compact">
              <h3>Nada encontrado</h3>
              <p>Nenhum resultado para "{q}". Tente outra palavra.</p>
            </div>
          ) : (
            grouped.map(([group, list]) => (
              <div key={group}>
                <div className="group-label">
                  {group} <span className="faint">{list.length}</span>
                </div>
                {list.slice(0, 8).map((h) => {
                  idx++
                  const i = idx
                  return (
                    <button key={h.group + h.id} className="result" aria-selected={sel === i} onMouseEnter={() => setSel(i)} onClick={() => go(h.route)}>
                      <span className="grow">
                        <div className="ellipsis">{h.title}</div>
                        <div className="tiny faint">{h.subtitle}</div>
                      </span>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export function EditorHost() {
  const ed = useEditor()
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openEditor({ type: 'search' })
      }
    }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [])
  if (!ed) return null
  switch (ed.type) {
    case 'task':
      return <TaskForm key={ed.id ?? 'new'} id={ed.id} preset={ed.preset} />
    case 'event':
      return <EventForm key={ed.id ?? 'new'} id={ed.id} date={ed.date} preset={ed.preset} />
    case 'goal':
      return <GoalForm key={ed.id ?? 'new'} id={ed.id} />
    case 'transaction':
      return <TransactionForm key={ed.id ?? 'new'} id={ed.id} preset={ed.preset} />
    case 'quickadd':
      return <QuickAdd />
    case 'search':
      return <SearchPalette onClose={closeEditor} />
    default:
      return null
  }
}
