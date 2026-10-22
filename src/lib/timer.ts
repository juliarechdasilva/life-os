// Cronômetro de foco (Pomodoro). Usa horários absolutos, então continua certo
// mesmo trocando de tela ou com a aba em segundo plano. O estado fica no
// localStorage para sobreviver a um recarregamento.
import { useEffect, useState, useSyncExternalStore } from 'react'

export type Phase = 'foco' | 'pausa_curta' | 'pausa_longa'

export interface TimerState {
  phase: Phase
  running: boolean
  endsAt: number | null // quando rodando
  remainingMs: number // quando pausado
  totalMs: number
  cycle: number // focos concluídos no ciclo
  subjectId?: string
  content: string
  focusStartedAt?: number
  focusAccumMs: number // tempo de foco efetivamente corrido nesta fase
  reviews?: boolean // programar revisões ao registrar
}

const KEY = 'life-os-timer'
const ls = new Set<() => void>()

function load(): TimerState | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as TimerState) : null
  } catch {
    return null
  }
}

let state: TimerState | null = load()

function set(s: TimerState | null) {
  state = s
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s))
    else localStorage.removeItem(KEY)
  } catch {
    /* armazenamento indisponível: o cronômetro funciona só nesta sessão */
  }
  ls.forEach((l) => l())
}

export function useTimer() {
  return useSyncExternalStore(
    (l) => (ls.add(l), () => ls.delete(l)),
    () => state,
    () => state,
  )
}

/** Re-renderiza a cada segundo enquanto `active`. */
export function useTick(active: boolean) {
  const [, setN] = useState(0)
  useEffect(() => {
    if (!active) return
    const i = setInterval(() => setN((n) => n + 1), 500)
    return () => clearInterval(i)
  }, [active])
}

export function remaining(s: TimerState, now = Date.now()) {
  return s.running && s.endsAt ? Math.max(0, s.endsAt - now) : s.remainingMs
}

export function focusElapsedMs(s: TimerState, now = Date.now()) {
  if (s.phase !== 'foco') return 0
  return s.focusAccumMs + (s.running && s.focusStartedAt ? now - s.focusStartedAt : 0)
}

export function startPhase(phase: Phase, minutes: number, base: Partial<TimerState> = {}) {
  const ms = minutes * 60_000
  const now = Date.now()
  set({
    cycle: 0,
    content: '',
    ...state,
    ...base,
    phase,
    running: true,
    endsAt: now + ms,
    remainingMs: ms,
    totalMs: ms,
    focusStartedAt: phase === 'foco' ? now : undefined,
    focusAccumMs: 0,
  })
}

export function pause() {
  if (!state?.running) return
  const now = Date.now()
  set({
    ...state,
    running: false,
    remainingMs: remaining(state, now),
    endsAt: null,
    focusAccumMs: focusElapsedMs(state, now),
    focusStartedAt: undefined,
  })
}

export function resume() {
  if (!state || state.running) return
  const now = Date.now()
  set({ ...state, running: true, endsAt: now + state.remainingMs, focusStartedAt: state.phase === 'foco' ? now : undefined })
}

export function update(p: Partial<TimerState>) {
  if (state) set({ ...state, ...p })
}

export function reset() {
  set(null)
}

export function getTimer() {
  return state
}
