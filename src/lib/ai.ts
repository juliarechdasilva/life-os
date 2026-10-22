// IA generativa OPCIONAL (Groq ou Google Gemini), com a chave gratuita da própria pessoa.
// - A chave fica só neste aparelho e não vai para o backup.
// - Só é enviado o necessário para planejar: tarefas, agenda, horários livres,
//   objetivos e estudos. Diário, memórias e finanças NUNCA são enviados.
// - A IA só sugere. As sugestões passam por validação local (datas, conflitos,
//   descansos) e viram propostas que a pessoa aceita ou recusa.
import { addDays, fromMin, isValidDate, isValidTime, toMin, today, WEEKDAYS_LONG, weekday } from './dates'
import { busyForDay, freeSlots, plan } from './planner'
import { eventOccurrences, findConflicts } from './recurrence'
import { uid } from './store'
import { isDone } from './tasks'
import type { AiSettings, ChatMessage, Data, Priority, Proposal, Settings } from './types'

export interface AiReply {
  text: string
  explanation: string[]
  proposals: Proposal[]
  source: string
}

export class AiError extends Error {
  kind: 'chave' | 'limite' | 'rede' | 'resposta' | 'modelo'
  constructor(message: string, kind: AiError['kind']) {
    super(message)
    this.kind = kind
  }
}

export const PROVIDER_INFO = {
  groq: {
    name: 'Groq',
    keyUrl: 'https://console.groq.com/keys',
    privacy: 'Por padrão, a Groq não guarda o conteúdo das requisições (pode manter registros por até 30 dias só para investigar abusos). Não exige cartão.',
  },
  gemini: {
    name: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    privacy: 'No plano gratuito, o Google pode usar o que for enviado para melhorar os produtos dele, e revisores humanos podem ler (sem vínculo com sua conta). Exige ter 18 anos ou mais. Não exige cartão.',
  },
} as const

export function aiReady(ai: AiSettings): boolean {
  if (!ai.consent || ai.provider === 'nenhum') return false
  return ai.provider === 'groq' ? ai.groqKey.trim().length > 10 : ai.geminiKey.trim().length > 10
}

export function aiLabel(ai: AiSettings): string {
  return ai.provider === 'groq' ? `Groq · ${ai.groqModel}` : ai.provider === 'gemini' ? `Gemini · ${ai.geminiModel}` : 'Regras locais'
}

const SYSTEM = `Você é o "Life OS AI", assistente de organização pessoal dentro do app Life OS. Responda SEMPRE em português do Brasil, de forma calorosa, breve e prática.

Você recebe o CONTEXTO (JSON) com a data/hora atual, tarefas pendentes, compromissos, horários livres já calculados, descansos, objetivos e estudos da pessoa.

REGRAS OBRIGATÓRIAS:
- Você NÃO altera nada diretamente: você propõe AÇÕES; a pessoa aceita ou recusa cada uma.
- Nunca mova nem apague compromissos (eventos). Nunca apague tarefas.
- Ao sugerir horários, use SOMENTE os "horariosLivres" do contexto; nunca sobreponha atividades; respeite os descansos; não preencha todo o tempo livre (respeite "limiteFocoMinPorDia").
- Datas no formato AAAA-MM-DD e horários HH:mm (24h), no fuso da pessoa. Interprete "amanhã", "sexta" etc. a partir de "hoje".
- Seja honesta: não prometa resultados, notas ou cronogramas perfeitos. Se faltar informação, pergunte (sem ações).
- Para reorganizar muitas tarefas na agenda, prefira a ação "planejar" (o app tem um planejador local seguro).
- Use os "id" exatos das tarefas existentes quando agendar uma tarefa existente.

Responda APENAS com um objeto JSON neste formato:
{
  "resposta": "texto curto para a pessoa",
  "explicacao": ["por que você sugeriu isso", "..."],
  "acoes": [
    {"tipo":"criar_tarefa","titulo":"...","data":"AAAA-MM-DD ou null","hora":"HH:mm ou null","prioridade":"baixa|media|alta|urgente","estimativaMin":30,"blocoInicio":"HH:mm ou null","blocoFim":"HH:mm ou null","motivo":"..."},
    {"tipo":"agendar_tarefa","tarefaId":"id existente","data":"AAAA-MM-DD","inicio":"HH:mm","fim":"HH:mm","motivo":"..."},
    {"tipo":"criar_evento","titulo":"...","data":"AAAA-MM-DD","inicio":"HH:mm","duracaoMin":60,"local":"","motivo":"..."},
    {"tipo":"criar_objetivo","nome":"...","dataAlvo":"AAAA-MM-DD ou null","etapas":["..."],"motivo":"..."},
    {"tipo":"criar_prova","titulo":"...","data":"AAAA-MM-DD","topicos":["..."],"motivo":"..."},
    {"tipo":"planejar","dias":7,"motivo":"..."}
  ]
}
"acoes" pode ser uma lista vazia quando for só uma conversa ou pergunta.`

