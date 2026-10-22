// Exportação e restauração de dados (backup em arquivo JSON).
import { getAllFiles } from './db'
import { deriveKey, rawProtected } from './vault'
import { isValidDate } from './dates'
import { normalizeSettings } from './defaults'
import { COLLECTIONS, type Data, type JournalEntry, type Settings, type StoredFile } from './types'

export const BACKUP_APP = 'life-os'
export const BACKUP_VERSION = 1

export interface Backup {
  app: typeof BACKUP_APP
  version: number
  exportedAt: string
  settings: Settings
  data: Data
  files: { id: string; type: string; dataUrl: string; iv?: string }[]
}

async function blobToDataUrl(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${b.type || 'application/octet-stream'};base64,${btoa(bin)}`
}

async function dataUrlToBlob(url: string): Promise<Blob> {
  const res = await fetch(url)
  return res.blob()
}

export async function buildBackup(data: Data, settings: Settings, includeFiles = true): Promise<Backup> {
  const files = includeFiles ? await getAllFiles() : []
  // Diário e memórias saem como estão gravados: cifrados, se o cofre estiver ativo.
  if (settings.journalLock.enabled && settings.journalLock.encrypted) data = { ...data, ...(await rawProtected()) }
  // A chave de IA nunca vai para o backup.
  const safeSettings: Settings = { ...settings, ai: { ...settings.ai, groqKey: '', geminiKey: '', consent: false } }
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: safeSettings,
    data,
    files: await Promise.all(files.map(async (f) => ({ id: f.id, type: f.blob.type, dataUrl: await blobToDataUrl(f.blob), iv: f.iv }))),
  }
}

export class BackupError extends Error {}

/** Valida um backup. Lança BackupError com mensagem clara se algo estiver errado. */
export function validateBackup(raw: unknown): { data: Data; settings: Settings; fileCount: number; counts: Record<string, number> } {
  if (!raw || typeof raw !== 'object') throw new BackupError('O arquivo não contém um backup válido.')
  const b = raw as Partial<Backup>
  if (b.app !== BACKUP_APP) throw new BackupError('Este arquivo não é um backup do Life OS.')
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION)
    throw new BackupError('Este backup foi criado por uma versão mais nova do Life OS.')
  if (!b.data || typeof b.data !== 'object') throw new BackupError('O backup está incompleto (sem dados).')
  const data = {} as Data
  const counts: Record<string, number> = {}
  for (const c of COLLECTIONS) {
    const list = (b.data as unknown as Record<string, unknown>)[c] ?? []
    if (!Array.isArray(list)) throw new BackupError(`A seção "${c}" do backup está corrompida.`)
    const ids = new Set<string>()
    for (const [i, item] of list.entries()) {
      if (!item || typeof item !== 'object' || typeof (item as { id?: unknown }).id !== 'string')
        throw new BackupError(`Item ${i + 1} de "${c}" está sem identificador.`)
      const id = (item as { id: string }).id
      if (ids.has(id)) throw new BackupError(`Há itens duplicados em "${c}".`)
      ids.add(id)
      for (const k of ['date', 'dueDate', 'targetDate'] as const) {
        const v = (item as Record<string, unknown>)[k]
        if (v != null && !isValidDate(v)) throw new BackupError(`Data inválida em "${c}" (item ${i + 1}).`)
      }
      if (c === 'transactions') {
        const v = (item as { amountCents?: unknown }).amountCents
        if (typeof v !== 'number' || !Number.isFinite(v)) throw new BackupError(`Valor inválido em movimentação (item ${i + 1}).`)
      }
    }
    ;(data as unknown as Record<string, unknown[]>)[c] = list
    counts[c] = list.length
  }
  // Diário pode vir sem anexos em backups parciais
  data.journal = data.journal.map((j: JournalEntry) => ({ ...j, attachments: j.attachments ?? [], tags: j.tags ?? [] }))
  return { data, settings: normalizeSettings(b.settings), fileCount: Array.isArray(b.files) ? b.files.length : 0, counts }
}

export async function filesFromBackup(raw: Backup): Promise<StoredFile[]> {
  if (!Array.isArray(raw.files)) return []
  const out: StoredFile[] = []
  for (const f of raw.files) {
    if (typeof f?.id === 'string' && typeof f.dataUrl === 'string' && f.dataUrl.startsWith('data:')) out.push({ id: f.id, blob: await dataUrlToBlob(f.dataUrl), ...(typeof f.iv === 'string' ? { iv: f.iv } : {}) })
  }
  return out
}

export function download(filename: string, content: string | Blob, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: `${type};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function journalToMarkdown(entries: JournalEntry[]): string {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1))
  return (
    '# Diário — Life OS\n\n' +
    sorted
      .map(
        (e) =>
          `## ${e.date.split('-').reverse().join('/')}${e.title ? ' — ' + e.title : ''}${e.important ? ' ⭐' : ''}\n\n${e.text}\n${e.tags.length ? `\n_Tags: ${e.tags.join(', ')}_\n` : ''}`,
      )
      .join('\n---\n\n')
  )
}

/** No celular, abre a folha de compartilhar (salvar em Arquivos/iCloud, enviar etc.). No computador, baixa o arquivo. */
export async function shareOrDownload(filename: string, content: string, type: string): Promise<'compartilhado' | 'baixado' | 'cancelado'> {
  const file = new File([content], filename, { type })
  const mobile = typeof navigator !== 'undefined' && /iPhone|iPad|Android/i.test(navigator.userAgent)
  if (mobile && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'compartilhado'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelado'
    }
  }
  download(filename, content, type)
  return 'baixado'
}

// ---------- Backup protegido por senha ----------

interface Locked {
  app: typeof BACKUP_APP
  version: number
  protegido: true
  salt: string
  iv: string
  data: string
}

const b64 = (u: Uint8Array) => {
  let s = ''
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(s)
}
const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export function isProtectedBackup(raw: unknown): raw is Locked {
  return !!raw && typeof raw === 'object' && (raw as Locked).app === BACKUP_APP && (raw as Locked).protegido === true
}

export async function protectBackup(json: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, b64(salt))
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(json)))
  const out: Locked = { app: BACKUP_APP, version: BACKUP_VERSION, protegido: true, salt: b64(salt), iv: b64(iv), data: b64(data) }
  return JSON.stringify(out)
}

export async function openProtectedBackup(raw: Locked, password: string): Promise<unknown> {
  const key = await deriveKey(password, raw.salt)
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(raw.iv) }, key, unb64(raw.data))
    return JSON.parse(new TextDecoder().decode(plain))
  } catch {
    throw new BackupError('Senha do backup incorreta.')
  }
}
