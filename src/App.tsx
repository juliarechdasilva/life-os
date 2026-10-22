import { useEffect } from 'react'
import { BottomNav, EditorHost, MorePage, Sidebar, Topbar } from './components/shell'
import { ConfirmHost, Leaf, Toasts } from './components/ui'
import { startReminders } from './lib/reminders'
import { startCloud } from './lib/cloud'
import { useApp } from './lib/store'
import { setTimeFormat } from './lib/dates'
import { openEditor, useRoute } from './lib/ui'
import Agenda from './pages/Agenda'
import Assistant from './pages/Assistant'
import Dashboard from './pages/Dashboard'
import Finance from './pages/Finance'
import Goals from './pages/Goals'
import Habits from './pages/Habits'
import Journal from './pages/Journal'
import Onboarding from './pages/Onboarding'
import Reorganize from './pages/Reorganize'
import SettingsPage from './pages/Settings'
import Studies, { TimerWatcher } from './pages/Studies'
import Tasks from './pages/Tasks'

function useTheme(theme: 'sistema' | 'claro' | 'escuro') {
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'sistema') delete root.dataset.theme
    else root.dataset.theme = theme === 'escuro' ? 'dark' : 'light'
    const dark = theme === 'escuro' || (theme === 'sistema' && matchMedia('(prefers-color-scheme: dark)').matches)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1b1c19' : '#f4f0e8')
  }, [theme])
}

function SearchRoute() {
  useEffect(() => openEditor({ type: 'search' }), [])
  return <Dashboard />
}

export default function App() {
  const app = useApp()
  const { page } = useRoute()
  useTheme(app.settings.theme)
  setTimeFormat(app.settings.timeFormat)
  useEffect(() => {
    if (app.status === 'ready') {
      startReminders()
      startCloud()
    }
  }, [app.status])
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [page])

  if (app.status === 'loading')
    return (
      <div className="loading-screen" aria-busy="true" aria-label="Carregando o Life OS">
        <Leaf size={56} />
      </div>
    )
  if (app.status === 'error')
    return (
      <div className="welcome">
        <div className="welcome-card">
          <div className="logo">
            <Leaf size={40} /> Life OS
          </div>
          <div className="callout danger" role="alert">
            Não foi possível abrir o armazenamento local deste navegador: {app.error}
          </div>
          <p className="muted small">
            Isso costuma acontecer em janelas anônimas de alguns navegadores ou quando o armazenamento de sites está bloqueado. Tente abrir em uma janela normal ou
            liberar o armazenamento para este site. Seus dados não foram apagados.
          </p>
          <button className="btn primary" onClick={() => location.reload()}>
            Tentar novamente
          </button>
        </div>
      </div>
    )
  if (!app.settings.onboarded)
    return (
      <>
        <Onboarding />
        <Toasts />
        <ConfirmHost />
      </>
    )

  const Page = {
    inicio: Dashboard,
    agenda: Agenda,
    tarefas: Tasks,
    assistente: Assistant,
    reorganizar: Reorganize,
    estudos: Studies,
    objetivos: Goals,
    habitos: Habits,
    financas: Finance,
    diario: Journal,
    busca: SearchRoute,
    configuracoes: SettingsPage,
    mais: MorePage,
  }[page]

  return (
    <div className="app">
      <a href="#conteudo" className="sr-only">
        Pular para o conteúdo
      </a>
      <Sidebar />
      <div className="main">
        <Topbar />
        <main id="conteudo" key={page}>
          <Page />
        </main>
      </div>
      <BottomNav />
      <EditorHost />
      <TimerWatcher />
      <ConfirmHost />
      <Toasts />
    </div>
  )
}