/** Monta o contexto enviado à IA. Não inclui diário, memórias nem finanças. */
export function buildContext(data: Data, settings: Settings, now = new Date()) {
  const ref = today(now)
  const pending = data.tasks.filter((t) => !isDone(t)).slice(0, 80)
  const events = eventOccurrences(data.events, ref, addDays(ref, 13)).slice(0, 80)
  const free = []
  for (let i = 0; i < 7; i++) {
    const d = addDays(ref, i)
    free.push({ data: d, intervalos: freeSlots(d, { ...data, settings, now }, { withBuffer: true }).map((s) => `${fromMin(s.start)}-${fromMin(s.end)}`) })
  }
  return {
    agora: `${ref} ${fromMin(now.getHours() * 60 + now.getMinutes())}`,
    hoje: ref,
    diaDaSemana: WEEKDAYS_LONG[weekday(ref)],
    fuso: Intl.DateTimeFormat().resolvedOptions().timeZone,
    nome: settings.name || undefined,
    limiteFocoMinPorDia: settings.planning.maxFocusMinPerDay,
    duracaoPadraoTarefaMin: settings.planning.defaultTaskMin,
    descansos: settings.planning.rest.map((r) => ({ nome: r.label, inicio: r.start, fim: r.end })),
    horariosLivres: free,
    tarefasPendentes: pending.map((t) => ({
      id: t.id,
      titulo: t.title,
      vence: t.dueDate ?? null,
      hora: t.dueTime ?? null,
      prioridade: t.priority,
      estimativaMin: t.estimateMin ?? null,
      bloco: t.plannedDate ? `${t.plannedDate} ${t.plannedStart}-${t.plannedEnd}` : null,
    })),
    compromissos: events.map((o) => ({ titulo: o.event.title, data: o.date, inicio: fromMin(o.startMin), fim: fromMin(o.endMin) })),
    objetivos: data.goals.filter((g) => g.status === 'ativo').map((g) => ({ nome: g.name, prazo: g.targetDate ?? null, etapasPendentes: g.steps.filter((s) => !s.done).map((s) => s.title).slice(0, 8) })),
    materias: data.subjects.map((s) => s.name),
    provas: data.exams.filter((e) => e.date >= ref).map((e) => ({ titulo: e.title, data: e.date, topicosPendentes: e.topics.filter((t) => !t.done).map((t) => t.title) })),
  }
}

