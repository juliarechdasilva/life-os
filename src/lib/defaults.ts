import { isoNow } from './dates'
import type { Category, FinCategory, Settings } from './types'

// Paleta suave para categorias (nomes = chaves de cor no CSS: --c-<chave>)
export const CATEGORY_COLORS = ['salvia', 'ceu', 'lavanda', 'pessego', 'rosa', 'areia', 'mar', 'argila', 'cinza'] as const
export type ColorKey = (typeof CATEGORY_COLORS)[number]
export const COLOR_LABEL: Record<ColorKey, string> = {
  salvia: 'Sálvia',
  ceu: 'Céu',
  lavanda: 'Lavanda',
  pessego: 'Pêssego',
  rosa: 'Rosa',
  areia: 'Areia',
  mar: 'Mar',
  argila: 'Argila',
  cinza: 'Cinza',
}

export function defaultSettings(): Settings {
  const weekday = { enabled: true, start: '08:00', end: '22:00' }
  return {
    id: 'settings',
    name: '',
    onboarded: false,
    theme: 'sistema',
    weekStart: 0,
    timeFormat: '24h',
    notifications: { enabled: false, tasks: true, events: true, habits: true, study: true, leadMin: 15 },
    planning: {
      availability: [
        { enabled: true, start: '09:00', end: '20:00' },
        { ...weekday },
        { ...weekday },
        { ...weekday },
        { ...weekday },
        { ...weekday },
        { enabled: true, start: '09:00', end: '20:00' },
      ],
      rest: [
        { id: 'almoco', label: 'Almoço', start: '12:00', end: '13:00', days: [0, 1, 2, 3, 4, 5, 6] },
        { id: 'jantar', label: 'Jantar', start: '19:00', end: '20:00', days: [0, 1, 2, 3, 4, 5, 6] },
      ],
      maxFocusMinPerDay: 240,
      bufferMin: 10,
      defaultTaskMin: 30,
    },
    pomodoro: { focusMin: 25, shortMin: 5, longMin: 15, cycles: 4 },
    journalLock: { enabled: false },
    ai: { provider: 'nenhum', groqKey: '', geminiKey: '', groqModel: 'llama-3.3-70b-versatile', geminiModel: 'gemini-3.8-flash', consent: false },
  }
}

/** Garante que configurações antigas/importadas tenham todos os campos. */
export function normalizeSettings(s: Partial<Settings> | undefined): Settings {
  const d = defaultSettings()
  if (!s) return d
  return {
    ...d,
    ...s,
    id: 'settings',
    notifications: { ...d.notifications, ...s.notifications },
    planning: {
      ...d.planning,
      ...s.planning,
      availability:
        Array.isArray(s.planning?.availability) && s.planning.availability.length === 7
          ? s.planning.availability
          : d.planning.availability,
      rest: Array.isArray(s.planning?.rest) ? s.planning.rest : d.planning.rest,
    },
    pomodoro: { ...d.pomodoro, ...s.pomodoro },
    // bloqueio antigo (só tela, sem criptografia) é descartado: agora o bloqueio sempre criptografa
    journalLock: s.journalLock?.enabled && !s.journalLock.encrypted ? d.journalLock : { ...d.journalLock, ...s.journalLock },
    ai: { ...d.ai, ...s.ai },
  }
}

export function defaultCategories(): Category[] {
  const now = isoNow()
  const list: [string, string, ColorKey][] = [
    ['cat-estudos', 'Estudos', 'ceu'],
    ['cat-trabalho', 'Trabalho', 'argila'],
    ['cat-saude', 'Saúde', 'salvia'],
    ['cat-casa', 'Casa', 'areia'],
    ['cat-familia', 'Família', 'pessego'],
    ['cat-amigos', 'Amigos', 'rosa'],
    ['cat-lazer', 'Lazer', 'lavanda'],
    ['cat-projetos', 'Projetos', 'mar'],
  ]
  return list.map(([id, name, color]) => ({ id, name, color, createdAt: now, updatedAt: now }))
}

export function defaultFinCategories(): FinCategory[] {
  const now = isoNow()
  const list: [string, string, ColorKey, 'despesa' | 'receita'][] = [
    ['fin-alimentacao', 'Alimentação', 'salvia', 'despesa'],
    ['fin-transporte', 'Transporte', 'ceu', 'despesa'],
    ['fin-moradia', 'Moradia', 'pessego', 'despesa'],
    ['fin-saude', 'Saúde', 'mar', 'despesa'],
    ['fin-educacao', 'Educação', 'lavanda', 'despesa'],
    ['fin-lazer', 'Lazer', 'rosa', 'despesa'],
    ['fin-compras', 'Compras', 'areia', 'despesa'],
    ['fin-outros', 'Outros', 'cinza', 'despesa'],
    ['fin-salario', 'Salário', 'salvia', 'receita'],
    ['fin-extra', 'Renda extra', 'mar', 'receita'],
    ['fin-mesada', 'Mesada / ajuda', 'areia', 'receita'],
  ]
  return list.map(([id, name, color, kind]) => ({ id, name, color, kind, createdAt: now, updatedAt: now }))
}
