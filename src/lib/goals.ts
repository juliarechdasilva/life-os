import type { Goal, Task } from './types'

/** Progresso real: etapas concluídas + tarefas vinculadas concluídas. */
export function goalProgress(g: Goal, tasks: Task[]): { pct: number; done: number; total: number } {
  const linked = tasks.filter((t) => t.goalId === g.id)
  const total = g.steps.length + linked.length
  const done = g.steps.filter((s) => s.done).length + linked.filter((t) => t.status === 'concluida').length
  if (g.status === 'concluido' && total === 0) return { pct: 100, done: 0, total: 0 }
  return { pct: total ? Math.round((done / total) * 100) : 0, done, total }
}

export function nextStep(g: Goal, tasks: Task[]): string | null {
  const step = g.steps.find((s) => !s.done)
  const task = tasks
    .filter((t) => t.goalId === g.id && t.status !== 'concluida')
    .sort((a, b) => (a.dueDate ?? '9999') < (b.dueDate ?? '9999') ? -1 : 1)[0]
  if (task && (!step || task.dueDate)) return `Tarefa: ${task.title}`
  if (step) return step.title
  return null
}
