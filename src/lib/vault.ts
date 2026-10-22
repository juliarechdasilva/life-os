// Cofre do diário: criptografa diário, memórias e seus anexos com uma senha.
// AES-GCM 256 bits, chave derivada da senha com PBKDF2-SHA-256 (310 mil iterações).
// A senha não é guardada em lugar nenhum. Se for esquecida, o conteúdo não pode ser recuperado.
import * as db from './db'
import { getState, saveSettings, setCodec, setCollectionInMemory } from './store'
import type { Attachment, JournalEntry, MemoryItem, StoredFile } from './types'
import { setJournalUnlocked } from './ui'

const ITER = 310_000
const CHECK = 'life-os:cofre-ok'
const PROTECTED = ['journal', 'memories'] as const

let key: CryptoKey | null = null

const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export async function deriveKey(password: string, saltB64: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64(saltB64), iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

async function encryptBytes(k: CryptoKey, data: Uint8Array<ArrayBuffer> | ArrayBuffer): Promise<{ iv: string; data: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const out = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, data)
  return { iv: b64(iv), data: b64(out) }
}

async function decryptBytes(k: CryptoKey, iv: string, data: string | ArrayBuffer): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, k, typeof data === 'string' ? unb64(data) : data)
}

interface Sealed {
  id: string
  createdAt: string
  updatedAt: string
  enc: { iv: string; data: string }
}

export const isSealed = (x: unknown): x is Sealed => !!x && typeof x === 'object' && 'enc' in (x as object)

export async function seal<T extends { id: string; createdAt?: string; updatedAt?: string }>(k: CryptoKey, item: T): Promise<Sealed> {
  const { id, createdAt = '', updatedAt = '', ...rest } = item
  return { id, createdAt, updatedAt, enc: await encryptBytes(k, new TextEncoder().encode(JSON.stringify(rest))) }
}

export async function unseal<T>(k: CryptoKey, s: Sealed): Promise<T> {
  const plain = new TextDecoder().decode(await decryptBytes(k, s.enc.iv, s.enc.data))
  return { id: s.id, createdAt: s.createdAt, updatedAt: s.updatedAt, ...JSON.parse(plain) } as T
}

export function isEncrypted() {
  const l = getState().settings.journalLock
  return !!(l.enabled && l.encrypted)
}

export function isUnlocked() {
  return key !== null
}

function installCodec(k: CryptoKey | null) {
  for (const c of PROTECTED) setCodec(c, k ? { encode: (i) => seal(k, i) } : 'bloqueado')
}

/** Chamado ao iniciar o app: se o diário é criptografado, começa bloqueado. */
export function initVault() {
  if (isEncrypted()) {
    key = null
    installCodec(null)
    setJournalUnlocked(false)
  } else for (const c of PROTECTED) setCodec(c, null)
}

async function readDecrypted(k: CryptoKey) {
  const out: { journal: JournalEntry[]; memories: MemoryItem[] } = { journal: [], memories: [] }
  for (const c of PROTECTED) {
    const raw = await db.getAll<unknown>(c)
    const items = await Promise.all(raw.map((r) => (isSealed(r) ? unseal(k, r) : r)))
    ;(out[c] as unknown[]) = items
  }
  return out
}

/** Desbloqueia com a senha. Retorna false se a senha estiver errada. */
export async function unlock(password: string): Promise<boolean> {
  const l = getState().settings.journalLock
  if (!l.salt || !l.check) return false
  const k = await deriveKey(password, l.salt)
  try {
    const [iv, data] = l.check.split(':')
    const ok = new TextDecoder().decode(await decryptBytes(k, iv, data)) === CHECK
    if (!ok) return false
  } catch {
    return false
  }
  const d = await readDecrypted(k)
  key = k
  installCodec(k)
  setCollectionInMemory('journal', d.journal)
  setCollectionInMemory('memories', d.memories)
  setJournalUnlocked(true)
  return true
}

/** Bloqueia: esquece a chave e troca o conteúdo em memória pela versão cifrada. */
export async function lock() {
  if (!isEncrypted()) return
  key = null
  installCodec(null)
  for (const c of PROTECTED) setCollectionInMemory(c, (await db.getAll(c)) as never)
  setJournalUnlocked(false)
}

function attachmentIds(): string[] {
  const { journal, memories } = getState().data
  return [...journal, ...memories].flatMap((x) => ((x as { attachments?: Attachment[] }).attachments ?? []).map((a) => a.id))
}

/** Ativa a criptografia com uma nova senha (o diário precisa estar acessível). */
export async function enableEncryption(password: string) {
  if (isEncrypted()) throw new Error('A criptografia já está ativa.')
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)))
  const k = await deriveKey(password, salt)
  const chk = await encryptBytes(k, new TextEncoder().encode(CHECK))
  const { journal, memories } = getState().data
  const sealedJ = await Promise.all(journal.map((j) => seal(k, j)))
  const sealedM = await Promise.all(memories.map((m) => seal(k, m)))
  const files: StoredFile[] = []
  for (const id of attachmentIds()) {
    const f = await db.getFile(id)
    if (f && !f.iv) {
      const e = await encryptBytes(k, await f.blob.arrayBuffer())
      files.push({ id, iv: e.iv, blob: new Blob([unb64(e.data)], { type: 'application/octet-stream' }) })
    }
  }
  // grava tudo cifrado e só então liga a configuração
  await db.putMany('journal', sealedJ)
  await db.putMany('memories', sealedM)
  for (const f of files) await db.putFile(f)
  await saveSettings({ journalLock: { enabled: true, encrypted: true, salt, check: `${chk.iv}:${chk.data}` } })
  key = k
  installCodec(k)
  setJournalUnlocked(true)
}

/** Desativa a criptografia (precisa estar desbloqueado). Grava tudo em texto normal. */
export async function disableEncryption() {
  if (!isEncrypted()) return
  if (!key) throw new Error('Desbloqueie o diário antes de desativar a criptografia.')
  const k = key
  const { journal, memories } = getState().data
  for (const id of attachmentIds()) {
    const f = await db.getFile(id)
    if (f?.iv) await db.putFile({ id, blob: new Blob([await decryptBytes(k, f.iv, await f.blob.arrayBuffer())]) })
  }
  await db.putMany('journal', journal)
  await db.putMany('memories', memories)
  await saveSettings({ journalLock: { enabled: false } })
  key = null
  for (const c of PROTECTED) setCodec(c, null)
  setJournalUnlocked(false)
}

/** Grava um anexo (cifrado se o cofre estiver ativo). */
export async function putAttachment(id: string, blob: Blob) {
  if (isEncrypted()) {
    if (!key) throw new Error('Desbloqueie o diário para anexar arquivos.')
    const e = await encryptBytes(key, await blob.arrayBuffer())
    await db.putFile({ id, iv: e.iv, blob: new Blob([unb64(e.data)], { type: 'application/octet-stream' }) })
  } else await db.putFile({ id, blob })
}

/** Lê um anexo já decifrado. */
export async function getAttachment(id: string, type: string): Promise<Blob | null> {
  const f = await db.getFile(id)
  if (!f) return null
  if (!f.iv) return f.blob
  if (!key) return null
  return new Blob([await decryptBytes(key, f.iv, await f.blob.arrayBuffer())], { type })
}

/** Para o backup: diário e memórias sempre como estão gravados (cifrados, se o cofre estiver ativo). */
export async function rawProtected() {
  return { journal: (await db.getAll('journal')) as JournalEntry[], memories: (await db.getAll('memories')) as MemoryItem[] }
}
