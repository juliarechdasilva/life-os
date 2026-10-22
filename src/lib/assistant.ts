// Life OS AI — assistente local por regras.
// Interpreta o pedido, consulta os dados do app e devolve uma resposta
// com PROPOSTAS. Nenhuma alteração é feita sem o usuário aceitar.
import { addDays, addMonths, diffDays, fmtDuration, fmtRelative, fromMin, nowMin, toMin, today } from './dates'
import {
  cleanTitle,
  detectIntent,
  norm,
  parseCount,
  parseDateIn,
  parseDurationIn,
  parseList,
  parsePriority,
  parseTimeIn,
  toNumber,
} from './nlp'
import { freeSlots, plan } from './planner'
import { eventOccurrences, findConflicts } from './recurrence'
import { patch, save, saveMany, uid } from './store'
import { isDone, isOverdue, newTask, PRIORITY_LABEL, sortByUrgency, scoreReason } from './tasks'
import type { Data, Exam, Goal, Proposal, Settings, Task } from './types'

export interface Reply {
  text: string
  explanation?: string[]
  proposals?: Proposal[]
}

interface Ctx {
  data: Data
  settings: Settings
  now: Date
}

export function respond(message: string, ctx: Ctx): Reply {
  const intent = detectIntent(message)
  switch (intent) {
    case 'greeting':
      return { text: `Olá${ctx.settings.name ? ', ' + ctx.settings.name : ''}! Me conte o que precisa organizar — por exemplo "adicione uma tarefa para amanhã às 15h" ou "tenho duas horas livres, o que posso adiantar?".` }
    case 'help':
      return help()
    case 'add_task':
      return addTask(message, ctx)
    case 'add_event':
      return addEvent(message, ctx)
    case 'exam_plan':
      return examPlan(message, ctx)
    case 'organize_week':
      return organizeWeek(message, ctx)
    case 'free_time':
      return freeTime(message, ctx)
    case 'learn_goal':
      return learnGoal(message, ctx)
    case 'reorganize':
      return reorganize(message, ctx)
    case 'query_day':
      return queryDay(message, ctx)
    case 'query_deadlines':
      return deadlines(ctx)
    case 'conflicts':
      return conflicts(ctx)
    default:
      return {
        text: 'Não consegui entender esse pedido com as regras que conheço. Tente uma frase mais direta, como:',
        explanation: [
          '"Adicione uma tarefa para sexta: entregar relatório"',
          '"Marque dentista amanhã às 14h"',
          '"Tenho prova sexta e preciso estudar matemática, português e história"',
          '"Tenho 2 horas livres hoje"',
          '"Organize minha semana"',
          '"Perdi duas horas hoje e não consegui estudar"',
          '"Quero aprender francês em três meses"',
        ],
      }
  }
}

function help(): Reply {
  return {
    text: 'Sou o assistente local do Life OS. Funciono por regras dentro do seu aparelho — não sou um modelo de IA generativa e não envio seus dados para lugar nenhum. Eu consigo:',
    explanation: [
      'Criar tarefas e compromissos a partir de frases ("dentista amanhã às 14h").',
      'Montar um plano de estudos até uma prova.',
      'Organizar sua semana encaixando tarefas nos horários livres.',
      'Sugerir o que fazer quando você tem um tempo livre.',
      'Dividir objetivos grandes em etapas.',
      'Reorganizar o dia quando algo sai do planejado.',
      'Mostrar sua agenda, prazos e conflitos.',
      'Tudo vira proposta: você aceita, edita ou recusa cada item.',
    ],
  }
}

