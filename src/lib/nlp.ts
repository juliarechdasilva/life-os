// Interpretação de linguagem natural em português, feita por regras locais.
// Reconhece datas, horários, durações, prioridades e intenções comuns.
import { addDays, addMonths, isValidDate, today, toDateStr, weekday } from './dates'
import type { DateStr, Priority, TimeStr } from './types'

export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const NUM_WORDS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, quinze: 15, vinte: 20, trinta: 30, quarenta: 40, meia: 0.5,
}
const NUM = `(\\d+(?:[.,]\\d+)?|${Object.keys(NUM_WORDS).join('|')})`

export function toNumber(s: string): number {
  if (s in NUM_WORDS) return NUM_WORDS[s]
  return parseFloat(s.replace(',', '.'))
}

const WEEKDAY_RE: [RegExp, number][] = [
  [/\bdomingo\b/, 0],
  [/\bsegunda(-feira| feira)?\b/, 1],
  [/\bterca(-feira| feira)?\b/, 2],
  [/\bquarta(-feira| feira)?\b/, 3],
  [/\bquinta(-feira| feira)?\b/, 4],
  [/\bsexta(-feira| feira)?\b/, 5],
  [/\bsabado\b/, 6],
]

export interface DateMatch {
  date: DateStr
  text: string // trecho reconhecido (normalizado)
}

