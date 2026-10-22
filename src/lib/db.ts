// Camada fina sobre o IndexedDB do navegador. Tudo fica no dispositivo.
import { COLLECTIONS, type Collection, type Settings, type StoredFile } from './types'

const DB_NAME = 'life-os'
const DB_VERSION = 1
const META = 'meta'
const FILES = 'files'

let dbPromise: Promise<IDBDatabase> | null = null

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Transação cancelada'))
  })
}

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Este navegador não oferece IndexedDB (armazenamento local).'))
      return
    }
    const open = indexedDB.open(DB_NAME, DB_VERSION)
    open.onupgradeneeded = () => {
      const db = open.result
      for (const c of [...COLLECTIONS, META, FILES]) {
        if (!db.objectStoreNames.contains(c)) db.createObjectStore(c, { keyPath: 'id' })
      }
    }
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error)
    open.onblocked = () => reject(new Error('O banco de dados está bloqueado por outra aba do Life OS.'))
  })
  dbPromise.catch(() => (dbPromise = null))
  return dbPromise
}

/** Usado nos testes para simular "reiniciar o app". */
export function closeDB() {
  dbPromise?.then((db) => db.close()).catch(() => {})
  dbPromise = null
}

export async function getAll<T>(store: string): Promise<T[]> {
  const db = await openDB()
  return req(db.transaction(store).objectStore(store).getAll()) as Promise<T[]>
}

export async function put(store: string, value: unknown): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).put(value)
  await txDone(tx)
}

export async function putMany(store: string, values: unknown[]): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(store, 'readwrite')
  const os = tx.objectStore(store)
  for (const v of values) os.put(v)
  await txDone(tx)
}

export async function del(store: string, id: string): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).delete(id)
  await txDone(tx)
}

export async function delMany(store: string, ids: string[]): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(store, 'readwrite')
  const os = tx.objectStore(store)
  for (const id of ids) os.delete(id)
  await txDone(tx)
}

export async function getSettings(): Promise<Settings | undefined> {
  const db = await openDB()
  return req(db.transaction(META).objectStore(META).get('settings')) as Promise<Settings | undefined>
}

export async function putSettings(s: Settings): Promise<void> {
  await put(META, s)
}

export async function getMeta<T>(id: string): Promise<T | undefined> {
  const db = await openDB()
  const r = (await req(db.transaction(META).objectStore(META).get(id))) as { id: string; value: T } | undefined
  return r?.value
}

export async function putMeta(id: string, value: unknown): Promise<void> {
  await put(META, { id, value })
}

export async function putFile(f: StoredFile): Promise<void> {
  await put(FILES, f)
}

export async function getFile(id: string): Promise<StoredFile | undefined> {
  const db = await openDB()
  return req(db.transaction(FILES).objectStore(FILES).get(id)) as Promise<StoredFile | undefined>
}

export async function getAllFiles(): Promise<StoredFile[]> {
  return getAll<StoredFile>(FILES)
}

export async function deleteFile(id: string): Promise<void> {
  await del(FILES, id)
}

/** Substitui todo o conteúdo (usado em restaurar backup e apagar tudo). */
export async function replaceAll(
  data: Partial<Record<Collection, unknown[]>>,
  settings: Settings | null,
  files: StoredFile[] = [],
): Promise<void> {
  const db = await openDB()
  const stores = [...COLLECTIONS, META, FILES]
  const tx = db.transaction(stores, 'readwrite')
  for (const s of stores) tx.objectStore(s).clear()
  for (const c of COLLECTIONS) for (const item of data[c] ?? []) tx.objectStore(c).put(item)
  if (settings) tx.objectStore(META).put(settings)
  for (const f of files) tx.objectStore(FILES).put(f)
  await txDone(tx)
}

/** Pede ao navegador para não apagar os dados automaticamente quando faltar espaço. */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (navigator.storage?.persist) {
      if (await navigator.storage.persisted()) return true
      return await navigator.storage.persist()
    }
  } catch {
    /* sem suporte */
  }
  return null
}
