import { CalendarClock, CalendarDays, CalendarX, Copy, Edit3, Flag, ListChecks, MoreVertical, Repeat, Trash2 } from 'lucide-react'
import { addDays, fmtDuration, fmtRelative, fmtT, today } from '../lib/dates'
import { patch, remove, save, useData } from '../lib/store'
import { isOverdue, newTask, PRIORITY_LABEL, subtaskProgress, toggleTask } from '../lib/tasks'
import type { Task } from '../lib/types'
import { attempt, confirm, openEditor, toast } from '../lib/ui'
import { Menu } from './ui'

export function TaskRow({ task, compact, selectable, selected, onSelect, draggable, onDragStart, onDragEnd }: {
  task: Task
  compact?: boolean
  selectable?: boolean
  selected?: boolean
  onSelect?: (v: boolean) => void
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
}) {
  const data = useData()
  const ref = today()
  const done = task.status === 'concluida'
  const cat = data.categories.find((c) => c.id === task.categoryId)
  const goal = data.goals.find((g) => g.id === task.goalId)
  const sp = subtaskProgress(task)
  const late = isOverdue(task, ref)

  async function toggle() {
    const next = await attempt(() => toggleTask(task))
    if (!done) {
      toast(next ? `Concluída! Próxima repetição: ${fmtRelative(next.dueDate!).toLowerCase()}.` : 'Tarefa concluída. 🌿', 'sucesso', {
        label: 'Desfazer',
        run: () => {
          attempt(async () => {
            await patch('tasks', task.id, { status: task.status, completedAt: undefined })
            if (next) await remove('tasks', next.id)
          })
        },
      })
    }
  }

  async function reschedule(date: string | undefined) {
    await attempt(() => patch('tasks', task.id, { dueDate: date, dueTime: date ? task.dueTime : undefined, plannedDate: undefined, plannedStart: undefined, plannedEnd: undefined }), date ? `Reagendada para ${fmtRelative(date).toLowerCase()}.` : 'Data removida.')
  }

  async function del() {
    if (await confirm({ title: 'Excluir tarefa?', body: `"${task.title}" será excluída permanentemente.`, confirmLabel: 'Excluir', danger: true }))
      await attempt(() => remove('tasks', task.id), 'Tarefa excluída.')
  }

  return (
    <div
      className={`task-row${done ? ' done' : ''}${draggable ? ' kcard' : ''}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      data-testid="task-row"
    >
      {selectable && (
        <input type="checkbox" className="check square" checked={!!selected} onChange={(e) => onSelect?.(e.target.checked)} aria-label={`Selecionar ${task.title}`} style={{ marginTop: 2 }} />
      )}
      <input type="checkbox" className={`check pri-${task.priority}`} checked={done} onChange={toggle} aria-label={done ? `Reabrir ${task.title}` : `Concluir ${task.title}`} />
      <button className="task-body" onClick={() => openEditor({ type: 'task', id: task.id })}>
        <div className="task-title">{task.title}</div>
        {!compact || task.dueDate || task.plannedStart ? (
          <div className="task-meta">
            {task.plannedDate && task.plannedStart && !done && (
              <span className="badge">
                <CalendarClock size={13} /> {task.plannedDate === ref ? '' : fmtRelative(task.plannedDate, ref) + ' · '}
                {fmtT(task.plannedStart)}–{fmtT(task.plannedEnd)}
              </span>
            )}
            {task.dueDate && (
              <span className={`badge${late ? ' late' : ''}`}>
                <CalendarDays size={13} /> {late ? 'Atrasada · ' : ''}
                {fmtRelative(task.dueDate, ref)}
                {task.dueTime ? ` · ${fmtT(task.dueTime)}` : ''}
              </span>
            )}
            {!compact && <span className={`pri ${task.priority}`}>{PRIORITY_LABEL[task.priority]}</span>}
            {!compact && task.estimateMin && <span>{fmtDuration(task.estimateMin)}</span>}
            {sp != null && (
              <span className="badge">
                <ListChecks size={13} /> {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length}
              </span>
            )}
            {task.recurrence && <Repeat size={13} aria-label="Recorrente" />}
            {!compact && cat && (
              <span className="badge" data-c={cat.color}>
                <i className="dot-c" /> {cat.name}
              </span>
            )}
            {!compact && goal && <span className="badge"><Flag size={12} /> {goal.name}</span>}
            {!compact && task.tags.map((t) => <span key={t} className="tag">#{t}</span>)}
          </div>
        ) : null}
      </button>
      <Menu
        trigger={<MoreVertical size={17} />}
        label={`Opções de ${task.title}`}
        items={[
          { label: 'Editar', icon: <Edit3 size={16} />, onClick: () => openEditor({ type: 'task', id: task.id }) },
          { label: 'Para hoje', icon: <CalendarDays size={16} />, onClick: () => reschedule(ref) },
          { label: 'Para amanhã', icon: <CalendarDays size={16} />, onClick: () => reschedule(addDays(ref, 1)) },
          { label: 'Próxima semana', icon: <CalendarDays size={16} />, onClick: () => reschedule(addDays(ref, 7)) },
          { label: 'Remover data', icon: <CalendarX size={16} />, onClick: () => reschedule(undefined) },
          {
            label: 'Duplicar',
            icon: <Copy size={16} />,
            onClick: () => {
              const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = task
              void _i, void _c, void _u
              attempt(() => save('tasks', newTask({ ...rest, title: task.title + ' (cópia)', status: 'a_fazer', completedAt: undefined })), 'Tarefa duplicada.')
            },
          },
          { label: 'Excluir', icon: <Trash2 size={16} />, onClick: del, danger: true },
        ]}
      />
    </div>
  )
}