function addTask(message: string, ctx: Ctx): Reply {
  const ref = today(ctx.now)
  const d = parseDateIn(message, ref)
  const t = parseTimeIn(message)
  const dur = parseDurationIn(message)
  const p = parsePriority(message)
  const title = cleanTitle(message, [d?.text ?? '', t?.text ?? '', dur?.text ?? ''])
  if (!title || title.length < 2) return { text: 'Qual é o título da tarefa? Ex.: "Adicione uma tarefa para amanhã: comprar presente".' }
  const isReminder = /lembr/.test(norm(message))
  const task: Partial<Task> & { title: string } = {
    title,
    dueDate: d?.date ?? (t ? ref : undefined),
    dueTime: t?.time,
    priority: p ?? 'media',
    estimateMin: dur?.minutes,
    tags: isReminder ? ['lembrete'] : [],
  }
  const exp: string[] = []
  exp.push(`Título: "${title}".`)
  exp.push(task.dueDate ? `Data: ${fmtRelative(task.dueDate, ref).toLowerCase()}${d ? ` (entendi "${d.text}")` : ' (horário sem data → hoje)'}.` : 'Sem data — fica na lista "Sem data".')
  if (t) exp.push(`Horário: ${t.time}.`)
  if (dur) exp.push(`Tempo estimado: ${fmtDuration(dur.minutes)}.`)
  exp.push(`Prioridade: ${PRIORITY_LABEL[task.priority!].toLowerCase()}${p ? '' : ' (padrão)'}.`)
  return {
    text: 'Preparei esta tarefa. Confira e confirme:',
    explanation: exp,
    proposals: [{ id: uid('p'), kind: 'create_task', task, reason: 'Criada a partir da sua mensagem.', status: 'pendente' }],
  }
}

function addEvent(message: string, ctx: Ctx): Reply {
  const ref = today(ctx.now)
  const d = parseDateIn(message, ref)
  const t = parseTimeIn(message)
  const dur = parseDurationIn(message)
  if (!t) return { ...addTask(message, ctx), text: 'Não encontrei um horário, então preparei como tarefa. Se for um compromisso, diga o horário (ex.: "às 14h").' }
  const title = cleanTitle(message, [d?.text ?? '', t.text, dur?.text ?? ''])
  const date = d?.date ?? ref
  const durationMin = dur?.minutes ?? 60
  const s = toMin(t.time)
  const conf = findConflicts(ctx.data.events, date, s, s + durationMin).map((o) => `${o.event.title} (${fromMin(o.startMin)}–${fromMin(o.endMin)})`)
  const exp = [`Compromisso: "${title}".`, `${fmtRelative(date, ref)}, ${t.time}–${fromMin(s + durationMin)}${dur ? '' : ' (duração padrão de 1h)'}.`]
  if (conf.length) exp.push(`Atenção: conflita com ${conf.join(', ')}. Você pode salvar mesmo assim ou ajustar o horário depois.`)
  return {
    text: conf.length ? 'Preparei o compromisso, mas encontrei um conflito de horário:' : 'Preparei este compromisso. Confira e confirme:',
    explanation: exp,
    proposals: [
      { id: uid('p'), kind: 'create_event', event: { title, date, start: t.time, durationMin }, conflicts: conf, reason: 'Criado a partir da sua mensagem.', status: 'pendente' },
    ],
  }
}

