// Modelo de dados do Life OS. Datas são strings locais:
//   DateStr  = 'AAAA-MM-DD' (dia no fuso local)
//   TimeStr  = 'HH:mm' (24h, fuso local)
// Isso evita deslocamentos de fuso ao salvar/ler.

export type ID = string
export type DateStr = string
export type TimeStr = string

export interface Base {
  id: ID
  createdAt: string // ISO
  updatedAt: string // ISO
}

export type Freq = 'diaria' | 'dias_uteis' | 'semanal' | 'mensal' | 'anual'

export interface Recurrence {
  freq: Freq
  interval: number // a cada N (dias/semanas/meses)
  weekdays?: number[] // 0=domingo … 6=sábado (para 'semanal')
  until?: DateStr
}

export interface Category extends Base {
  name: string
  color: string // chave da paleta (ver CATEGORY_COLORS)
}

export type Priority = 'baixa' | 'media' | 'alta' | 'urgente'
export type TaskStatus = 'a_fazer' | 'em_andamento' | 'concluida'

export interface Subtask {
  id: ID
  title: string
  done: boolean
}

export interface Task extends Base {
  title: string
  description: string
  dueDate?: DateStr
  dueTime?: TimeStr
  priority: Priority
  categoryId?: ID
  status: TaskStatus
  estimateMin?: number
  subtasks: Subtask[]
  tags: string[]
  recurrence?: Recurrence
  goalId?: ID
  subjectId?: ID
  eventId?: ID
  notes: string
  order: number
  completedAt?: string
  // Bloco planejado (pelo usuário ou aceito do planejador)
  plannedDate?: DateStr
  plannedStart?: TimeStr
  plannedEnd?: TimeStr
}

export interface CalEvent extends Base {
  title: string
  description: string
  date: DateStr
  start: TimeStr
  durationMin: number
  location: string
  categoryId?: ID
  recurrence?: Recurrence
  reminderMin?: number | null
  exceptions: DateStr[] // ocorrências removidas de uma série
  doneDates: DateStr[] // ocorrências concluídas
}

export interface Step {
  id: ID
  title: string
  done: boolean
  doneAt?: string
}

export interface GoalLog {
  date: string // ISO
  text: string
  progress: number
}

export interface Goal extends Base {
  name: string
  description: string
  categoryId?: ID
  targetDate?: DateStr
  kind: 'objetivo' | 'projeto'
  status: 'ativo' | 'pausado' | 'concluido'
  steps: Step[]
  notes: string
  history: GoalLog[]
}

export interface Material {
  id: ID
  title: string
  url: string
  note: string
}

export interface Subject extends Base {
  name: string
  color: string
  weeklyGoalMin: number
  notes: string
  materials: Material[]
}

export interface CheckItem {
  id: ID
  title: string
  done: boolean
}

export interface Exam extends Base {
  subjectId?: ID
  title: string
  type: 'prova' | 'trabalho'
  date: DateStr
  time?: TimeStr
  topics: CheckItem[]
  checklist: CheckItem[]
  notes: string
}

export interface StudySession extends Base {
  subjectId?: ID
  date: DateStr
  start: TimeStr
  durationMin: number
  content: string
}

export interface Review extends Base {
  subjectId?: ID
  topic: string
  dueDate: DateStr
  done: boolean
}

export type HabitFreq =
  | { type: 'diaria' }
  | { type: 'dias'; days: number[] }
  | { type: 'vezes_semana'; times: number }

export interface Habit extends Base {
  name: string
  target: string
  color: string
  frequency: HabitFreq
  paused: boolean
  reminderTime?: TimeStr
  log: Record<DateStr, 'feito' | 'descanso'>
  order: number
}

export interface FinCategory extends Base {
  name: string
  color: string
  kind: 'despesa' | 'receita'
  monthlyLimitCents?: number
}

export interface Transaction extends Base {
  type: 'receita' | 'despesa'
  amountCents: number
  date: DateStr
  description: string
  categoryId?: ID
  recurring: boolean
  notes: string
}

export interface Contribution {
  id: ID
  date: DateStr
  amountCents: number
  note: string
}

export interface SavingsGoal extends Base {
  name: string
  targetCents: number
  targetDate?: DateStr
  contributions: Contribution[]
}

export interface Attachment {
  id: ID // chave em 'files'
  name: string
  type: string
  size: number
}

