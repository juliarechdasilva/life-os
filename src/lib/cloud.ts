// Backup automático em um repositório PRIVADO do GitHub da própria pessoa.
// - O arquivo é criptografado no aparelho (AES-256) com uma senha de backup antes de sair.
//   O GitHub só guarda um arquivo embaralhado; sem a senha ninguém lê.
// - O token e a chave de criptografia ficam só neste aparelho (não vão no backup).
// - Cada envio vira uma versão no histórico do repositório: dá para voltar a qualquer data.
import { buildBackup, BACKUP_APP, BACKUP_VERSION, openProtectedBackup } from './backup'
import { getMeta, putMeta } from './db'
import { getState, subscribe, uid } from './store'
import { deriveKey } from './vault'

export const BACKUP_FILE = 'life-os-backup.json'

export interface CloudConfig {
  enabled: boolean
  owner: string
  repo: string
  token: string
  salt: string // sal da senha de backup (vai no arquivo também)
  key: CryptoKey | null // chave derivada da senha (não exportável)
  deviceId: string
  deviceName: string
  lastAt?: string // último envio deste aparelho
  lastHash?: string // conteúdo do último envio (para não enviar igual)
  lastError?: string
}

const META = 'cloud'
let cfg: CloudConfig | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function onCloudChange(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function getCloud() {
  return cfg
}

export async function loadCloud(): Promise<CloudConfig | null> {
  cfg = (await getMeta<CloudConfig>(META).catch(() => undefined)) ?? null
  emit()
  return cfg
}

async function saveCloud(next: CloudConfig | null) {
  cfg = next
  await putMeta(META, next)
  emit()
}

export function guessDeviceName(): string {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Mac/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows'
  return 'Navegador'
}

// ---------- API do GitHub ----------

class GitHubError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function gh(token: string, path: string, init: RequestInit = {}, accept = 'application/vnd.github+json'): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`https://api.github.com${path}`, {
      ...init,
      cache: 'no-store',
      headers: { Accept: accept, Authorization: `Bearer ${token.trim()}`, 'X-GitHub-Api-Version': '2022-11-28', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    })
  } catch {
    throw new GitHubError('Sem conexão com o GitHub.', 0)
  }
  if (res.status === 401) throw new GitHubError('O GitHub recusou o token (ele pode ter expirado ou sido apagado).', 401)
  if (res.status === 403) throw new GitHubError('O token não tem permissão de escrita neste repositório ("Contents: Read and write").', 403)
  if (res.status === 404 && init.method !== 'PUT') return res
  if (res.status === 404) throw new GitHubError('Repositório não encontrado — confira o nome e se o token tem acesso a ele.', 404)
  if (!res.ok && res.status !== 404) throw new GitHubError(`O GitHub respondeu com erro (${res.status}).`, res.status)
  return res
}

const toB64 = (s: string) => {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
const bytesToB64 = (u: Uint8Array) => {
  let s = ''
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(s)
}

async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return bytesToB64(new Uint8Array(d))
}

/** Confere o token e o repositório. Retorna o dono (login) e se o repo é privado. */
export async function checkAccess(token: string, owner: string, repo: string): Promise<{ owner: string; private: boolean }> {
  let login = owner.trim()
  if (!login) {
    const r = await gh(token, '/user')
    if (!r.ok) throw new GitHubError('Não consegui identificar sua conta com esse token.', r.status)
    login = (await r.json()).login
  }
  const r = await gh(token, `/repos/${login}/${repo}`)
  if (r.status === 404) throw new GitHubError(`Não encontrei o repositório "${login}/${repo}" — confira o nome e se o token tem acesso a ele ("Only select repositories").`, 404)
  const j = await r.json()
  if (j.permissions && !j.permissions.push) throw new GitHubError('O token só pode ler o repositório. Ele precisa de "Contents: Read and write".', 403)
  return { owner: login, private: !!j.private }
}

/** Ativa o backup automático: deriva a chave da senha e faz o primeiro envio. */
export async function setupCloud(opts: { token: string; owner: string; repo: string; password: string }) {
  const access = await checkAccess(opts.token, opts.owner, opts.repo)
  if (!access.private) throw new GitHubError('Por segurança, use um repositório PRIVADO.', 400)
  const salt = bytesToB64(crypto.getRandomValues(new Uint8Array(16)))
  const key = await deriveKey(opts.password, salt)
  await saveCloud({
    enabled: true,
    owner: access.owner,
    repo: opts.repo.trim(),
    token: opts.token.trim(),
    salt,
    key,
    deviceId: cfg?.deviceId ?? uid('dev'),
    deviceName: guessDeviceName(),
  })
  return backupNow(true)
}

export async function disableCloud(forgetToken: boolean) {
  if (!cfg) return
  await saveCloud(forgetToken ? null : { ...cfg, enabled: false })
}

let running: Promise<'enviado' | 'sem_mudancas'> | null = null

/** Envia um backup agora (se houver mudanças desde o último). */
export function backupNow(force = false): Promise<'enviado' | 'sem_mudancas'> {
  if (running) return running
  running = doBackup(force).finally(() => (running = null))
  return running
}