function examPlan(message: string, ctx: Ctx): Reply {
  const ref = today(ctx.now)
  const d = parseDateIn(message, ref)
  if (!d) return { text: 'Quando é a prova? Diga a data, por exemplo "prova sexta" ou "prova dia 30/10".' }
  const daysLeft = diffDays(d.date, ref)
  if (daysLeft < 0) return { text: 'Essa data já passou. Pode confirmar o dia da prova?' }
  let subjects = parseList(message)
  if (!subjects.length) {
    const n = parseCount(message, 'materias|materia|disciplinas|conteudos|assuntos|topicos') ?? 1
    const known = ctx.data.subjects.slice(0, n).map((s) => s.name)
    subjects = known.length >= n ? known : [...known, ...Array.from({ length: n - known.length }, (_, i) => `Matéria ${known.length + i + 1}`)]
  }
  const perDay = parseDurationIn(message)?.minutes
  const studyDays = Math.max(1, daysLeft) // estuda até a véspera (ou hoje se a prova for hoje/amanhã)
  const sessionMin = 50
  const proposals: Proposal[] = []
  const exp: string[] = []
  exp.push(`Prova em ${fmtRelative(d.date, ref).toLowerCase()} — ${daysLeft === 0 ? 'é hoje' : `faltam ${daysLeft} dia${daysLeft === 1 ? '' : 's'}`}.`)
  exp.push(`Matérias: ${subjects.join(', ')}.`)

  // Distribui sessões em rodízio até a véspera, 1 ou 2 por dia, com revisão final.
  const tasks: (Partial<Task> & { title: string })[] = []
  const perDayLimit = perDay ? Math.max(1, Math.floor(perDay / sessionMin)) : Math.min(3, subjects.length)
  let k = 0
  for (let i = 0; i < studyDays; i++) {
    const date = addDays(ref, i)
    if (date >= d.date && daysLeft > 0) break
    for (let j = 0; j < perDayLimit; j++) {
      const subj = subjects[k % subjects.length]
      const isLast = i === studyDays - 1 && daysLeft > 1
      tasks.push({
        title: `${isLast ? 'Revisar' : 'Estudar'} ${subj}`,
        dueDate: date,
        estimateMin: sessionMin,
        priority: 'alta',
        tags: ['estudos', 'prova'],
        categoryId: ctx.data.categories.find((c) => norm(c.name) === 'estudos')?.id,
        subjectId: ctx.data.subjects.find((s) => norm(s.name) === norm(subj))?.id,
      })
      k++
    }
  }
  // Encaixa nos horários livres para sugerir horários concretos
  const fake = tasks.map((t, i) => ({ ...newTask(t), id: `tmp${i}`, createdAt: '', updatedAt: '' }) as Task)
  const res = plan({ tasks: [...ctx.data.tasks, ...fake], events: ctx.data.events, settings: ctx.settings, now: ctx.now, horizonDays: Math.max(1, daysLeft + 1), onlyTaskIds: fake.map((f) => f.id), notBefore: Object.fromEntries(fake.map((f) => [f.id, f.dueDate!])), goals: ctx.data.goals })
  for (let i = 0; i < tasks.length; i++) {
    const slot = res.proposals.find((p) => p.taskId === `tmp${i}`)
    if (slot) Object.assign(tasks[i], { dueDate: slot.date, plannedDate: slot.date, plannedStart: slot.start, plannedEnd: slot.end })
    proposals.push({
      id: uid('p'),
      kind: 'create_task',
      task: tasks[i],
      reason: slot ? `Horário livre em ${fmtRelative(slot.date, ref).toLowerCase()}, ${slot.start}–${slot.end}.` : 'Sem horário livre encontrado — fica com data, sem horário.',
      status: 'pendente',
    })
  }
  proposals.unshift({
    id: uid('p'),
    kind: 'create_exam',
    exam: { title: `Prova — ${subjects.join(', ')}`, date: d.date, type: 'prova', topics: subjects.map((s) => ({ id: uid(), title: s, done: false })) },
    reason: 'Registra a prova no módulo de Estudos, com checklist por matéria.',
    status: 'pendente',
  })
  exp.push(`Sugiro ${tasks.length} sessões de ${sessionMin} min, alternando matérias${daysLeft > 1 ? ' e deixando a véspera para revisão' : ''}.`)
  exp.push('Pausas de 10 a 15 min entre sessões ajudam a manter o foco. Ajuste o que não fizer sentido para você.')
  if (res.unscheduled.length) exp.push(`${res.unscheduled.length} sessão(ões) não couberam em horários livres — ficam só com a data.`)
  exp.push('Isso é uma sugestão de organização; não garante resultado na prova.')
  return { text: `Aqui está um plano de estudos até a prova (${fmtRelative(d.date, ref).toLowerCase()}):`, explanation: exp, proposals }
}

