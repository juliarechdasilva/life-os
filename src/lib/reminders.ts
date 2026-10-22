// Lembretes locais. Funcionam ENQUANTO o Life OS estiver aberto (em uma aba ou
// instalado como app). Não há servidor de push: com o app fechado, nada é enviado.
import { getMeta, putMeta } from './db'
import { fromMin, nowMin, toMin, today } from './dates'
import { isScheduled } from './habits'
import { eventOccurrences } from './recurrence'
import { getState } from './store'
import { isDone } from './tasks'
import { pushReminder, toast } from './ui'

let fired = new Set<string>()
let timer: ReturnType<typeof setInterval> | null = null

export function notificationSupport(): 'sem_suporte' | NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'sem_suporte'
  return Notification.permission
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'sem_suporte'> {
  if (notificationSupport() === 'sem_suporte') return 'sem_suporte'
  return Notification.requestPermission()
}

function notify(key: string, title: string, body: string, route: string) {
  if (fired.has(key)) return
  fired.add(key)
  putMeta('fired', [...fired].slice(-300)).catch(() => {})
  pushReminder({ key, title, body, route })
  toast(`${title} — ${body}`, 'info', { label: 'Abrir', run: () => (location.hash = '#/' + route) })
  const { settings } = getState()
  if (settings.notifications.enabled && notificationSupport() === 'granted') {
    try {
      const n = new Notification(title, { body, tag: key, icon: './icon-192.png' })
      n.onclick = () => {
        window.focus()
        location.hash = '#/' + route
        n.close()
      }
    } catch {
      // alguns navegadores (ex.: Android) exigem service worker para notificar
      navigator.serviceWorker?.ready.then((reg) => reg.showNotification(title, { body, tag: key, icon: './icon-192.png' })).catch(() => {})
    }
  }
}

export function checkReminders(now = new Date()) {
  const { data, settings, status } = getState()
  if (status !== 'ready') return
  const ref = today(now)
  const m = nowMin(now)
  const lead = settings.notifications.leadMin
  const n = settings.notifications

  if (n.events) {
    for (const o of eventOccurrences(data.events, ref, ref)) {
      const before = o.event.reminderMin ?? null
      if (before == null || o.done) continue
      const at = o.startMin - before
      if (m >= at && m < o.startMin + 1)
        notify(`ev-${o.event.id}-${o.date}`, o.event.title, before ? `Começa às ${fromMin(o.startMin)} (em ${o.startMin - m} min)` : `Começa agora (${fromMin(o.startMin)})`, `agenda?id=${o.event.id}&data=${o.date}`)
    }
  }
  if (n.tasks) {
    for (const t of data.tasks) {
      if (isDone(t)) continue
      const time = t.plannedDate === ref ? t.plannedStart : t.dueDate === ref ? t.dueTime : undefined
      if (!time) continue
      const s = toMin(time)
      if (m >= s - lead && m <= s + 5) notify(`tk-${t.id}-${ref}-${time}`, t.title, `Tarefa às ${time}`, `tarefas?id=${t.id}`)
    }
  }
  if (n.habits) {
    for (const h of data.habits) {
      if (!h.reminderTime || !isScheduled(h, ref) || h.log[ref]) continue
      const s = toMin(h.reminderTime)
      if (m >= s && m <= s + 30) notify(`hb-${h.id}-${ref}`, h.name, 'Hora do seu hábito — sem pressão.', 'habitos')
    }
  }
  if (n.study) {
    const due = data.reviews.filter((r) => !r.done && r.dueDate <= ref)
    if (due.length && m >= 9 * 60) notify(`rv-${ref}`, 'Revisões de estudo', `${due.length} revisão(ões) programada(s) para hoje.`, 'estudos?aba=revisoes')
    for (const e of data.exams) {
      if (e.date === ref && m >= 7 * 60) notify(`ex-${e.id}`, e.title, `${e.type === 'prova' ? 'Prova' : 'Entrega'} hoje${e.time ? ' às ' + e.time : ''}. Boa sorte!`, `estudos?prova=${e.id}`)
    }
  }
}

export async function startReminders() {
  if (timer) return
  try {
    fired = new Set((await getMeta<string[]>('fired')) ?? [])
  } catch {
    fired = new Set()
  }
  checkReminders()
  timer = setInterval(() => checkReminders(), 30_000)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && checkReminders())
}