async function doBackup(force: boolean): Promise<'enviado' | 'sem_mudancas'> {
  const c = cfg
  if (!c?.enabled || !c.key) throw new Error('O backup automático não está ativado.')
  const { data, settings } = getState()
  const b = await buildBackup(data, settings, true)
  const plain = JSON.stringify({ ...b, exportedAt: undefined })
  const hash = await sha256(plain)
  if (!force && hash === c.lastHash) return 'sem_mudancas'
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, c.key, new TextEncoder().encode(JSON.stringify(b))))
  const now = new Date()
  const file = JSON.stringify({ app: BACKUP_APP, version: BACKUP_VERSION, protegido: true, salt: c.salt, iv: bytesToB64(iv), data: bytesToB64(enc), device: c.deviceName, deviceId: c.deviceId, at: now.toISOString() })
  if (file.length > 90 * 1024 * 1024) throw new Error('O backup passou de 90 MB (muitas fotos). Remova anexos grandes ou use o backup em arquivo.')
  try {
    const cur = await gh(c.token, `/repos/${c.owner}/${c.repo}/contents/${BACKUP_FILE}`, {}, 'application/vnd.github.object+json')
    const sha = cur.ok ? (await cur.json()).sha : undefined
    await gh(c.token, `/repos/${c.owner}/${c.repo}/contents/${BACKUP_FILE}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `Backup ${now.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} — ${c.deviceName} [${c.deviceId}]`,
        content: toB64(file),
        ...(sha ? { sha } : {}),
      }),
    })
  } catch (e) {
    await saveCloud({ ...c, lastError: (e as Error).message })
    throw e
  }
  await saveCloud({ ...c, lastAt: now.toISOString(), lastHash: hash, lastError: undefined })
  return 'enviado'
}

export interface RemoteVersion {
  sha: string
  date: string
  message: string
  deviceId?: string
}

export async function listVersions(token: string, owner: string, repo: string): Promise<RemoteVersion[]> {
  const r = await gh(token, `/repos/${owner}/${repo}/commits?path=${BACKUP_FILE}&per_page=30`)
  if (r.status === 404) return []
  const j = (await r.json()) as { sha: string; commit: { message: string; committer: { date: string } } }[]
  return j.map((c) => ({ sha: c.sha, date: c.commit.committer.date, message: c.commit.message.replace(/ \[[^\]]+\]$/, ''), deviceId: c.commit.message.match(/\[([^\]]+)\]$/)?.[1] }))
}

/** Baixa uma versão e decifra com a senha de backup. */
export async function fetchVersion(token: string, owner: string, repo: string, sha: string, password: string): Promise<unknown> {
  const r = await gh(token, `/repos/${owner}/${repo}/contents/${BACKUP_FILE}?ref=${sha}`, {}, 'application/vnd.github.raw+json')
  if (!r.ok) throw new GitHubError('Não encontrei essa versão do backup.', r.status)
  return openProtectedBackup(JSON.parse(await r.text()), password)
}

/** Existe backup mais novo feito por OUTRO aparelho? (para avisar e oferecer restaurar) */
export async function newerFromOtherDevice(): Promise<RemoteVersion | null> {
  const c = cfg
  if (!c?.enabled || navigator.onLine === false) return null
  const v = (await listVersions(c.token, c.owner, c.repo).catch(() => []))[0]
  if (!v || !v.deviceId || v.deviceId === c.deviceId) return null
  if (c.lastAt && v.date <= c.lastAt) return null
  return v
}

// ---------- Agendamento automático ----------

let timer: ReturnType<typeof setTimeout> | null = null
let started = false

function schedule(delayMs: number) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(async () => {
    timer = null
    const c = cfg
    if (!c?.enabled || navigator.onLine === false) return
    // no máximo um envio a cada 10 minutos
    if (c.lastAt && Date.now() - new Date(c.lastAt).getTime() < 10 * 60_000) return schedule(10 * 60_000 - (Date.now() - new Date(c.lastAt).getTime()) + 1000)
    await backupNow().catch(() => schedule(15 * 60_000))
  }, delayMs)
}

/** Liga o backup automático: envia ~1 min depois de cada mudança, ao sair do app e ao voltar a internet. */
export async function startCloud() {
  if (started) return
  started = true
  await loadCloud()
  let last = getState().data
  subscribe(() => {
    const d = getState().data
    if (d !== last) {
      last = d
      if (cfg?.enabled) schedule(60_000)
    }
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && cfg?.enabled) backupNow().catch(() => {})
  })
  window.addEventListener('online', () => cfg?.enabled && schedule(5_000))
  if (cfg?.enabled) schedule(15_000)
}

/** Depois de restaurar um backup do GitHub: marca o conteúdo atual como já sincronizado
 *  (evita reenviar a mesma coisa e o aviso "backup mais novo" ficar voltando). */
export async function adoptCurrentAsSynced(remoteDate: string) {
  const c = cfg
  if (!c?.enabled) return
  const { data, settings } = getState()
  const b = await buildBackup(data, settings, true)
  await saveCloud({ ...c, lastHash: await sha256(JSON.stringify({ ...b, exportedAt: undefined })), lastAt: remoteDate > (c.lastAt ?? '') ? remoteDate : c.lastAt })
}