function organizeWeek(_message: string, ctx: Ctx): Reply {
  const ref = today(ctx.now)
  const pending = ctx.data.tasks.filter((t) => !isDone(t))
  if (!pending.length)
    return { text: 'Você não tem tarefas pendentes cadastradas. Quando quiser, me diga o que precisa fazer e eu crio as tarefas.' }
  const res = plan({ tasks: ctx.data.tasks, events: ctx.data.events, settings: ctx.settings, now: ctx.now, horizonDays: 7, goals: ctx.data.goals })
  const overdue = pending.filter((t) => isOverdue(t, ref))
  const exp = [...res.explanation]
  if (overdue.length) exp.unshift(`Você tem ${overdue.length} tarefa${overdue.length === 1 ? '' : 's'} atrasada${overdue.length === 1 ? '' : 's'} — elas vêm primeiro.`)
  for (const u of res.unscheduled) exp.push(`"${u.task.title}": ${u.reason}`)
  exp.push(...res.warnings)
  return {
    text: res.proposals.length
      ? `Montei uma proposta para os próximos 7 dias com ${res.proposals.length} bloco${res.proposals.length === 1 ? '' : 's'}. Aceite, edite ou recuse cada um:`
      : 'Não encontrei espaço livre para encaixar as tarefas sem ultrapassar seu limite diário. Veja os detalhes:',
    explanation: exp,
    proposals: res.proposals,
  }
}

function freeTime(message: string, ctx: Ctx): Reply {
  const ref = today(ctx.now)
  const dur = parseDurationIn(message)?.minutes
  const slots = freeSlots(ref, { ...ctx.data, settings: ctx.settings, now: ctx.now })
  const available = dur ?? (slots[0] ? slots[0].end - slots[0].start : 60)
  const candidates = sortByUrgency(
    ctx.data.tasks.filter((t) => !isDone(t) && !(t.plannedDate && t.plannedDate > ref)),
    ref,
    ctx.data.goals,
  )
  if (!candidates.length) return { text: 'Você não tem tarefas pendentes. Aproveite o tempo livre — descanso também conta. 🌿' }
  const chosen: Task[] = []
  let used = 0
  const buffer = ctx.settings.planning.bufferMin
  for (const t of candidates) {
    const est = t.estimateMin ?? ctx.settings.planning.defaultTaskMin
    if (used + est + (chosen.length ? buffer : 0) <= available) {
      chosen.push(t)
      used += est + (chosen.length > 1 ? buffer : 0)
    }
  }
  if (!chosen.length)
    return { text: `Nenhuma tarefa pendente cabe em ${fmtDuration(available)}. A mais urgente é "${candidates[0].title}" — que tal adiantar só uma parte dela?` }
  let cur = Math.ceil((nowMin(ctx.now) + 5) / 15) * 15
  const proposals: Proposal[] = chosen.map((t) => {
    const est = t.estimateMin ?? ctx.settings.planning.defaultTaskMin
    const p: Proposal = { id: uid('p'), kind: 'schedule', taskId: t.id, title: t.title, date: ref, start: fromMin(cur), end: fromMin(cur + est), from: t.plannedDate && t.plannedStart && t.plannedEnd ? { date: t.plannedDate, start: t.plannedStart, end: t.plannedEnd } : undefined, reason: scoreReason(t, ref) + `; leva cerca de ${est} min.`, status: 'pendente' }
    cur += est + buffer
    return p
  })
  const conflictsNow = eventOccurrences(ctx.data.events, ref, ref).filter((o) => o.startMin < cur && o.endMin > nowMin(ctx.now))
  const exp = [
    `Com ${fmtDuration(available)}${dur ? '' : ' (seu próximo intervalo livre)'}, escolhi as tarefas mais urgentes que cabem, com ${buffer} min de respiro entre elas.`,
    `Total: ${fmtDuration(used)}. Sobra tempo? Melhor ainda — não precisa preencher tudo.`,
  ]
  if (conflictsNow.length) exp.push(`Atenção: há compromisso nesse período (${conflictsNow.map((o) => o.event.title).join(', ')}). Confira antes de aceitar.`)
  return { text: 'Sugestão para agora:', explanation: exp, proposals }
}

