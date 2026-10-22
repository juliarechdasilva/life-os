// Estado de interface (não persistido): rotas, avisos, confirmações, painéis.
import { useSyncExternalStore } from 'react'

function createStore<T>(initial: T) {
  let value = initial
  const ls = new Set<() => void>()
  return {
    get: () => value,
    set: (v: T | ((p: T) => T)) => {
      value = typeof v === 'function' ? (v as (p: T) => T)(value) : v
      ls.forEach((l) => l())
    },
    sub: (l: () => void) => {
      ls.add(l)
      return () => {
        ls.delete(l)
      }
    },
  }
}

function useStore<T>(s: ReturnType<typeof createStore<T>>): T {
  return useSyncExternalStore(s.sub, s.get, s.get)
}

// ---------- Rotas (hash) ----------

export type Page =
  | 'inicio'
  | 'agenda'
  | 'tarefas'
  | 'assistente'
  | 'reorganizar'
  | 'estudos'
  | 'objetivos'
  | 'habitos'
  | 'financas'
  | 'diario'
  | 'busca'
  | 'configuracoes'
  | 'mais'

const PAGES: Page[] = ['inicio', 'agenda', 'tarefas', 'assistente', 'reorganizar', 'estudos', 'objetivos', 'habitos', 'financas', 'diario', 'busca', 'configuracoes', 'mais']

export interface Route {
  page: Page
  params: URLSearchParams
}

function readRoute(): Route {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace(/^#\/?/, '')
  const [p, q] = h.split('?')
  const page = (PAGES.includes(p as Page) ? p : 'inicio') as Page
  return { page, params: new URLSearchParams(q ?? '') }
}

const routeStore = createStore<Route>(readRoute())
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => routeStore.set(readRoute()))

export const useRoute = () => useStore(routeStore)

export function navigate(path: string) {
  const target = '#/' + path.replace(/^#?\/?/, '')
  if (location.hash === target) routeStore.set(readRoute())
  else location.hash = target
}

// ---------- Avisos (toasts) ----------

export interface Toast {
  id: number
  kind: 'sucesso' | 'erro' | 'info'
  text: string
  action?: { label: string; run: () => void }
}

const toastStore = createStore<Toast[]>([])
export const useToasts = () => useStore(toastStore)
let tid = 0

export function toast(text: string, kind: Toast['kind'] = 'sucesso', action?: Toast['action']) {
  const id = ++tid
  toastStore.set((l) => [...l.slice(-3), { id, kind, text, action }])
  setTimeout(() => dismissToast(id), kind === 'erro' ? 7000 : 4000)
}

export function dismissToast(id: number) {
  toastStore.set((l) => l.filter((t) => t.id !== id))
}

/** Executa uma operação e mostra sucesso só se ela realmente der certo. */
export async function attempt<T>(fn: () => Promise<T>, success?: string): Promise<T | undefined> {
  try {
    const r = await fn()
    if (success) toast(success, 'sucesso')
    return r
  } catch (e) {
    console.error(e)
    toast(`Não foi possível concluir: ${e instanceof Error ? e.message : String(e)}`, 'erro')
    return undefined
  }
}

// ---------- Confirmação ----------

export interface ConfirmReq {
  title: string
  body?: string
  confirmLabel?: string
  danger?: boolean
  options?: { label: string; value: string }[]
  input?: { label: string; type: 'password' | 'text' }
  resolve: (v: string | boolean) => void
}

const confirmStore = createStore<ConfirmReq | null>(null)
export const useConfirmReq = () => useStore(confirmStore)

export function confirm(opts: Omit<ConfirmReq, 'resolve' | 'options'>): Promise<boolean> {
  return new Promise((resolve) => confirmStore.set({ ...opts, resolve: (v) => resolve(v === true) }))
}

/** Pergunta com várias opções; retorna o valor escolhido ou null. */
export function choose(opts: Omit<ConfirmReq, 'resolve'> & { options: { label: string; value: string }[] }): Promise<string | null> {
  return new Promise((resolve) => confirmStore.set({ ...opts, resolve: (v) => resolve(typeof v === 'string' ? v : null) }))
}

/** Pede um texto (ex.: senha). Retorna null se cancelar. */
export function ask(opts: Omit<ConfirmReq, 'resolve' | 'options'> & { input: { label: string; type: 'password' | 'text' } }): Promise<string | null> {
  return new Promise((resolve) => confirmStore.set({ ...opts, resolve: (v) => resolve(typeof v === 'string' ? v : null) }))
}

export function closeConfirm(v: string | boolean) {
  const r = confirmStore.get()
  confirmStore.set(null)
  r?.resolve(v)
}

// ---------- Editores globais (abertos de qualquer lugar) ----------

export type Editor =
  | { type: 'task'; id?: string; preset?: Record<string, unknown> }
  | { type: 'event'; id?: string; date?: string; preset?: Record<string, unknown> }
  | { type: 'goal'; id?: string }
  | { type: 'transaction'; id?: string; preset?: Record<string, unknown> }
  | { type: 'journal'; id?: string }
  | { type: 'quickadd' }
  | { type: 'search' }
  | null

const editorStore = createStore<Editor>(null)
export const useEditor = () => useStore(editorStore)
export const openEditor = (e: Editor) => editorStore.set(e)
export const closeEditor = () => editorStore.set(null)

// ---------- Diário desbloqueado (somente nesta sessão) ----------

const unlockStore = createStore(false)
export const useJournalUnlocked = () => useStore(unlockStore)
export const setJournalUnlocked = (v: boolean) => unlockStore.set(v)

// ---------- Central de lembretes (dentro do app) ----------

export interface InAppReminder {
  key: string
  title: string
  body: string
  route: string
  at: number
  read: boolean
}

const reminderStore = createStore<InAppReminder[]>([])
export const useReminders = () => useStore(reminderStore)
export function pushReminder(r: Omit<InAppReminder, 'at' | 'read'>) {
  reminderStore.set((l) => [{ ...r, at: Date.now(), read: false }, ...l.filter((x) => x.key !== r.key)].slice(0, 30))
}
export const markRemindersRead = () => reminderStore.set((l) => l.map((r) => ({ ...r, read: true })))
export const clearReminders = () => reminderStore.set([])
