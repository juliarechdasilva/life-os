import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { aiRespond, AiError, buildContext, parseJson, toProposals } from '../src/lib/ai'
import { buildBackup, isProtectedBackup, openProtectedBackup, protectBackup, validateBackup } from '../src/lib/backup'
import * as db from '../src/lib/db'
import { defaultSettings } from '../src/lib/defaults'
import { buildIcs, rrule } from '../src/lib/ics'
import * as store from '../src/lib/store'
import { newTask } from '../src/lib/tasks'
import type { CalEvent, Data, Task } from '../src/lib/types'
import * as vault from '../src/lib/vault'

const NOW = new Date(2026, 9, 22, 10, 0)
const empty = (): Data => ({ tasks: [], events: [], categories: [], goals: [], subjects: [], exams: [], sessions: [], reviews: [], habits: [], transactions: [], finCategories: [], savings: [], journal: [], memories: [], notes: [], chat: [] })
const ev = (p: Partial<CalEvent> & { title: string; date: string; start: string; durationMin: number }): CalEvent => ({ id: 'e' + Math.random(), createdAt: '', updatedAt: '', description: '', location: '', exceptions: [], doneDates: [], ...p })
const task = (p: Partial<Task> & { title: string }): Task => ({ id: 't' + Math.random(), createdAt: '', updatedAt: '', description: '', priority: 'media', status: 'a_fazer', subtasks: [], tags: [], notes: '', order: 0, ...p })

describe('calendário (.ics)', () => {
  it('gera eventos com recorrência, exceções e alarme', () => {
    const e = ev({ title: 'Inglês, avançado', date: '2026-10-26', start: '19:30', durationMin: 90, recurrence: { freq: 'semanal', interval: 1, weekdays: [1, 3], until: '2026-12-20' }, exceptions: ['2026-11-02'], reminderMin: 15 })
    const t = task({ title: 'Ligar médico', dueDate: '2026-10-23', dueTime: '10:00' })
    const { ics, count } = buildIcs({ events: [e], tasks: [t], settings: defaultSettings(), includeEvents: true, includeTasks: true, from: '2026-10-22' })
    expect(count).toBe(2)
    expect(ics).toContain('DTSTART:20261026T193000')
    expect(ics).toContain('DTEND:20261026T210000')
    expect(ics).toContain('RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE;UNTIL=20261220T235959')
    expect(ics).toContain('EXDATE:20261102T193000')
    expect(ics).toContain('TRIGGER:-PT15M')
    expect(ics).toContain('SUMMARY:Inglês\\, avançado')
    expect(ics.split('\r\n').every((l) => l.length <= 75)).toBe(true)
    expect(rrule({ freq: 'dias_uteis', interval: 1 }, '2026-10-22')).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')
  })
  it('ignora eventos passados e tarefas concluídas', () => {
    const { count } = buildIcs({ events: [ev({ title: 'x', date: '2026-01-01', start: '10:00', durationMin: 30 })], tasks: [task({ title: 'y', dueDate: '2026-10-23', dueTime: '10:00', status: 'concluida' })], settings: defaultSettings(), includeEvents: true, includeTasks: true, from: '2026-10-22' })
    expect(count).toBe(0)
  })
})

describe('IA: validação das sugestões', () => {
  const settings = defaultSettings()
  it('aceita tarefa válida e descarta agendamento em conflito', () => {
    const t = task({ title: 'Relatório' })
    const data = { ...empty(), tasks: [t], events: [ev({ title: 'Aula', date: '2026-10-22', start: '14:00', durationMin: 60 })] }
    const r = toProposals(
      {
        resposta: 'Feito',
        explicacao: ['porque sim'],
        acoes: [
          { tipo: 'criar_tarefa', titulo: 'Comprar pão', data: '2026-10-23', hora: '09:00', prioridade: 'alta' },
          { tipo: 'agendar_tarefa', tarefaId: t.id, data: '2026-10-22', inicio: '14:15', fim: '14:45' }, // conflita com Aula
          { tipo: 'agendar_tarefa', tarefaId: 'nao-existe', data: '2026-10-22', inicio: '16:00', fim: '16:30' },
          { tipo: 'criar_evento', titulo: 'Dentista', data: '2026-02-31', inicio: '10:00', duracaoMin: 30 }, // data inválida
          { tipo: 'agendar_tarefa', tarefaId: t.id, data: '2026-10-22', inicio: '12:15', fim: '12:45' }, // almoço
          { tipo: 'apagar_tudo' },
        ],
      },
      data,
      settings,
      NOW,
    )
    expect(r.proposals).toHaveLength(1)
    expect(r.proposals[0].kind).toBe('create_task')
    expect(r.explanation.join(' ')).toMatch(/conflita com um compromisso/)
    expect(r.explanation.join(' ')).toMatch(/descanso/)
  })
  it('ação "planejar" usa o planejador local', () => {
    const data = { ...empty(), tasks: [task({ title: 'A', dueDate: '2026-10-22', estimateMin: 30 })] }
    const r = toProposals({ resposta: 'ok', acoes: [{ tipo: 'planejar', dias: 3 }] }, data, settings, NOW)
    expect(r.proposals[0].kind).toBe('schedule')
  })
  it('lê JSON mesmo com cercas de código', () => {
    expect(parseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(() => parseJson('sem json')).toThrow(AiError)
  })
  it('contexto não inclui diário nem finanças', () => {
    const data = { ...empty(), journal: [{ id: 'j', createdAt: '', updatedAt: '', date: '2026-10-22', title: 'SEGREDO', text: 'segredo', tags: [], important: false, attachments: [] }], transactions: [{ id: 'x', createdAt: '', updatedAt: '', type: 'despesa' as const, amountCents: 999, date: '2026-10-22', description: 'FARMACIA', recurring: false, notes: '' }] }
    const c = JSON.stringify(buildContext(data, settings, NOW))
    expect(c).not.toMatch(/SEGREDO|segredo|FARMACIA|999/)
  })
  it('chama a Groq e transforma a resposta em propostas; erro de chave vira mensagem clara', async () => {
    const s = { ...settings, ai: { ...settings.ai, provider: 'groq' as const, groqKey: 'gsk_teste_123456', consent: true } }
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ resposta: 'Criei', acoes: [{ tipo: 'criar_tarefa', titulo: 'Estudar' }] }) } }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await aiRespond('crie estudar', [], empty(), s)
    expect(r.proposals).toHaveLength(1)
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body.response_format.type).toBe('json_object')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"code":"invalid_api_key"}}', { status: 401 })))
    await expect(aiRespond('x', [], empty(), s)).rejects.toMatchObject({ kind: 'chave' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })))
    await expect(aiRespond('x', [], empty(), s)).rejects.toMatchObject({ kind: 'limite' })
    vi.unstubAllGlobals()
  })
})