function learnGoal(message: string, ctx: Ctx): Reply {
  const ref = today(ctx.now)
  const s = norm(message)
  const m = s.match(/(\d+|um|uma|dois|duas|tres|quatro|cinco|seis|doze) (dias?|semanas?|mes|meses|anos?)/)
  const n = m ? toNumber(m[1]) : 3
  const unit = m?.[2] ?? 'meses'
  const target = unit.startsWith('dia') ? addDays(ref, n) : unit.startsWith('semana') ? addDays(ref, n * 7) : unit.startsWith('ano') ? addMonths(ref, n * 12) : addMonths(ref, n)
  const what = cleanTitle(
    message.replace(/^.*?\b(quero|gostaria de|pretendo|vou|meu objetivo é|minha meta é)\s+/i, '').replace(/\s+(em|até|durante)\s+\S+\s+(dias?|semanas?|m[eê]s|meses|anos?)\b.*$/i, ''),
    [],
  )
  const totalDays = diffDays(target, ref)
  const phases = unit.startsWith('mes') || unit.startsWith('ano') ? Math.min(12, Math.max(2, unit.startsWith('ano') ? n * 4 : n)) : Math.min(6, Math.max(2, Math.round(totalDays / 7)))
  const isLang = /\b(ingles|frances|espanhol|italiano|alemao|japones|coreano|chines|libras|idioma|lingua)\b/.test(s)
  const stepsTpl = isLang
    ? ['Base: pronúncia, saudações e 300 palavras essenciais', 'Gramática básica e frases do dia a dia', 'Escuta: séries/podcasts com legenda', 'Conversação: falar sozinho(a) ou com alguém', 'Leitura de textos simples', 'Revisão geral e avaliação do que aprendeu']
    : ['Definir o que significa "concluído" para este objetivo', 'Reunir materiais e montar a rotina', 'Primeira fase de prática', 'Segunda fase de prática', 'Revisar o progresso e ajustar o plano', 'Etapa final e celebração']
  const steps = Array.from({ length: phases }, (_, i) => {
    const tpl = stepsTpl[Math.min(i, stepsTpl.length - 1)]
    const until = addDays(ref, Math.round(((i + 1) * totalDays) / phases))
    return { id: uid(), title: `${tpl} (até ${until.split('-').reverse().slice(0, 2).join('/')})`, done: false }
  })
  const proposals: Proposal[] = [
    {
      id: uid('p'),
      kind: 'create_goal',
      goal: { name: what || 'Novo objetivo', targetDate: target, kind: 'projeto', steps, description: message },
      reason: `${phases} etapas distribuídas até ${fmtRelative(target, ref).toLowerCase()}.`,
      status: 'pendente',
    },
    {
      id: uid('p'),
      kind: 'create_task',
      task: { title: `Primeiro passo: ${steps[0].title.replace(/ \(até.*$/, '').toLowerCase()}`, dueDate: addDays(ref, 1), estimateMin: 30, priority: 'media' },
      reason: 'Uma primeira ação pequena e concreta para começar amanhã.',
      status: 'pendente',
    },
  ]
  return {
    text: `Transformei "${what}" em um projeto com etapas:`,
    explanation: [
      `Prazo: ${fmtRelative(target, ref).toLowerCase()} (${totalDays} dias).`,
      `Dividi em ${phases} etapas de tamanho parecido. Uma rotina curta e constante (ex.: 20–30 min por dia) costuma funcionar melhor do que sessões longas e raras.`,
      'Você pode criar um hábito em "Hábitos" para acompanhar a prática diária.',
      'Edite as etapas para que façam sentido para você.',
    ],
    proposals,
  }
}

