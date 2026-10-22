import { Cpu, Info, Send, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ProposalList } from '../components/Proposals'
import { Modal } from '../components/ui'
import { respond } from '../lib/assistant'
import { AiError, aiLabel, aiReady, aiRespond } from '../lib/ai'
import { patch, removeMany, save, useData, useSettings } from '../lib/store'
import type { ChatMessage, Proposal } from '../lib/types'
import { attempt, confirm, navigate } from '../lib/ui'

const SUGGESTIONS = [
  'Tenho prova sexta e preciso estudar três matérias.',
  'Estou com muita coisa acumulada. Me ajuda a organizar a semana?',
  'Quero aprender francês em três meses.',
  'Tenho duas horas livres hoje. O que posso adiantar?',
  'Adicione uma tarefa para amanhã às 15h: revisar anotações',
  'Reorganize meu planejamento sem tirar meu tempo de descanso.',
  'O que tenho hoje?',
  'Quais são meus prazos?',
]

export default function Assistant() {
  const data = useData()
  const settings = useSettings()
  const [text, setText] = useState('')
  const [info, setInfo] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [useAi, setUseAi] = useState(() => {
    try {
      return localStorage.getItem('assistente-usar-ia') !== 'nao'
    } catch {
      return true
    }
  })
  const ready = aiReady(settings.ai)
  const aiOn = ready && useAi
  const scroll = useRef<HTMLDivElement>(null)
  const messages = [...data.chat].sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, thinking])

  async function send(msg: string) {
    const m = msg.trim()
    if (!m || thinking) return
    setText('')
    const ok = await attempt(() => save('chat', { role: 'user', text: m } as Omit<ChatMessage, 'id' | 'createdAt' | 'updatedAt'>))
    if (!ok) return
    setThinking(true)
    // Respostas são calculadas localmente; um pequeno atraso só deixa a leitura mais natural.
    await new Promise((r) => setTimeout(r, 250))
    try {
      let r: { text: string; explanation?: string[]; proposals?: Proposal[]; source: string } | null = null
      let notice = ''
      if (aiOn) {
        if (!navigator.onLine) notice = 'Sem internet — respondi com as regras locais.'
        else
          try {
            r = await aiRespond(m, messages, data, settings)
          } catch (e) {
            notice = e instanceof AiError ? e.message : 'A IA não respondeu. Usei as regras locais.'
          }
      }
      if (!r) {
        const local = respond(m, { data, settings, now: new Date() })
        r = { ...local, source: 'Regras locais', explanation: [...(notice ? [`⚠️ ${notice}`] : []), ...(local.explanation ?? [])] }
      }
      await save('chat', { role: 'assistant', text: r.text, explanation: r.explanation, proposals: r.proposals, source: r.source } as Omit<ChatMessage, 'id' | 'createdAt' | 'updatedAt'>)
    } catch (e) {
      await attempt(() => save('chat', { role: 'assistant', text: `Algo deu errado ao processar seu pedido (${(e as Error).message}). Nada foi alterado.` } as Omit<ChatMessage, 'id' | 'createdAt' | 'updatedAt'>))
    } finally {
      setThinking(false)
    }
  }

  async function clear() {
    if (await confirm({ title: 'Apagar conversa?', body: 'O histórico desta conversa será apagado. Tarefas e eventos já criados continuam salvos.', confirmLabel: 'Apagar', danger: true }))
      await attempt(() => removeMany('chat', data.chat.map((c) => c.id)), 'Conversa apagada.')
  }

  return (
    <div className="page">
      <div className="row between wrap" style={{ marginBottom: 10 }}>
        <div className="row">
          <span className="icon-tile" style={{ borderRadius: '50%' }}>
            <Sparkles size={19} />
          </span>
          <div>
            <h1 style={{ fontSize: 26 }}>Life OS AI</h1>
            <button
              className="mode-pill"
              style={{ border: 0, cursor: ready ? 'pointer' : 'default' }}
              title={ready ? 'Alternar entre IA e regras locais' : 'Configure uma IA gratuita em Configurações'}
              onClick={() => {
                if (!ready) return navigate('configuracoes?secao=ia')
                const v = !useAi
                setUseAi(v)
                try {
                  localStorage.setItem('assistente-usar-ia', v ? 'sim' : 'nao')
                } catch {
                  /* sem armazenamento */
                }
              }}
            >
              {aiOn ? <><Sparkles size={12} /> IA: {aiLabel(settings.ai)}</> : <><Cpu size={12} /> Regras locais{ready ? ' (toque para usar IA)' : ' · ativar IA grátis'}</>}
            </button>
          </div>
        </div>
        <div className="row">
          <button className="btn sm ghost" onClick={() => setInfo(true)}>
            <Info size={15} /> Como funciona
          </button>
          {messages.length > 0 && (
            <button className="icon-btn" aria-label="Apagar conversa" onClick={clear}>
              <Trash2 size={17} />
            </button>
          )}
        </div>
      </div>

      <div className="chat">
        <div className="chat-scroll" ref={scroll} aria-live="polite">
          {messages.length === 0 && (
            <div className="msg assistant">
              <span className="avatar">
                <Sparkles size={15} />
              </span>
              <div className="bubble">
                <p>
                  Olá{settings.name ? `, ${settings.name}` : ''}! Escreva do seu jeito o que precisa organizar. Eu leio suas tarefas, compromissos e horários livres e preparo
                  propostas — <b>nada muda sem você aceitar</b>.
                </p>
                <p className="small muted" style={{ marginTop: 8 }}>
                  Funciono por regras dentro do seu aparelho: sem internet, sem custo e sem enviar seus dados para lugar nenhum.
                </p>
              </div>
            </div>
          )}
          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="msg user">
                {m.text}
              </div>
            ) : (
              <div key={m.id} className="msg assistant">
                <span className="avatar">
                  <Sparkles size={15} />
                </span>
                <div className="bubble">
                  <p style={{ whiteSpace: 'pre-wrap' }}>{m.text}</p>
                  {m.explanation && m.explanation.length > 0 && (
                    <ul>
                      {m.explanation.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  )}
                  {m.proposals && m.proposals.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <ProposalList proposals={m.proposals} onChange={(p: Proposal[]) => attempt(() => patch('chat', m.id, { proposals: p }))} />
                    </div>
                  )}
                  {m.source && <div className="tiny faint" style={{ marginTop: 8 }}>{m.source === 'Regras locais' ? 'Regras locais (sem IA)' : `Gerado por IA · ${m.source} · confira antes de aceitar`}</div>}
                </div>
              </div>
            ),
          )}
          {thinking && (
            <div className="msg assistant">
              <span className="avatar">
                <Sparkles size={15} />
              </span>
              <div className="bubble small muted">{aiOn ? 'Pensando com a IA…' : 'Analisando suas tarefas e horários…'}</div>
            </div>
          )}
        </div>

        {messages.length < 2 && (
          <div className="suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chip" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault()
            send(text)
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Digite sua mensagem…" aria-label="Mensagem para o assistente" maxLength={500} />
          <button className="send" type="submit" disabled={!text.trim() || thinking} aria-label="Enviar">
            <Send size={17} />
          </button>
        </form>
      </div>

      {info && (
        <Modal title="Como o Life OS AI funciona" onClose={() => setInfo(false)}>
          <div className="stack small">
            <p>
              O assistente tem <b>dois modos</b>. O modo atual aparece na etiqueta abaixo do título — toque nela para alternar.
            </p>
            <p>
              <b>1. Regras locais (padrão, sempre disponível):</b> um planejador escrito para o Life OS que roda no seu aparelho, sem internet e sem enviar nada. Não é
              uma IA generativa: reconhece pedidos comuns em português — datas ("amanhã", "sexta", "25/12"), horários ("às 15h"), durações ("2 horas livres"), criar
              tarefas e compromissos, plano para prova, organizar a semana, tempo livre, dividir objetivos e reorganizar o dia. Frases muito diferentes ele avisa que não
              entendeu, em vez de inventar.
            </p>
            <p>
              <b>2. IA generativa gratuita (opcional):</b> se você colocar uma chave gratuita da Groq ou do Google Gemini em Configurações → Inteligência artificial,
              o assistente passa a entender pedidos livres. A cada mensagem são enviados ao provedor: seu pedido, as últimas mensagens, tarefas pendentes, compromissos
              das próximas 2 semanas, horários livres, descansos, objetivos e estudos. <b>Diário, memórias e finanças nunca são enviados.</b>
            </p>
            <p>
              <b>Segurança:</b> nos dois modos, nada é salvo sem você aceitar. As sugestões da IA são conferidas pelo app (datas válidas, conflitos com compromissos e
              descansos) antes de aparecer; o que não passa é descartado e explicado. Sem internet, sem chave ou se o limite gratuito acabar, o app usa as regras locais.
            </p>
            <p className="muted">As sugestões são apoio à organização e não garantem resultados. A IA pode errar — confira antes de aceitar.</p>
          </div>
        </Modal>
      )}
    </div>
  )
}
