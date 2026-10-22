import { addDays, diffDays, today } from './dates'
import { nextOccurrence } from './recurrence'
import { patch, save, uid } from './store'
import type { Goal, Priority, Task } from './types'

export const PRIORITY_LABEL: Record<Priority, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' }
export const PRIORITY_WEIGHT: Record<Priority, number> = { baixa: 1, media: 2, alta: 3, urgente: 4 }
export const STATUS_LABEL: Record<Task['status'], string> = { a_fazer: 'A fazer', em_andamento: 'Em andamento', concluida: 'Concluída' }

export function newTask(partial: Partial<Task> & { title: string }): Omit<Task, 'id' | 'createdAt' | 'updatedAt'> & { id?: string } {
  return {
    description: '',
    priority: 'media',
    status: 'a_fazer',
    subtasks: [],
    tags: [],
    notes: '',
    order: Date.now(),
    ...partial,
  }
}

export const isDone = (t: Task) => t.status === 'concluida'

export function isOverdue(t: Task, ref = today()): boolean {
  return !isDone(t) && !!t.dueDate && t.dueDate < ref
}

export type TaskFilter = 'hoje' | 'semana' | 'atrasadas' | 'sem_data' | 'importantes' | 'concluidas' | 'todas'

export const FILTER_LABEL: Record<TaskFilter, string> = {
  hoje: 'Hoje',
  semana: 'Próximos 7 dias',
  atrasadas: 'Atrasadas',
  sem_data: 'Sem data',
  importantes: 'Importantes',
  concluidas: 'Concluídas',
  todas: 'Todas',
}

export function matchesFilter(t: Task, f: TaskFilter, ref = today()): boolean {
  switch (f) {
    case 'hoje':
      return !isDone(t) && ((!!t.dueDate && t.dueDate <= ref) || t.plannedDate === ref)
    case 'semana':
      return !isDone(t) && !!t.dueDate && t.dueDate >= ref && t.dueDate <= addDays(ref, 7)
    case 'atrasadas':
      return isOverdue(t, ref)
    case 'sem_data':
      return !isDone(t) && !t.dueDate
    case 'importantes':
      return !isDone(t) && (t.priority === 'alta' || t.priority === 'urgente')
    case 'concluidas':
      return isDone(t)
    case 'todas':
      return true
  }
}

/** Pontuação de urgência usada para ordenar e sugerir (quanto maior, mais urgente). */
export function urgencyScore(t: Task, ref = today(), goals: Goal[] = []): number {
  let s = PRIORITY_WEIGHT[t.priority] * 10
  if (t.dueDate) {
    const d = diffDays(t.dueDate, ref)
    if (d < 0) s += 50 + Math.min(20, -d * 2)
    else if (d === 0) s += 40
    else if (d <= 2) s += 30
    else if (d <= 7) s += 15
    else s += Math.max(0, 10 - d / 3)
  }
  if (t.goalId && goals.some((g) => g.id === t.goalId && g.status === 'ativo')) s += 5
  if (t.status === 'em_andamento') s += 3
  return s
}

export function sortByUrgency(tasks: Task[], ref = today(), goals: Goal[] = []): Task[] {
  return [...tasks].sort((a, b) => urgencyScore(b, ref, goals) - urgencyScore(a, ref, goals))
}

export function scoreReason(t: Task, ref = today()): string {
  const parts: string[] = []
  if (t.dueDate) {
    const d = diffDays(t.dueDate, ref)
    if (d < 0) parts.push(`está atrasada há ${-d} dia${d === -1 ? '' : 's'}`)
    else if (d === 0) parts.push('vence hoje')
    else if (d === 1) parts.push('vence amanhã')
    else parts.push(`vence em ${d} dias`)
  } else parts.push('não tem prazo')
  if (t.priority === 'alta' || t.priority === 'urgente') parts.push(`prioridade ${PRIORITY_LABEL[t.priority].toLowerCase()}`)
  return parts.join(', ')
}

/** Conclui (ou reabre) uma tarefa. Tarefas recorrentes geram a próxima ocorrência. */
export async function toggleTask(t: Task): Promise<Task | undefined> {
  if (isDone(t)) {
    await patch('tasks', t.id, { status: 'a_fazer', completedAt: undefined })
    return undefined
  }
  await patch('tasks', t.id, { status: 'concluida', completedAt: new Date().toISOString() })
  if (t.recurrence && t.dueDate) {
    const next = nextOccurrence(t.dueDate, t.recurrence, t.dueDate < today() ? addDays(today(), -1) : t.dueDate)
    if (next) {
      const copy = newTask({
        ...t,
        id: undefined,
        dueDate: next,
        status: 'a_fazer',
        completedAt: undefined,
        plannedDate: undefined,
        plannedStart: undefined,
        plannedEnd: undefined,
        subtasks: t.subtasks.map((s) => ({ ...s, id: uid(), done: false })),
      })
      delete (copy as Partial<Task>).createdAt
      return (await save('tasks', copy)) as Task
    }
  }
  return undefined
}

export function subtaskProgress(t: Task): number | null {
  if (!t.subtasks.length) return null
  return t.subtasks.filter((s) => s.done).length / t.subtasks.length
}