function reorganize(message: string, ctx: Ctx): Reply {
  const ref = today(ctx.now)
  const s = norm(message)
  const lost = /\bperdi\b/.test(s) ? parseDurationIn(message)?.minutes : undefined
  const blocked = []
  // "perdi duas horas": considera que as próximas X horas também não estão disponíveis? Não —
  // o tempo perdido já passou. Blocos não feitos nesse período são replanejados.
  const m = nowMin(ctx.now)
  const missedWindowStart = lost ? m - lost : undefined
  if (/\b(agora|resto do dia|hoje nao consigo mais)\b/.test(s) && lost) blocked.push({ date: ref, start: m, end: m + lost, label: 'Indisponível' })
  const res = plan({ tasks: ctx.data.tasks, events: ctx.data.events, settings: ctx.settings, now: ctx.now, horizonDays: 7, blocked, goals: ctx.data.goals })
  const exp: string[] = []
  if (lost) exp.push(`Entendi que você perdeu cerca de ${fmtDuration(lost)}${missedWindowStart != null && missedWindowStart > 0 ? ` (aprox. ${fromMin(missedWindowStart)}–${fromMin(m)})` : ''}. Blocos planejados que já passaram e não foram concluídos entram no replanejamento.`)
  if (/\bdescanso|sem tirar|folga\b/.test(s)) exp.push('Seus períodos de descanso estão preservados — o planejador nunca agenda por cima deles.')
  exp.push(...res.explanation)
  for (const u of res.unscheduled) exp.push(`"${u.task.title}": ${u.reason}`)
  exp.push(...res.warnings)
  return {
    text: res.proposals.length ? 'Proposta de reorganização — revise cada mudança:' : 'Não encontrei nada que precise ser movido agora. Seu plano continua de pé.',
    explanation: exp,
    proposals: res.proposals,
  }
}

function queryDay(message: string, ctx: Ctx): Reply {
  const ref = today(ctx.now)
  const s = norm(message)
  const isWeek = /\bsemana\b/.test(s)
  const date = /\bamanha\b/.test(s) ? addDays(ref, 1) : ref
  const end = isWeek ? addDays(ref, 6) : date
  const occ = eventOccurrences(ctx.data.events, date, end)
  const tasks = ctx.data.tasks.filter((t) => !isDone(t) && ((t.dueDate && t.dueDate >= date && t.dueDate <= end) || (t.plannedDate && t.plannedDate >= date && t.plannedDate <= end)))
  const label = isWeek ? 'nesta semana' : fmtRelative(date, ref).toLowerCase()
  if (!occ.length && !tasks.length) return { text: `Nada cadastrado para ${label}. ${isWeek ? 'Semana' : 'Dia'} livre!` }
  const lines = [
    ...occ.map((o) => `📅 ${isWeek ? fmtRelative(o.date, ref) + ' ' : ''}${fromMin(o.startMin)} — ${o.event.title}`),
    ...tasks.map((t) => `☐ ${t.plannedStart ? t.plannedStart + ' — ' : t.dueTime ? t.dueTime + ' — ' : ''}${t.title}${isWeek && t.dueDate ? ` (${fmtRelative(t.dueDate, ref).toLowerCase()})` : ''}`),
  ]
  return { text: `Para ${label} você tem ${occ.length} compromisso${occ.length === 1 ? '' : 's'} e ${tasks.length} tarefa${tasks.length === 1 ? '' : 's'}:`, explanation: lines }
}

function deadlines(ctx: Ctx): Reply {
  const ref = today(ctx.now)
  const pend = ctx.data.tasks.filter((t) => !isDone(t) && t.dueDate && t.dueDate <= addDays(ref, 7))
  const exams = ctx.data.exams.filter((e) => e.date >= ref && e.date <= addDays(ref, 14))
  if (!pend.length && !exams.length) return { text: 'Nenhum prazo nos próximos 7 dias e nenhuma prova nas próximas 2 semanas.' }
  const lines = [
    ...sortByUrgency(pend, ref).map((t) => `${isOverdue(t, ref) ? '⚠️ atrasada' : fmtRelative(t.dueDate!, ref)} — ${t.title}`),
    ...exams.map((e) => `📝 ${fmtRelative(e.date, ref)} — ${e.title}`),
  ]
  return { text: 'Seus prazos mais próximos:', explanation: lines }
}