export interface JournalEntry extends Base {
  date: DateStr
  title: string
  text: string
  tags: string[]
  important: boolean
  mood?: 1 | 2 | 3 | 4 | 5
  attachments: Attachment[]
}

export interface MemoryItem extends Base {
  date: DateStr
  title: string
  text: string
  kind: 'momento' | 'viagem' | 'conquista' | 'experiencia'
  place: string
  attachments: Attachment[]
}

export interface Note extends Base {
  text: string
  pinned: boolean
}

export interface StoredFile {
  id: ID
  blob: Blob
  iv?: string // presente quando o arquivo está criptografado
}

export interface ChatMessage extends Base {
  role: 'user' | 'assistant'
  text: string
  explanation?: string[]
  proposals?: Proposal[]
  resolved?: boolean
  source?: string // 'regras' ou nome do modelo de IA
}

// ---------- Propostas do planejador / assistente ----------

export type Proposal =
  | {
      id: ID
      kind: 'schedule'
      taskId: ID
      title: string
      date: DateStr
      start: TimeStr
      end: TimeStr
      from?: { date: DateStr; start: TimeStr; end: TimeStr }
      reason: string
      status: 'pendente' | 'aceita' | 'rejeitada'
    }
  | {
      id: ID
      kind: 'create_task'
      task: Partial<Task> & { title: string }
      reason: string
      status: 'pendente' | 'aceita' | 'rejeitada'
    }
  | {
      id: ID
      kind: 'create_event'
      event: Partial<CalEvent> & { title: string; date: DateStr; start: TimeStr; durationMin: number }
      reason: string
      conflicts: string[]
      status: 'pendente' | 'aceita' | 'rejeitada'
    }
  | {
      id: ID
      kind: 'create_goal'
      goal: Partial<Goal> & { name: string }
      reason: string
      status: 'pendente' | 'aceita' | 'rejeitada'
    }
  | {
      id: ID
      kind: 'create_exam'
      exam: Partial<Exam> & { title: string; date: DateStr }
      reason: string
      status: 'pendente' | 'aceita' | 'rejeitada'
    }

// ---------- Configurações ----------

export interface DayAvailability {
  enabled: boolean
  start: TimeStr
  end: TimeStr
}

export interface RestPeriod {
  id: ID
  label: string
  start: TimeStr
  end: TimeStr
  days: number[]
}

export interface Settings {
  id: 'settings'
  name: string
  onboarded: boolean
  theme: 'sistema' | 'claro' | 'escuro'
  weekStart: 0 | 1
  timeFormat: '24h' | '12h'
  notifications: {
    enabled: boolean
    tasks: boolean
    events: boolean
    habits: boolean
    study: boolean
    leadMin: number
  }
  planning: {
    availability: DayAvailability[] // índice = dia da semana (0=domingo)
    rest: RestPeriod[]
    maxFocusMinPerDay: number
    bufferMin: number
    defaultTaskMin: number
  }
  pomodoro: { focusMin: number; shortMin: number; longMin: number; cycles: number }
  journalLock: { enabled: boolean; hash?: string; salt?: string; encrypted?: boolean; check?: string }
  ai: AiSettings
  lastBackupAt?: string
}

export type AiProvider = 'nenhum' | 'groq' | 'gemini'
export interface AiSettings {
  provider: AiProvider
  groqKey: string
  geminiKey: string
  groqModel: string
  geminiModel: string
  consent: boolean // aceitou enviar o contexto (tarefas, agenda) ao provedor
}

export interface Data {
  tasks: Task[]
  events: CalEvent[]
  categories: Category[]
  goals: Goal[]
  subjects: Subject[]
  exams: Exam[]
  sessions: StudySession[]
  reviews: Review[]
  habits: Habit[]
  transactions: Transaction[]
  finCategories: FinCategory[]
  savings: SavingsGoal[]
  journal: JournalEntry[]
  memories: MemoryItem[]
  notes: Note[]
  chat: ChatMessage[]
}

export type Collection = keyof Data
export type ItemOf<C extends Collection> = Data[C][number]

export const COLLECTIONS: Collection[] = [
  'tasks',
  'events',
  'categories',
  'goals',
  'subjects',
  'exams',
  'sessions',
  'reviews',
  'habits',
  'transactions',
  'finCategories',
  'savings',
  'journal',
  'memories',
  'notes',
  'chat',
]