describe('criptografia do diário e backups', () => {
  it('cifra no disco, bloqueia, recusa senha errada e abre com a certa', async () => {
    store.__reset()
    await store.load()
    vault.initVault()
    await store.saveSettings({ onboarded: true, ai: { ...defaultSettings().ai, groqKey: 'gsk_segredo_999', provider: 'groq', consent: true } })
    await store.save('journal', { date: '2026-10-22', title: 'Querido diário', text: 'texto secreto', tags: [], important: false, attachments: [] })
    await vault.putAttachment('foto1', new Blob(['imagem'], { type: 'image/png' }))
    await vault.enableEncryption('minha senha boa')
    // no disco: cifrado
    const raw = (await db.getAll<Record<string, unknown>>('journal'))[0]
    expect(JSON.stringify(raw)).not.toMatch(/secreto|Querido/)
    expect(vault.isSealed(raw)).toBe(true)
    // novo texto salvo enquanto desbloqueado também é cifrado
    await store.save('journal', { date: '2026-10-23', title: '', text: 'outro segredo', tags: [], important: false, attachments: [] })
    expect(JSON.stringify(await db.getAll('journal'))).not.toMatch(/outro segredo/)
    // backup leva o diário cifrado e não leva a chave de IA
    const b = await buildBackup(store.getState().data, store.getState().settings, true)
    expect(JSON.stringify(b)).not.toMatch(/secreto|gsk_segredo/)
    // bloquear → memória sem texto; salvar é recusado
    await vault.lock()
    expect(JSON.stringify(store.getState().data.journal)).not.toMatch(/secreto/)
    await expect(store.save('journal', { date: '2026-10-24', title: '', text: 'x', tags: [], important: false, attachments: [] })).rejects.toThrow(/bloqueado/)
    expect(await vault.unlock('senha errada')).toBe(false)
    expect(await vault.unlock('minha senha boa')).toBe(true)
    expect(store.getState().data.journal.map((j) => j.text).sort()).toEqual(['outro segredo', 'texto secreto'])
    expect(await (await vault.getAttachment('foto1', 'image/png'))!.text()).toBe('imagem')
    // reiniciar o app: começa bloqueado
    store.__reset()
    await store.load()
    vault.initVault()
    expect(vault.isUnlocked()).toBe(false)
    expect(await vault.unlock('minha senha boa')).toBe(true)
    // desativar volta ao texto normal
    await vault.disableEncryption()
    expect(JSON.stringify(await db.getAll('journal'))).toMatch(/texto secreto/)
    expect(await (await db.getFile('foto1'))!.blob.text()).toBe('imagem')
  })
  it('backup protegido por senha só abre com a senha certa', async () => {
    const json = JSON.stringify({ app: 'life-os', version: 1, data: { tasks: [newTask({ title: 'oi' })].map((t, i) => ({ ...t, id: 'a' + i })) }, settings: {} })
    const locked = JSON.parse(await protectBackup(json, 'senha123'))
    expect(isProtectedBackup(locked)).toBe(true)
    expect(JSON.stringify(locked)).not.toMatch(/"oi"/)
    await expect(openProtectedBackup(locked, 'errada')).rejects.toThrow(/incorreta/)
    const v = validateBackup(await openProtectedBackup(locked, 'senha123'))
    expect(v.counts.tasks).toBe(1)
  })
})