function conflicts(ctx: Ctx): Reply {
  const res = plan({ tasks: [], events: ctx.data.events, settings: ctx.settings, now: ctx.now, horizonDays: 30 })
  if (!res.warnings.length) return { text: 'Nenhum conflito entre compromissos nos próximos 30 dias. ✓' }
  return { text: 'Encontrei estes conflitos:', explanation: res.warnings }
}

// ---------- Aplicar propostas ----------

export async function applyProposal(p: Proposal, data: Data): Promise<void> {
  switch (p.kind) {
    case 'schedule': {
      const t = data.tasks.find((x) => x.id === p.taskId)
      if (!t) throw new Error(`A tarefa "${p.title}" não existe mais.`)
      await patch('tasks', t.id, { plannedDate: p.date, plannedStart: p.start, plannedEnd: p.end, dueDate: t.dueDate ?? undefined })
      return
    }
    case 'create_task':
      await save('tasks', newTask(p.task))
      return
    case 'create_event':
      await save('events', {
        description: '',
        location: '',
        exceptions: [],
        doneDates: [],
        reminderMin: 15,
        ...p.event,
      })
      return
    case 'create_goal': {
      const g: Omit<Goal, 'id' | 'createdAt' | 'updatedAt'> = {
        description: '',
        kind: 'objetivo',
        status: 'ativo',
        steps: [],
        notes: '',
        history: [{ date: new Date().toISOString(), text: 'Objetivo criado pelo assistente', progress: 0 }],
        ...p.goal,
      }
      await save('goals', g)
      return
    }
    case 'create_exam': {
      const e: Omit<Exam, 'id' | 'createdAt' | 'updatedAt'> = { type: 'prova', topics: [], checklist: defaultExamChecklist(), notes: '', ...p.exam }
      await save('exams', e)
      return
    }
  }
}

export function defaultExamChecklist() {
  return ['Revisar todo o conteúdo', 'Fazer exercícios / provas anteriores', 'Separar material (documento, caneta, calculadora)', 'Conferir local e horário', 'Dormir bem na véspera'].map((title) => ({ id: uid(), title, done: false }))
}

export async function applyMany(ps: Proposal[], data: Data) {
  const errors: string[] = []
  const tasks = ps.filter((p) => p.kind === 'create_task')
  try {
    if (tasks.length) await saveMany('tasks', tasks.map((p) => newTask((p as Extract<Proposal, { kind: 'create_task' }>).task)))
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }
  for (const p of ps.filter((p) => p.kind !== 'create_task')) {
    try {
      await applyProposal(p, data)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  return errors
}

/** Criação rápida: "Comprar pão amanhã 9h #casa !alta" → campos da tarefa. */
export function parseQuickTask(text: string, ref = today()): Partial<Task> & { title: string } {
  const tags = [...text.matchAll(/#([\p{L}\d_-]+)/gu)].map((m) => m[1].toLowerCase())
  let body = text.replace(/#[\p{L}\d_-]+/gu, '')
  let priority: Task['priority'] | undefined
  const pm = body.match(/!(baixa|media|média|alta|urgente)\b/i)
  if (pm) {
    priority = norm(pm[1]) as Task['priority']
    body = body.replace(pm[0], '')
  }
  const d = parseDateIn(body, ref)
  const t = parseTimeIn(body)
  const p = priority ?? parsePriority(body) ?? 'media'
  const title = cleanTitle(body, [d?.text ?? '', t?.text ?? '']) || body.trim()
  return { title, dueDate: d?.date ?? (t ? ref : undefined), dueTime: t?.time, priority: p, tags }
}