/** Encontra a primeira data mencionada. `ref` é hoje. */
export function parseDateIn(input: string, ref: DateStr = today()): DateMatch | null {
  const s = norm(input)
  let m: RegExpMatchArray | null
  if ((m = s.match(/\bdepois de amanha\b/))) return { date: addDays(ref, 2), text: m[0] }
  if ((m = s.match(/\bamanha\b/))) return { date: addDays(ref, 1), text: m[0] }
  if ((m = s.match(/\bhoje( a noite| de noite| a tarde| de manha)?\b/))) return { date: ref, text: m[0] }
  if ((m = s.match(new RegExp(`\\b(?:em|daqui a|daqui) ${NUM} (dia|dias|semana|semanas|mes|meses)\\b`)))) {
    const n = toNumber(m[1])
    const unit = m[2]
    const date = unit.startsWith('dia') ? addDays(ref, n) : unit.startsWith('semana') ? addDays(ref, n * 7) : addMonths(ref, n)
    return { date, text: m[0] }
  }
  if ((m = s.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
    const d = +m[1]
    const mo = +m[2]
    let y = m[3] ? +m[3] : +ref.slice(0, 4)
    if (y < 100) y += 2000
    let date = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (!m[3] && isValidDate(date) && date < ref) date = `${y + 1}${date.slice(4)}`
    if (isValidDate(date)) return { date, text: m[0] }
  }
  if ((m = s.match(/\bdia (\d{1,2})\b(?! de \w)/)) || (m = s.match(/\bdia (\d{1,2}) de (\w+)/))) {
    const d = +m[1]
    const months = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
    const r = new Date(+ref.slice(0, 4), +ref.slice(5, 7) - 1, 1)
    const monthIdx = m[2] ? months.indexOf(m[2]) : -1
    if (monthIdx >= 0) {
      r.setMonth(monthIdx)
      r.setDate(d)
      let date = toDateStr(r)
      if (date < ref) date = `${+date.slice(0, 4) + 1}${date.slice(4)}`
      if (r.getDate() === d) return { date, text: m[0] }
    } else if (d >= 1 && d <= 31) {
      let probe = new Date(r.getFullYear(), r.getMonth(), d)
      if (probe.getDate() !== d || toDateStr(probe) < ref) probe = new Date(r.getFullYear(), r.getMonth() + 1, d)
      if (probe.getDate() === d) return { date: toDateStr(probe), text: m[0] }
    }
  }
  if ((m = s.match(/\b(semana que vem|proxima semana)\b/))) {
    const wd = weekday(ref)
    return { date: addDays(ref, ((8 - wd) % 7) || 7), text: m[0] }
  }
  if ((m = s.match(/\b(fim de semana|final de semana)\b/))) {
    const wd = weekday(ref)
    return { date: addDays(ref, wd === 6 ? 0 : (6 - wd + 7) % 7), text: m[0] }
  }
  for (const [re, wd] of WEEKDAY_RE) {
    const mm = s.match(re)
    if (mm) {
      const cur = weekday(ref)
      let delta = (wd - cur + 7) % 7
      const idx = mm.index ?? 0
      const before = s.slice(Math.max(0, idx - 12), idx)
      const after = s.slice(idx, idx + mm[0].length + 12)
      if (/(proxima|proximo)\s*$/.test(before) || /que vem/.test(after)) delta = delta === 0 ? 7 : delta
      if (delta === 0 && !/\bhoje\b/.test(s)) delta = 0 // mesma semana: hoje
      const prefix = before.match(/(na |no |nesta |neste |essa |esta |proxima |proximo )\s*$/)?.[0] ?? ''
      return { date: addDays(ref, delta), text: (prefix + mm[0]).trim() }
    }
  }
  return null
}

export interface TimeMatch {
  time: TimeStr
  text: string
}

export function parseTimeIn(input: string): TimeMatch | null {
  const s = norm(input)
  let m: RegExpMatchArray | null
  if ((m = s.match(/\b(?:as |a |ao )?meio[- ]dia\b/))) return { time: '12:00', text: m[0] }
  if ((m = s.match(/\b(?:as |a )?meia[- ]noite\b/))) return { time: '00:00', text: m[0] }
  const re = /(\b(?:a partir das|ate as|por volta das|das|as)\s+)?\b(\d{1,2})(?::(\d{2})|h(\d{2})?\b|\b)(\s*(?:horas?\b)?)?(\s*da (manha|tarde|noite))?/g
  for (const c of s.matchAll(re)) {
    const prep = c[1]
    const hasColon = c[3] != null
    const hForm = c[0].includes('h') && /\d h|\dh/.test(c[0])
    const period = c[7]
    const idx = c.index ?? 0
    const after = s.slice(idx + c[0].length, idx + c[0].length + 14)
    const before = s.slice(Math.max(0, idx - 14), idx)
    let h = +c[2]
    const mi = c[3] ? +c[3] : c[4] ? +c[4] : 0
    if (s[idx + c[0].length] === '/' || before.endsWith('/')) continue // é data
    let isTime = false
    if (prep || hasColon || period) isTime = true
    else if (hForm && !/^\s*(livres?|de (estudo|foco)|seguidas|por dia|sobrando|disponive)/.test(after)
      && !/(tenho|por|durante|de|em|cerca de|uns|umas|mais|estudar|ler|dedicar)\s*$/.test(before) && h >= 6) isTime = true
    if (!isTime) continue
    if (!prep && !hasColon && !hForm && !period) continue
    if ((period === 'tarde' || period === 'noite') && h < 12) h += 12
    if (h > 23 || mi > 59) continue
    return { time: `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`, text: c[0].trim() }
  }
  return null
}

/** Duração em minutos: "2 horas", "1h30", "30 min", "meia hora", "uma hora e meia". */
export function parseDurationIn(input: string): { minutes: number; text: string } | null {
  const s = norm(input)
  let m: RegExpMatchArray | null
  if ((m = s.match(new RegExp(`\\b${NUM} hora(?:s)? e meia\\b`)))) return { minutes: toNumber(m[1]) * 60 + 30, text: m[0] }
  if ((m = s.match(/\bmeia hora\b/))) return { minutes: 30, text: m[0] }
  if ((m = s.match(/\b(\d{1,2})h(\d{2})\b/))) return { minutes: +m[1] * 60 + +m[2], text: m[0] }
  if ((m = s.match(new RegExp(`\\b${NUM}\\s?(?:h|hr|hrs|hora|horas)\\b`)))) {
    const idx = m.index ?? 0
    if (!/\bas\s*$/.test(s.slice(Math.max(0, idx - 4), idx))) return { minutes: Math.round(toNumber(m[1]) * 60), text: m[0] }
  }
  if ((m = s.match(new RegExp(`\\b${NUM}\\s?(?:min|mins|minuto|minutos)\\b`)))) return { minutes: Math.round(toNumber(m[1])), text: m[0] }
  return null
}

export function parsePriority(input: string): Priority | null {
  const s = norm(input)
  if (/\burgente|urgencia|o quanto antes|asap\b/.test(s)) return 'urgente'
  if (/\bimportante|prioridade alta|alta prioridade|prioritari/.test(s)) return 'alta'
  if (/\bsem pressa|baixa prioridade|prioridade baixa|quando der\b/.test(s)) return 'baixa'
  return null
}

/** Remove trechos reconhecidos e palavras de comando para sobrar o título. */
export function cleanTitle(original: string, removeNorm: string[]): string {
  let s = original
  // remove trechos em versão sem acento comparando posição a posição
  const fold = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const r of removeNorm.filter(Boolean)) {
    const n = fold(s)
    const idx = n.indexOf(r)
    if (idx >= 0) s = s.slice(0, idx) + s.slice(idx + r.length)
  }
  s = s
    .replace(
      /^\s*(por favor,?\s*)?(me\s+)?(adiciona(r)?|adicione|cria(r)?|crie|coloca(r)?|coloque|anota(r)?|anote|agenda(r)?|agende|marca(r)?|marque|inclui(r)?|inclua|registra(r)?|registre|lembra(r)?|lembre)(-me)?\s+(de\s+|que\s+)?/i,
      '',
    )
    .replace(/^\s*(uma|um)\s+(nova\s+)?(tarefa|lembrete|evento|compromisso)\s*(de|para|pra|:)?\s*/i, '')
    .replace(/^\s*(tarefa|lembrete|evento|compromisso)\s*(de|para|pra|:)?\s*/i, '')
    .replace(/^\s*(eu\s+)?(preciso|tenho que|tenho de|devo)\s+/i, '')
    .replace(/\b(com\s+)?(prioridade\s+)?(urgente|importante|alta prioridade|baixa prioridade|sem pressa)\b/gi, '')
    .replace(/\s+(para|pra|na|no|em|de|as|às|a|ao|,)\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export type Intent =
  | 'add_task'
  | 'add_event'
  | 'exam_plan'
  | 'organize_week'
  | 'free_time'
  | 'learn_goal'
  | 'reorganize'
  | 'query_day'
  | 'query_deadlines'
  | 'conflicts'
  | 'help'
  | 'greeting'
  | 'unknown'

export function detectIntent(input: string): Intent {
  const s = norm(input)
  if (!s) return 'unknown'
  if (/^(oi|ola|bom dia|boa tarde|boa noite|e ai|hey)\b[!. ]*$/.test(s)) return 'greeting'
  if (/^(ajuda|socorro|help)[?!. ]*$/.test(s) || /\b(o que voce (faz|sabe|consegue)|como (funciona|te usar)|comandos)\b/.test(s)) return 'help'
  if (/\b(reorganiz|replanej|perdi|nao consegui|atrasei|imprevisto|deu errado|sai do plano)/.test(s)) return 'reorganize'
  if (/\b(prova|exame|teste|vestibular|simulado|enem|avaliacao)\b/.test(s) && /\b(estudar|estudo|revisar|materia|preparar|cronograma|plano)/.test(s))
    return 'exam_plan'
  if (/\b(quero|gostaria de|pretendo|vou) (aprender|ler|estudar|treinar|praticar|economizar|juntar|correr|conseguir)\b.*\b(em|ate|durante) (\d+|um|uma|dois|duas|tres|quatro|cinco|seis|doze) (dias?|semanas?|mes|meses|anos?)\b/.test(s))
    return 'learn_goal'
  if (/\b(quero|gostaria de|meu objetivo|minha meta)\b.*\b(aprender|ler \d|livros|idioma)/.test(s)) return 'learn_goal'
  if (/\btenho\b.*\b(livres?|sobrando|disponive(l|is))\b/.test(s) || /\bo que (posso|consigo) (adiantar|fazer)\b/.test(s)) return 'free_time'
  if (/\b(organiz|planej|acumulad|sobrecarregad|muita coisa|atolad|montar (a|minha) semana)/.test(s)) return 'organize_week'
  if (/\bconflito/.test(s)) return 'conflicts'
  if (/\b(prazos?|atrasad|vencend|vence)\b/.test(s) && /\b(quais|tem|tenho|mostra|ver|liste?)\b/.test(s)) return 'query_deadlines'
  if (/\b(o que|quais|mostra|como)\b.*\b(tenho|agenda|compromissos?|tarefas?)\b.*\b(hoje|amanha|semana|dia)\b/.test(s) || /^(agenda|minha agenda)( de)? (hoje|amanha)/.test(s))
    return 'query_day'
  if (/\b(reuniao|consulta|compromisso|evento|encontro|aula|aniversario|dentista|medico|jantar com|almoco com)\b/.test(s) && /\b(marc|marq|agend|adicion|cri|tenho|coloc|tem)/.test(s))
    return 'add_event'
  if (/^(marc|marq|agend)/.test(s) && parseTimeIn(s)) return 'add_event'
  if (/\b(adiciona|adicione|adicionar|cria|crie|criar|anota|anote|lembra|lembre|lembrete|tarefa|coloca|coloque|preciso|tenho que)\b/.test(s)) return 'add_task'
  return 'unknown'
}

/** Extrai uma lista de matérias: "matemática, português e história". */
export function parseList(input: string): string[] {
  const s = input.replace(/\s+/g, ' ')
  const m = s.match(/(?:estudar|revisar|materias?:?|de|sobre)\s+([A-Za-zÀ-ú]+(?:\s*,\s*[A-Za-zÀ-ú]+)*\s+e\s+[A-Za-zÀ-ú]+)/i)
  if (!m) return []
  return m[1]
    .split(/\s*,\s*|\s+e\s+/i)
    .map((x) => x.trim())
    .filter((x) => x && !['as', 'os', 'a', 'o'].includes(x.toLowerCase()))
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
}

export function parseCount(input: string, nouns: string): number | null {
  const s = norm(input)
  const m = s.match(new RegExp(`\\b${NUM} (${nouns})\\b`))
  return m ? toNumber(m[1]) : null
}
