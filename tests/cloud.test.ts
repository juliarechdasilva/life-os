import 'fake-indexeddb/auto'
import { afterAll, describe, expect, it, vi } from 'vitest'
import * as cloud from '../src/lib/cloud'
import { openProtectedBackup, validateBackup } from '../src/lib/backup'
import * as store from '../src/lib/store'
import { newTask } from '../src/lib/tasks'

// GitHub falso em memória: guarda o arquivo e o histórico de commits.
function fakeGitHub() {
  const commits: { sha: string; message: string; date: string; content: string }[] = []
  let n = 0
  const calls: { method: string; url: string; auth: string }[] = []
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET'
    calls.push({ method, url, auth: String((init.headers as Record<string, string>).Authorization) })
    const u = new URL(url)
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status })
    if (u.pathname === '/user') return json({ login: 'ana' })
    if (u.pathname === '/repos/ana/life-os-backup') return json({ private: true, permissions: { push: true } })
    if (u.pathname.endsWith('/commits')) return json([...commits].reverse().map((c) => ({ sha: c.sha, commit: { message: c.message, committer: { date: c.date } } })))
    if (u.pathname.endsWith('/contents/life-os-backup.json')) {
      if (method === 'PUT') {
        const body = JSON.parse(init.body as string)
        const last = commits[commits.length - 1]
        if (last && body.sha !== 'blob-' + last.sha) return json({ message: 'sha mismatch' }, 409)
        const sha = 'c' + ++n
        commits.push({ sha, message: body.message, date: new Date(Date.now() + n * 1000).toISOString(), content: new TextDecoder().decode(Uint8Array.from(atob(body.content), (c) => c.charCodeAt(0))) })
        return json({ content: { sha: 'blob-' + sha } }, n === 1 ? 201 : 200)
      }
      const ref = u.searchParams.get('ref')
      const c = ref ? commits.find((x) => x.sha === ref) : commits[commits.length - 1]
      if (!c) return json({ message: 'Not Found' }, 404)
      return ref ? new Response(c.content, { status: 200 }) : json({ sha: 'blob-' + c.sha })
    }
    return json({ message: 'Not Found' }, 404)
  })
  return { commits, calls, fetchMock }
}

describe('backup automático no GitHub', () => {
  const gh = fakeGitHub()
  vi.stubGlobal('fetch', gh.fetchMock)
  afterAll(() => vi.unstubAllGlobals())

  it('ativa, envia criptografado e não reenvia se nada mudou', async () => {
    store.__reset()
    await store.load()
    await store.saveSettings({ onboarded: true, name: 'Ana' })
    await store.save('tasks', newTask({ title: 'Tarefa secreta' }))
    await cloud.loadCloud()
    expect(await cloud.setupCloud({ token: 'github_pat_teste', owner: '', repo: 'life-os-backup', password: 'senha forte 1' })).toBe('enviado')
    expect(gh.commits).toHaveLength(1)
    const file = gh.commits[0].content
    expect(file).not.toMatch(/Tarefa secreta|Ana/)
    expect(gh.calls.every((c) => c.auth === 'Bearer github_pat_teste')).toBe(true)
    // nada mudou → não envia
    expect(await cloud.backupNow()).toBe('sem_mudancas')
    expect(gh.commits).toHaveLength(1)
    // mudou → envia nova versão
    await store.save('tasks', newTask({ title: 'Outra' }))
    expect(await cloud.backupNow()).toBe('enviado')
    expect(gh.commits).toHaveLength(2)
    // conteúdo abre com a senha e é um backup válido
    const v = validateBackup(await openProtectedBackup(JSON.parse(gh.commits[1].content), 'senha forte 1'))
    expect(v.counts.tasks).toBe(2)
    await expect(openProtectedBackup(JSON.parse(gh.commits[1].content), 'errada')).rejects.toThrow(/incorreta/)
    // o token não vai dentro do backup
    expect(JSON.stringify(v)).not.toMatch(/github_pat/)
  })

  it('lista versões e restaura uma versão antiga', async () => {
    const versions = await cloud.listVersions('github_pat_teste', 'ana', 'life-os-backup')
    expect(versions).toHaveLength(2)
    const raw = await cloud.fetchVersion('github_pat_teste', 'ana', 'life-os-backup', versions[1].sha, 'senha forte 1')
    expect(validateBackup(raw).counts.tasks).toBe(1)
  })

  it('avisa quando outro aparelho enviou um backup mais novo', async () => {
    expect(await cloud.newerFromOtherDevice()).toBeNull()
    // simula o celular enviando depois
    gh.commits.push({ sha: 'cel1', message: 'Backup 22/10 — iPhone [dev-celular]', date: new Date(Date.now() + 3600_000).toISOString(), content: gh.commits[1].content })
    const v = await cloud.newerFromOtherDevice()
    expect(v?.sha).toBe('cel1')
    await cloud.adoptCurrentAsSynced(v!.date)
    expect(await cloud.newerFromOtherDevice()).toBeNull()
  })

  it('erro de token vira mensagem clara e fica registrado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    await store.save('tasks', newTask({ title: 'Mais uma' }))
    await expect(cloud.backupNow()).rejects.toThrow(/recusou o token/)
    expect(cloud.getCloud()?.lastError).toMatch(/recusou o token/)
    vi.stubGlobal('fetch', gh.fetchMock)
  })
})