async function callGroq(ai: AiSettings, messages: { role: string; content: string }[], signal?: AbortSignal): Promise<string> {
  let res: Response
  try {
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.groqKey.trim()}` },
      body: JSON.stringify({ model: ai.groqModel, messages, temperature: 0.3, response_format: { type: 'json_object' } }),
      signal,
    })
  } catch {
    throw new AiError('Sem conexão com a Groq. Usei as regras locais.', 'rede')
  }
  if (!res.ok) throw httpError(res.status, await res.text().catch(() => ''))
  const j = await res.json()
  return j?.choices?.[0]?.message?.content ?? ''
}

async function callGemini(ai: AiSettings, system: string, messages: { role: string; content: string }[], signal?: AbortSignal): Promise<string> {
  let res: Response
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ai.geminiModel)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': ai.geminiKey.trim() },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
      }),
      signal,
    })
  } catch {
    throw new AiError('Sem conexão com o Gemini. Usei as regras locais.', 'rede')
  }
  if (!res.ok) throw httpError(res.status, await res.text().catch(() => ''))
  const j = await res.json()
  return j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
}

function httpError(status: number, body: string): AiError {
  if (status === 401 || status === 403 || /API key not valid|invalid_api_key/i.test(body)) return new AiError('A chave de IA foi recusada. Confira a chave em Configurações → Inteligência artificial.', 'chave')
  if (status === 429) return new AiError('O limite gratuito de uso da IA foi atingido por agora. Tente de novo em alguns minutos — enquanto isso, usei as regras locais.', 'limite')
  if (status === 404 || /model/i.test(body)) return new AiError('O modelo de IA configurado não está disponível. Troque o modelo em Configurações → Inteligência artificial.', 'modelo')
  return new AiError(`O serviço de IA respondeu com erro (${status}). Usei as regras locais.`, 'rede')
}

export function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  try {
    return JSON.parse(t)
  } catch {
    const a = t.indexOf('{')
    const b = t.lastIndexOf('}')
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1))
    throw new AiError('A IA respondeu em um formato inesperado. Tente reformular.', 'resposta')
  }
}

const PRIORITIES: Priority[] = ['baixa', 'media', 'alta', 'urgente']
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const num = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : undefined)

/** Converte a resposta da IA em propostas, descartando o que for inválido ou conflitante. */
export function toProposals(raw: unknown, data: Data, settings: Settings, now = new Date()): { text: string; explanation: string[]; proposals: Proposal[] } {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const text = str(o.resposta, 2000) || 'Pronto.'
  const explanation = Array.isArray(o.explicacao) ? o.explicacao.map((x) => str(x, 400)).filter(Boolean).slice(0, 10) : []
  const acts = Array.isArray(o.acoes) ? o.acoes.slice(0, 30) : []
  const proposals: Proposal[] = []
  const notes: string[] = []
  const ref = today(now)
  const taken: { date: string; s: number; e: number }[] = []
  const free = (date: string, s: number, e: number, ignoreTaskId?: string) => {
    if (date < ref || (date === ref && s < now.getHours() * 60 + now.getMinutes())) return 'fica no passado'
    if (findConflicts(data.events, date, s, e).length) return 'conflita com um compromisso'
    const busy = busyForDay(date, { tasks: data.tasks.filter((t) => t.id !== ignoreTaskId), events: [], settings })
    if (busy.some((b) => b.start < e && s < b.end)) return 'conflita com um descanso ou outra tarefa'
    if (taken.some((x) => x.date === date && x.s < e && s < x.e)) return 'coincide com outra sugestão'
    return null
  }

  for (const a of acts as Record<string, unknown>[]) {
    const tipo = str(a?.tipo)
    const motivo = str(a?.motivo, 300) || 'Sugestão da IA.'
    if (tipo === 'criar_tarefa') {
      const title = str(a.titulo)
      if (!title) continue
      const date = isValidDate(a.data) ? a.data : undefined
      const time = isValidTime(a.hora) && date ? a.hora : undefined
      const pri = PRIORITIES.includes(a.prioridade as Priority) ? (a.prioridade as Priority) : 'media'
      let block: { plannedDate: string; plannedStart: string; plannedEnd: string } | undefined
      if (date && isValidTime(a.blocoInicio) && isValidTime(a.blocoFim) && toMin(a.blocoFim) > toMin(a.blocoInicio)) {
        const why = free(date, toMin(a.blocoInicio), toMin(a.blocoFim))
        if (why) notes.push(`O horário sugerido para "${title}" ${why}; mantive só a data.`)
        else {
          block = { plannedDate: date, plannedStart: a.blocoInicio, plannedEnd: a.blocoFim }
          taken.push({ date, s: toMin(a.blocoInicio), e: toMin(a.blocoFim) })
        }
      }
      proposals.push({ id: uid('p'), kind: 'create_task', task: { title, dueDate: date, dueTime: time, priority: pri, estimateMin: num(a.estimativaMin, 5, 600), ...block }, reason: motivo, status: 'pendente' })
    } else if (tipo === 'agendar_tarefa') {
      const t = data.tasks.find((x) => x.id === a.tarefaId && !isDone(x))
      if (!t || !isValidDate(a.data) || !isValidTime(a.inicio) || !isValidTime(a.fim) || toMin(a.fim) <= toMin(a.inicio)) {
        notes.push('Descartei uma sugestão de agendamento com dados inválidos.')
        continue
      }
      const why = free(a.data, toMin(a.inicio), toMin(a.fim), t.id)
      if (why) {
        notes.push(`A IA sugeriu "${t.title}" em ${a.data.split('-').reverse().join('/')} ${a.inicio}, mas ${why} — descartei.`)
        continue
      }
      taken.push({ date: a.data, s: toMin(a.inicio), e: toMin(a.fim) })
      proposals.push({ id: uid('p'), kind: 'schedule', taskId: t.id, title: t.title, date: a.data, start: a.inicio, end: a.fim, from: t.plannedDate && t.plannedStart && t.plannedEnd ? { date: t.plannedDate, start: t.plannedStart, end: t.plannedEnd } : undefined, reason: motivo, status: 'pendente' })
    } else if (tipo === 'criar_evento') {
      const title = str(a.titulo)
      const dur = num(a.duracaoMin, 5, 24 * 60) ?? 60
      if (!title || !isValidDate(a.data) || !isValidTime(a.inicio) || toMin(a.inicio) + dur > 24 * 60) {
        notes.push('Descartei uma sugestão de compromisso com data ou horário inválido.')
        continue
      }
      const s = toMin(a.inicio)
      const conflicts = findConflicts(data.events, a.data, s, s + dur).map((x) => `${x.event.title} (${fromMin(x.startMin)}–${fromMin(x.endMin)})`)
      proposals.push({ id: uid('p'), kind: 'create_event', event: { title, date: a.data, start: a.inicio, durationMin: dur, location: str(a.local) }, conflicts, reason: motivo, status: 'pendente' })
    } else if (tipo === 'criar_objetivo') {
      const name = str(a.nome)
      if (!name) continue
      const steps = Array.isArray(a.etapas) ? a.etapas.map((x) => str(x)).filter(Boolean).slice(0, 20) : []
      proposals.push({ id: uid('p'), kind: 'create_goal', goal: { name, targetDate: isValidDate(a.dataAlvo) ? a.dataAlvo : undefined, kind: steps.length ? 'projeto' : 'objetivo', steps: steps.map((title) => ({ id: uid(), title, done: false })) }, reason: motivo, status: 'pendente' })
    } else if (tipo === 'criar_prova') {
      const title = str(a.titulo)
      if (!title || !isValidDate(a.data)) continue
      const topics = Array.isArray(a.topicos) ? a.topicos.map((x) => str(x)).filter(Boolean).slice(0, 30) : []
      proposals.push({ id: uid('p'), kind: 'create_exam', exam: { title, date: a.data, type: 'prova', topics: topics.map((t) => ({ id: uid(), title: t, done: false })) }, reason: motivo, status: 'pendente' })
    } else if (tipo === 'planejar') {
      const r = plan({ tasks: data.tasks, events: data.events, goals: data.goals, settings, now, horizonDays: num(a.dias, 1, 14) ?? 7 })
      for (const p of r.proposals) if (!taken.some((x) => x.date === p.date && x.s < toMin(p.end) && toMin(p.start) < x.e)) proposals.push(p)
      for (const u of r.unscheduled) notes.push(`"${u.task.title}": ${u.reason}`)
      notes.push(...r.warnings)
      if (r.proposals.length) notes.push('Os horários foram calculados pelo planejador local (respeita compromissos, descansos e seu limite diário).')
    }
  }
  return { text, explanation: [...explanation, ...notes], proposals }
}

export async function aiRespond(message: string, history: ChatMessage[], data: Data, settings: Settings, signal?: AbortSignal): Promise<AiReply> {
  const ai = settings.ai
  const now = new Date()
  const ctx = buildContext(data, settings, now)
  const past = history.slice(-6).map((m) => ({ role: m.role, content: m.text.slice(0, 1500) }))
  const messages = [...past, { role: 'user', content: `CONTEXTO:\n${JSON.stringify(ctx)}\n\nPEDIDO:\n${message}` }]
  const raw =
    ai.provider === 'groq'
      ? await callGroq(ai, [{ role: 'system', content: SYSTEM }, ...messages], signal)
      : await callGemini(ai, SYSTEM, messages, signal)
  if (!raw.trim()) throw new AiError('A IA não retornou resposta. Usei as regras locais.', 'resposta')
  const r = toProposals(parseJson(raw), data, settings, now)
  return { ...r, source: aiLabel(ai) }
}

/** Testa a chave com uma chamada mínima (sem dados pessoais). */
export async function testAi(ai: AiSettings): Promise<string> {
  const msg = [{ role: 'user', content: 'Responda apenas com o JSON {"ok": true}.' }]
  const raw = ai.provider === 'groq' ? await callGroq(ai, msg) : await callGemini(ai, 'Responda em JSON.', msg)
  parseJson(raw)
  return aiLabel(ai)
}
