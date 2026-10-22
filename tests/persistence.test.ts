import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import * as store from '../src/lib/store'
import { newTask, toggleTask } from '../src/lib/tasks'
import { buildBackup, validateBackup } from '../src/lib/backup'
import type { Task } from '../src/lib/types'

async function restart() {
  store.__reset()
  await store.load()
  return store.getState()
}

describe('persistência no IndexedDB', () => {
  it('cria, recarrega, edita e exclui tarefa', async () => {
    let s = await restart()
    expect(s.status).toBe('ready')
    expect(s.data.categories.length).toBeGreaterThan(0) // categorias padrão
    const t = await store.save('tasks', newTask({ title: 'Estudar matemática', dueDate: '2026-10-22' }))
    s = await restart() // simula atualizar a página
    expect(s.data.tasks.find((x) => x.id === t.id)?.title).toBe('Estudar matemática')
    await store.patch('tasks', t.id, { title: 'Estudar física' })
    s = await restart()
    expect(s.data.tasks.find((x) => x.id === t.id)?.title).toBe('Estudar física')
    await store.remove('tasks', t.id)
    s = await restart()
    expect(s.data.tasks.find((x) => x.id === t.id)).toBeUndefined()
  })

  it('tarefa recorrente gera a próxima ao concluir', async () => {
    await restart()
    const t = (await store.save('tasks', newTask({ title: 'Regar plantas', dueDate: '2099-01-01', recurrence: { freq: 'semanal', interval: 1 } }))) as Task
    const next = await toggleTask(t)
    expect(next?.dueDate).toBe('2099-01-08')
    const s = await restart()
    expect(s.data.tasks.find((x) => x.id === t.id)?.status).toBe('concluida')
    expect(s.data.tasks.some((x) => x.dueDate === '2099-01-08' && x.status === 'a_fazer')).toBe(true)
  })

  it('configurações persistem e backup é válido e restaurável', async () => {
    await restart()
    await store.saveSettings({ name: 'Ana', onboarded: true })
    let s = await restart()
    expect(s.settings.name).toBe('Ana')
    await store.save('notes', { text: 'Comprar presente', pinned: false })
    s = store.getState()
    const b = await buildBackup(s.data, s.settings, false)
    const json = JSON.parse(JSON.stringify(b))
    const v = validateBackup(json)
    expect(v.counts.notes).toBe(1)
    await store.replaceEverything({}, null) // apagar tudo
    s = await restart()
    expect(s.data.notes).toHaveLength(0)
    await store.replaceEverything(v.data, v.settings)
    s = await restart()
    expect(s.data.notes[0].text).toBe('Comprar presente')
    expect(s.settings.name).toBe('Ana')
  })

  it('operação inválida falha em vez de fingir sucesso', async () => {
    await restart()
    await expect(store.patch('tasks', 'nao-existe', { title: 'x' })).rejects.toThrow(/não encontrado/)
  })
})
