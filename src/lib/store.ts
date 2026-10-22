// Estado do app: carregado do IndexedDB uma vez e mantido em memória.
// Toda gravação vai primeiro ao banco; só depois o estado em memória muda.
// Se a gravação falhar, o erro é propagado (a interface mostra a falha).
import { useSyncExternalStore } from 'react'
import * as db from './db'
import { defaultCategories, defaultFinCategories, normalizeSettings } from './defaults'
import { isoNow } from './dates'
import { COLLECTIONS, type Collection, type Data, type ItemOf, type Settings, type StoredFile } from './types'

export interface AppState {
  status: 'loading' | 'ready' | 'error'
  error?: string
  data: Data
  settings: Settings
}

function emptyData(): Data {
  return Object.fromEntries(COLLECTIONS.map((c) => [c, []])) as unknown as Data
}

let state: AppState = { status: 'loading', data: emptyData(), settings: normalizeSettings(undefined) }
const listeners = new Set<() => void>()

function set(next: AppState) {
  state = next
  listeners.forEach((l) => l())
}

export function getState() {
  return state
}

export function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useApp(): AppState {
  return useSyncExternalStore(subscribe, getState, getState)
}

export function useData(): Data {
  return useApp().data
}

export function useSettings(): Settings {
  return useApp().settings
}

let idCounter = 0
export function uid(prefix = ''): string {
  idCounter = (idCounter + 1) % 1e6
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 13)
      : Math.random().toString(36).slice(2, 12)
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}${rnd}`.replace(/-/g, '')
}

export async function load(): Promise<void> {
  try {
    const entries = await Promise.all(COLLECTIONS.map(async (c) => [c, await db.getAll(c)] as const))
    const data = Object.fromEntries(entries) as unknown as Data
    const settings = normalizeSettings(await db.getSettings())
    // Primeira execução: cria categorias padrão (são configurações, não dados fictícios)
    if (data.categories.length === 0 && !settings.onboarded) {
      data.categories = defaultCategories()
      await db.putMany('categories', data.categories)
    }
    if (data.finCategories.length === 0 && !settings.onboarded) {
      data.finCategories = defaultFinCategories()
      await db.putMany('finCategories', data.finCategories)
    }
    set({ status: 'ready', data, settings })
  } catch (e) {
    set({ ...state, status: 'error', error: e instanceof Error ? e.message : String(e) })
  }
}

// ---------- Codificação (criptografia) por coleção ----------
// O cofre do diário registra aqui como cifrar/decifrar itens antes de gravar.
export interface Codec {
  encode: (item: { id: string }) => Promise<unknown>
}
const codecs: Partial<Record<Collection, Codec | 'bloqueado'>> = {}
export function setCodec(c: Collection, codec: Codec | 'bloqueado' | null) {
  if (codec) codecs[c] = codec
  else delete codecs[c]
}
async function encodeFor<T extends { id: string }>(c: Collection, items: T[]): Promise<unknown[]> {
  const codec = codecs[c]
  if (!codec) return items
  if (codec === 'bloqueado') throw new Error('O diário está bloqueado. Desbloqueie com sua senha para salvar.')
  return Promise.all(items.map((i) => codec.encode(i)))
}
/** Troca o conteúdo em memória de uma coleção, sem gravar (usado ao desbloquear/bloquear). */
export function setCollectionInMemory<C extends Collection>(c: C, items: Data[C]) {
  set({ ...state, data: { ...state.data, [c]: items } })
}

type Draft<C extends Collection> = Omit<ItemOf<C>, 'createdAt' | 'updatedAt' | 'id'> & { id?: string; createdAt?: string }

/** Cria ou atualiza um item. Retorna o item salvo. */
export async function save<C extends Collection>(c: C, item: Draft<C>): Promise<ItemOf<C>> {
  const now = isoNow()
  const full = { ...item, id: item.id ?? uid(), createdAt: item.createdAt ?? now, updatedAt: now } as ItemOf<C>
  await db.put(c, (await encodeFor(c, [full]))[0])
  const list = state.data[c] as ItemOf<C>[]
  const idx = list.findIndex((x) => x.id === full.id)
  const next = idx >= 0 ? list.map((x, i) => (i === idx ? full : x)) : [...list, full]
  set({ ...state, data: { ...state.data, [c]: next } })
  return full
}

export async function saveMany<C extends Collection>(c: C, items: Draft<C>[]): Promise<ItemOf<C>[]> {
  if (!items.length) return []
  const now = isoNow()
  const full = items.map((item) => ({ ...item, id: item.id ?? uid(), createdAt: item.createdAt ?? now, updatedAt: now })) as ItemOf<C>[]
  await db.putMany(c, await encodeFor(c, full))
  const byId = new Map(full.map((f) => [f.id, f]))
  const list = state.data[c] as ItemOf<C>[]
  const next = list.map((x) => byId.get(x.id) ?? x)
  for (const f of full) if (!list.some((x) => x.id === f.id)) next.push(f)
  set({ ...state, data: { ...state.data, [c]: next } })
  return full
}

/** Atualiza parcialmente um item existente. */
export async function patch<C extends Collection>(c: C, id: string, changes: Partial<ItemOf<C>>): Promise<ItemOf<C>> {
  const cur = (state.data[c] as ItemOf<C>[]).find((x) => x.id === id)
  if (!cur) throw new Error('Item não encontrado — ele pode ter sido excluído.')
  return save(c, { ...cur, ...changes } as unknown as Draft<C>)
}

export async function remove(c: Collection, id: string): Promise<void> {
  await removeMany(c, [id])
}

export async function removeMany(c: Collection, ids: string[]): Promise<void> {
  await db.delMany(c, ids)
  const set_ = new Set(ids)
  set({ ...state, data: { ...state.data, [c]: (state.data[c] as { id: string }[]).filter((x) => !set_.has(x.id)) } })
}

export async function saveSettings(changes: Partial<Settings>): Promise<Settings> {
  const next = normalizeSettings({ ...state.settings, ...changes })
  await db.putSettings(next)
  set({ ...state, settings: next })
  return next
}

export async function replaceEverything(data: Partial<Data>, settings: Settings | null, files: StoredFile[] = []) {
  await db.replaceAll(data, settings, files)
  const full = { ...emptyData(), ...data } as Data
  set({ ...state, status: 'ready', data: full, settings: normalizeSettings(settings ?? undefined) })
}

/** Apenas para testes. */
export function __reset() {
  db.closeDB()
  set({ status: 'loading', data: emptyData(), settings: normalizeSettings(undefined) })
}
