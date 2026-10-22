import { Bell, Bot, Database, Eye, EyeOff, ExternalLink, Download, HardDrive, Lock, Palette, Plus, Shield, SlidersHorizontal, Tag, Trash2, Upload, User } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ColorPick, Field, Modal, Seg, Switch, WeekdayPick } from '../components/ui'
import { buildBackup, protectBackup, shareOrDownload, validateBackup } from '../lib/backup'
import { restoreFromFile } from '../lib/restore'
import { requestPersistence } from '../lib/db'
import { toMin, today, WEEKDAYS_LONG } from '../lib/dates'
import { defaultCategories, defaultFinCategories, defaultSettings } from '../lib/defaults'
import { AiError, PROVIDER_INFO, testAi } from '../lib/ai'
import type { AiSettings } from '../lib/types'
import { notificationSupport, requestNotificationPermission } from '../lib/reminders'
import { remove, replaceEverything, save, saveSettings, uid, useData, useSettings } from '../lib/store'
import type { Category, RestPeriod, Settings } from '../lib/types'
import { attempt, confirm, toast, useJournalUnlocked, useRoute } from '../lib/ui'
import { disableEncryption, enableEncryption, initVault, lock } from '../lib/vault'

function Section({ id, icon, title, children }: { id: string; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section id={`sec-${id}`} className="card" style={{ scrollMarginTop: 80 }}>
      <div className="row" style={{ marginBottom: 14 }}>
        <span className="icon-tile" style={{ width: 34, height: 34 }}>
          {icon}
        </span>
        <h2 className="serif" style={{ fontSize: 20 }}>{title}</h2>
      </div>
      {children}
    </section>
  )
}

export default function SettingsPage() {
  const s = useSettings()
  const { params } = useRoute()
  const set = (c: Partial<Settings>, msg = 'Configuração salva.') => attempt(() => saveSettings(c), msg)
  useEffect(() => {
    const sec = params.get('secao')
    if (sec) setTimeout(() => document.getElementById(`sec-${sec}`)?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [params])

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="page-head">
        <div>
          <h1>Configurações</h1>
          <p>Adapte o Life OS à sua rotina.</p>
        </div>
      </div>
      <div className="stack" style={{ gap: 16 }}>
        <Profile />
        <Section id="aparencia" icon={<Palette size={17} />} title="Aparência e formato">
          <div className="stack">
            <div className="field">
              <span className="label">Tema</span>
              <Seg label="Tema" value={s.theme} onChange={(theme) => set({ theme })} options={[{ value: 'sistema', label: 'Automático' }, { value: 'claro', label: 'Claro' }, { value: 'escuro', label: 'Escuro' }]} />
            </div>
            <div className="field">
              <span className="label">Primeiro dia da semana</span>
              <Seg label="Primeiro dia" value={String(s.weekStart) as '0' | '1'} onChange={(v) => set({ weekStart: +v as 0 | 1 })} options={[{ value: '0', label: 'Domingo' }, { value: '1', label: 'Segunda' }]} />
            </div>
            <div className="field">
              <span className="label">Formato de horário</span>
              <Seg label="Formato de horário" value={s.timeFormat} onChange={(timeFormat) => set({ timeFormat })} options={[{ value: '24h', label: '24 horas (14:30)' }, { value: '12h', label: '12 horas (2:30 PM)' }]} />
            </div>
            <div className="field">
              <span className="label">Idioma</span>
              <p className="small muted">Português (Brasil). Datas no formato dd/mm/aaaa, moeda em reais (R$) e horário local do seu aparelho. No momento este é o único idioma disponível.</p>
            </div>
          </div>
        </Section>
        <Categories />
        <AiSection />
        <Notifications />
        <Planning />
        <Privacy />
        <DataSection />
        <About />
      </div>
    </div>
  )
}

function Profile() {
  const s = useSettings()
  const [name, setName] = useState(s.name)
  return (
    <Section id="perfil" icon={<User size={17} />} title="Perfil">
      <form
        className="row wrap"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim().length > 40) return toast('Use até 40 caracteres.', 'erro')
          attempt(() => saveSettings({ name: name.trim() }), 'Nome atualizado.')
        }}
      >
        <Field label="Nome de exibição" hint="Usado só na saudação. Fica neste aparelho.">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} style={{ minWidth: 240 }} />
        </Field>
        <button className="btn sm" type="submit" style={{ alignSelf: 'center' }} disabled={name === s.name}>
          Salvar
        </button>
      </form>
    </Section>
  )
}

function Categories() {
  const data = useData()
  const [edit, setEdit] = useState<Category | 'new' | null>(null)
  return (
    <Section id="categorias" icon={<Tag size={17} />} title="Categorias (agenda, tarefas, objetivos)">
      <div className="list">
        {data.categories.map((c) => {
          const used = data.tasks.filter((t) => t.categoryId === c.id).length + data.events.filter((e) => e.categoryId === c.id).length + data.goals.filter((g) => g.categoryId === c.id).length
          return (
            <div key={c.id} className="list-item" data-c={c.color}>
              <i className="dot-c" />
              <span className="grow">
                {c.name} <span className="tiny faint">{used ? `· ${used} item(ns)` : ''}</span>
              </span>
              <button className="btn sm ghost" onClick={() => setEdit(c)}>
                Editar
              </button>
              <button
                className="icon-btn sm"
                aria-label={`Excluir categoria ${c.name}`}
                onClick={async () => (await confirm({ title: `Excluir "${c.name}"?`, body: used ? `${used} item(ns) ficarão sem categoria. Nada mais é apagado.` : undefined, confirmLabel: 'Excluir', danger: true })) && attempt(() => remove('categories', c.id), 'Categoria excluída.')}
              >
                <Trash2 size={15} />
              </button>
            </div>
          )
        })}
      </div>
      <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setEdit('new')}>
        <Plus size={15} /> Nova categoria
      </button>
      <p className="hint" style={{ marginTop: 8 }}>Categorias de finanças ficam em Finanças → Limites e categorias.</p>
      {edit && <CategoryForm cat={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </Section>
  )
}

function CategoryForm({ cat, onClose }: { cat?: Category; onClose: () => void }) {
  const [name, setName] = useState(cat?.name ?? '')
  const [color, setColor] = useState(cat?.color ?? 'salvia')
  const submit = async () => {
    if (!name.trim()) return toast('Dê um nome à categoria.', 'erro')
    if (await attempt(() => save('categories', { ...(cat ?? {}), name: name.trim(), color } as Category), cat ? 'Categoria atualizada.' : 'Categoria criada.')) onClose()
  }
  return (
    <Modal title={cat ? 'Editar categoria' : 'Nova categoria'} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={submit}>Salvar</button></>}>
      <form className="stack" onSubmit={(e) => (e.preventDefault(), submit())}>
        <Field label="Nome">
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <ColorPick value={color} onChange={setColor} />
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

function AiSection() {
  const s = useSettings()
  const [ai, setAi] = useState<AiSettings>(s.ai)
  const [show, setShow] = useState(false)
  const [testing, setTesting] = useState(false)
  useEffect(() => setAi(s.ai), [s.ai])
  const p = ai.provider === 'nenhum' ? null : PROVIDER_INFO[ai.provider]
  const keyField = ai.provider === 'groq' ? 'groqKey' : 'geminiKey'
  const modelField = ai.provider === 'groq' ? 'groqModel' : 'geminiModel'
  const dirty = JSON.stringify(ai) !== JSON.stringify(s.ai)
  async function saveAi() {
    if (ai.provider !== 'nenhum' && !ai[keyField].trim()) return toast('Cole a sua chave antes de salvar.', 'erro')
    if (ai.provider !== 'nenhum' && !ai.consent) return toast('Para usar a IA, marque a caixa de consentimento.', 'erro')
    await attempt(() => saveSettings({ ai }), ai.provider === 'nenhum' ? 'IA desativada. O assistente usa só as regras locais.' : 'IA configurada.')
  }
  async function test() {
    setTesting(true)
    try {
      const label = await testAi(ai)
      toast(`Funcionou! Conectado a ${label}.`)
    } catch (e) {
      toast(e instanceof AiError ? e.message : 'Não foi possível conectar. Confira a chave e a internet.', 'erro')
    } finally {
      setTesting(false)
    }
  }
  return (
    <Section id="ia" icon={<Bot size={17} />} title="Inteligência artificial (opcional)">
      <div className="stack">
        <p className="small muted">
          Por padrão o assistente usa regras locais (grátis, offline, nada sai do aparelho). Você pode ligar uma IA generativa <b>gratuita</b> usando uma chave sua.
          Nenhum dos dois provedores pede cartão de crédito — <b>não ative cobrança</b> na conta deles e o uso continua grátis (com limite diário).
        </p>
        <Seg
          label="Provedor de IA"
          value={ai.provider}
          onChange={(provider) => setAi({ ...ai, provider, consent: provider === s.ai.provider ? ai.consent : false })}
          options={[
            { value: 'nenhum', label: 'Só regras locais' },
            { value: 'groq', label: 'Groq (recomendado)' },
            { value: 'gemini', label: 'Google Gemini' },
          ]}
        />
        {p && (
          <>
            <div className="callout neutral small">
              <span>
                <b>Como pegar a chave grátis ({p.name}):</b>
                <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  <li>
                    Abra{' '}
                    <a href={p.keyUrl} target="_blank" rel="noopener noreferrer">
                      {p.keyUrl.replace('https://', '')} <ExternalLink size={11} />
                    </a>{' '}
                    e entre com sua conta {ai.provider === 'gemini' ? 'Google' : '(pode ser com o Google)'}.
                  </li>
                  <li>Clique em {ai.provider === 'groq' ? '"Create API Key"' : '"Create API key" / "Criar chave de API"'}, dê um nome (ex.: Life OS) e confirme.</li>
                  <li>Copie a chave (um código longo) e cole no campo abaixo. Ela só aparece uma vez — guarde se quiser.</li>
                </ol>
              </span>
            </div>
            <Field label="Chave de API" hint="Fica salva só neste aparelho e não vai para o backup. Não compartilhe com ninguém.">
              <div className="row">
                <input className="input" type={show ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={ai[keyField]} onChange={(e) => setAi({ ...ai, [keyField]: e.target.value.trim() })} placeholder={ai.provider === 'groq' ? 'gsk_…' : 'AIza…'} />
                <button type="button" className="icon-btn" aria-label={show ? 'Esconder chave' : 'Mostrar chave'} onClick={() => setShow(!show)}>
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </Field>
            <Field label="Modelo" hint={ai.provider === 'groq' ? 'Padrão: llama-3.3-70b-versatile. Se a Groq desativar o modelo, troque por outro da lista dela.' : 'Padrão: gemini-3.8-flash. Alternativa com limite maior: gemini-3.5-flash-lite.'}>
              <input className="input" value={ai[modelField]} onChange={(e) => setAi({ ...ai, [modelField]: e.target.value.trim() })} spellCheck={false} />
            </Field>
            <div className="card soft small">
              <b>O que é enviado a {p.name} a cada mensagem:</b> seu pedido, as últimas mensagens da conversa, tarefas pendentes, compromissos das próximas 2 semanas, horários
              livres, descansos, objetivos e estudos. <b>Nunca</b> são enviados: diário, memórias, fotos, finanças. {p.privacy}
              <label className="row" style={{ marginTop: 10, alignItems: 'flex-start' }}>
                <input type="checkbox" className="check square" checked={ai.consent} onChange={(e) => setAi({ ...ai, consent: e.target.checked })} style={{ marginTop: 2 }} />
                <span>Entendi e autorizo o envio desses dados para {p.name} quando eu usar o assistente com IA.</span>
              </label>
            </div>
          </>
        )}
        <div className="row wrap">
          <button className="btn primary sm" onClick={saveAi} disabled={!dirty}>
            Salvar
          </button>
          {p && (
            <button className="btn sm" onClick={test} disabled={testing || !ai[keyField].trim()}>
              {testing ? 'Testando…' : 'Testar conexão'}
            </button>
          )}
          {(s.ai.groqKey || s.ai.geminiKey) && (
            <button
              className="btn sm ghost danger"
              onClick={async () => (await confirm({ title: 'Apagar as chaves de IA deste aparelho?', confirmLabel: 'Apagar', danger: true })) && attempt(() => saveSettings({ ai: { ...s.ai, provider: 'nenhum', groqKey: '', geminiKey: '', consent: false } }), 'Chaves apagadas.')}
            >
              Apagar chaves
            </button>
          )}
        </div>
      </div>
    </Section>
  )
}

function Notifications() {
  const s = useSettings()
  const n = s.notifications
  const [perm, setPerm] = useState(notificationSupport())
  const set = (c: Partial<Settings['notifications']>) => attempt(() => saveSettings({ notifications: { ...n, ...c } }), 'Preferência salva.')
  return (
    <Section id="notificacoes" icon={<Bell size={17} />} title="Notificações e lembretes">
      <div className="stack">
        <div className="callout neutral small">
          <span>
            <b>Como funcionam:</b> os lembretes são verificados pelo próprio Life OS <b>enquanto ele estiver aberto</b> (em uma aba ou instalado como app). Não há servidor
            enviando avisos — com o app fechado, nenhum lembrete chega. Dentro do app, eles sempre aparecem no sino 🔔 e como aviso na tela.
          </span>
        </div>
        <div className="row wrap between">
          <Switch checked={n.enabled && perm === 'granted'} disabled={perm === 'sem_suporte' || perm === 'denied'} onChange={async (v) => {
            if (v && perm !== 'granted') {
              const r = await requestNotificationPermission()
              setPerm(r === 'sem_suporte' ? 'sem_suporte' : r)
              if (r !== 'granted') return toast('Permissão não concedida. Os lembretes continuam aparecendo dentro do app.', 'info')
            }
            set({ enabled: v })
          }} label="Notificações do sistema (navegador)" />
          <span className="tiny faint">
            {perm === 'sem_suporte' ? 'Este navegador não oferece notificações.' : perm === 'denied' ? 'Bloqueadas no navegador — libere nas configurações do site.' : perm === 'granted' ? 'Permissão concedida.' : 'Será pedida permissão.'}
          </span>
        </div>
        <Switch checked={n.events} onChange={(v) => set({ events: v })} label="Compromissos (conforme o lembrete de cada evento)" />
        <Switch checked={n.tasks} onChange={(v) => set({ tasks: v })} label="Tarefas com horário e blocos planejados" />
        <Switch checked={n.habits} onChange={(v) => set({ habits: v })} label="Hábitos com horário de lembrete" />
        <Switch checked={n.study} onChange={(v) => set({ study: v })} label="Revisões de estudo e provas do dia" />
        <Field label="Antecedência para tarefas (min)">
          <input className="input" type="number" min={0} max={240} value={n.leadMin} onChange={(e) => set({ leadMin: Math.max(0, Math.min(240, +e.target.value || 0)) })} style={{ maxWidth: 120 }} />
        </Field>
        <p className="hint">No iPhone, notificações do navegador só funcionam com o Life OS instalado na tela de início (iOS 16.4 ou mais recente).</p>
      </div>
    </Section>
  )
}

function Planning() {
  const s = useSettings()
  const pl = s.planning
  const set = (c: Partial<Settings['planning']>) => attempt(() => saveSettings({ planning: { ...pl, ...c } }), 'Planejamento atualizado.')
  const [rest, setRest] = useState<RestPeriod | null>(null)
  const order = s.weekStart === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6]
  return (
    <Section id="planejamento" icon={<SlidersHorizontal size={17} />} title="Planejamento e disponibilidade">
      <div className="stack">
        <p className="small muted">Usado pelo "Reorganizar minha vida" e pelo assistente para encaixar tarefas. Fora desses horários nada é agendado.</p>
        <div className="list">
          {order.map((d) => {
            const a = pl.availability[d]
            return (
              <div key={d} className="list-item wrap" style={{ flexWrap: 'wrap' }}>
                <span style={{ width: 120, textTransform: 'capitalize' }}>{WEEKDAYS_LONG[d]}</span>
                <Switch checked={a.enabled} onChange={(v) => set({ availability: pl.availability.map((x, i) => (i === d ? { ...x, enabled: v } : x)) })} label={a.enabled ? 'Disponível' : 'Folga'} />
                {a.enabled && (
                  <span className="row">
                    <input className="input" type="time" value={a.start} style={{ width: 110 }} aria-label={`Início ${WEEKDAYS_LONG[d]}`} onChange={(e) => e.target.value && toMin(e.target.value) < toMin(a.end) && set({ availability: pl.availability.map((x, i) => (i === d ? { ...x, start: e.target.value } : x)) })} />
                    –
                    <input className="input" type="time" value={a.end} style={{ width: 110 }} aria-label={`Fim ${WEEKDAYS_LONG[d]}`} onChange={(e) => e.target.value && toMin(e.target.value) > toMin(a.start) && set({ availability: pl.availability.map((x, i) => (i === d ? { ...x, end: e.target.value } : x)) })} />
                  </span>
                )}
              </div>
            )
          })}
        </div>
        <div className="field">
          <span className="label">Períodos de descanso (nunca recebem tarefas)</span>
          <div className="list">
            {pl.rest.map((r) => (
              <div key={r.id} className="list-item">
                <span className="grow">
                  {r.label} <span className="small faint">· {r.start}–{r.end} · {r.days.length === 7 ? 'todos os dias' : r.days.map((d) => WEEKDAYS_LONG[d].slice(0, 3)).join(', ')}</span>
                </span>
                <button className="btn sm ghost" onClick={() => setRest(r)}>
                  Editar
                </button>
                <button className="icon-btn sm" aria-label={`Remover ${r.label}`} onClick={async () => (await confirm({ title: `Remover "${r.label}"?`, confirmLabel: 'Remover', danger: true })) && set({ rest: pl.rest.filter((x) => x.id !== r.id) })}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setRest({ id: '', label: '', start: '15:00', end: '15:30', days: [0, 1, 2, 3, 4, 5, 6] })}>
            <Plus size={15} /> Adicionar descanso
          </button>
        </div>
        <div className="form-grid">
          <Field label="Máximo de foco por dia (horas)" hint="O resto do tempo livre fica livre.">
            <input className="input" type="number" min={0.5} max={16} step={0.5} value={pl.maxFocusMinPerDay / 60} onChange={(e) => +e.target.value >= 0.5 && +e.target.value <= 16 && set({ maxFocusMinPerDay: Math.round(+e.target.value * 60) })} />
          </Field>
          <Field label="Respiro entre atividades (min)">
            <input className="input" type="number" min={0} max={60} value={pl.bufferMin} onChange={(e) => set({ bufferMin: Math.max(0, Math.min(60, +e.target.value || 0)) })} />
          </Field>
          <Field label="Duração padrão de tarefa (min)" hint="Usada quando a tarefa não tem tempo estimado.">
            <input className="input" type="number" min={5} max={480} step={5} value={pl.defaultTaskMin} onChange={(e) => +e.target.value >= 5 && set({ defaultTaskMin: Math.min(480, +e.target.value) })} />
          </Field>
        </div>
      </div>
      {rest && <RestForm rest={rest} onClose={() => setRest(null)} />}
    </Section>
  )
}

function RestForm({ rest, onClose }: { rest: RestPeriod; onClose: () => void }) {
  const s = useSettings()
  const [r, setR] = useState(rest)
  async function submit() {
    if (!r.label.trim()) return toast('Dê um nome ao descanso.', 'erro')
    if (toMin(r.end) <= toMin(r.start)) return toast('O fim precisa ser depois do início.', 'erro')
    if (!r.days.length) return toast('Escolha ao menos um dia.', 'erro')
    const list = r.id ? s.planning.rest.map((x) => (x.id === r.id ? r : x)) : [...s.planning.rest, { ...r, id: uid() }]
    if (await attempt(() => saveSettings({ planning: { ...s.planning, rest: list } }), 'Descanso salvo.')) onClose()
  }
  return (
    <Modal title={rest.id ? 'Editar descanso' : 'Novo descanso'} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={submit}>Salvar</button></>}>
      <form className="stack" onSubmit={(e) => (e.preventDefault(), submit())}>
        <Field label="Nome">
          <input className="input" autoFocus value={r.label} onChange={(e) => setR({ ...r, label: e.target.value })} placeholder="Ex.: Café da tarde, Academia, Família" />
        </Field>
        <div className="row">
          <Field label="Início">
            <input className="input" type="time" value={r.start} onChange={(e) => setR({ ...r, start: e.target.value })} />
          </Field>
          <Field label="Fim">
            <input className="input" type="time" value={r.end} onChange={(e) => setR({ ...r, end: e.target.value })} />
          </Field>
        </div>
        <WeekdayPick value={r.days} onChange={(days) => setR({ ...r, days })} weekStart={s.weekStart} />
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

function Privacy() {
  const s = useSettings()
  const unlocked = useJournalUnlocked()
  const [form, setForm] = useState<'ativar' | 'trocar' | null>(null)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const enc = s.journalLock.enabled && s.journalLock.encrypted
  const reset = () => (setForm(null), setPw(''), setPw2(''), setAck(false))
  async function submit() {
    if (pw.length < 6) return toast('Use uma senha com pelo menos 6 caracteres (de preferência uma frase fácil de lembrar).', 'erro')
    if (pw !== pw2) return toast('As senhas não conferem.', 'erro')
    if (!ack) return toast('Confirme que entendeu que a senha não pode ser recuperada.', 'erro')
    setBusy(true)
    try {
      if (form === 'trocar') await disableEncryption()
      await enableEncryption(pw)
      toast(form === 'trocar' ? 'Senha trocada. Diário criptografado.' : 'Diário e memórias criptografados.')
      reset()
    } catch (e) {
      toast(`Não foi possível concluir: ${(e as Error).message}`, 'erro')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Section id="privacidade" icon={<Shield size={17} />} title="Privacidade">
      <div className="stack small">
        <p>
          <b>Onde ficam seus dados:</b> somente neste navegador, neste aparelho. Não existe conta nem servidor do Life OS. O app não tem anúncios e não coleta
          estatísticas de uso. Se você ligar a IA opcional, só o que está descrito na seção de IA é enviado ao provedor escolhido.
        </p>
        <p>
          <b>Limites:</b> limpar os dados do navegador ou desinstalar o app apaga tudo — faça backups. Os dados não sincronizam sozinhos entre aparelhos (use o
          backup para levar de um para outro).
        </p>
        <div className="card soft">
          <div className="row between wrap">
            <span className="row">
              <Lock size={16} /> <b>Criptografia do diário e das memórias</b>
            </span>
            <span className={`tag`}>{enc ? (unlocked ? 'Ativa · desbloqueado' : 'Ativa · bloqueado') : 'Desligada'}</span>
          </div>
          <p className="tiny faint" style={{ marginTop: 6 }}>
            Com a criptografia ativa, textos e fotos do diário e das memórias ficam embaralhados (AES-256) e só abrem com a sua senha — inclusive no backup. A senha
            não é guardada em lugar nenhum: <b>se esquecer, o conteúdo não pode ser recuperado</b>. O diário fica bloqueado sempre que o app é aberto.
          </p>
          <div className="row wrap" style={{ marginTop: 10 }}>
            {!enc && !form && (
              <button className="btn sm primary" onClick={() => setForm('ativar')}>
                Ativar criptografia
              </button>
            )}
            {enc && unlocked && !form && (
              <>
                <button className="btn sm" onClick={() => setForm('trocar')}>
                  Trocar senha
                </button>
                <button className="btn sm" onClick={() => lock()}>
                  Bloquear agora
                </button>
                <button
                  className="btn sm danger"
                  onClick={async () => {
                    if (!(await confirm({ title: 'Desativar a criptografia?', body: 'O diário e as memórias voltarão a ser gravados sem senha neste aparelho.', confirmLabel: 'Desativar', danger: true }))) return
                    setBusy(true)
                    await attempt(() => disableEncryption(), 'Criptografia desativada.')
                    setBusy(false)
                  }}
                  disabled={busy}
                >
                  Desativar
                </button>
              </>
            )}
            {enc && !unlocked && <span className="tiny faint">Abra o Diário e desbloqueie para trocar a senha ou desativar.</span>}
          </div>
          {form && (
            <form className="stack" style={{ marginTop: 12 }} onSubmit={(e) => (e.preventDefault(), submit())}>
              <input className="input" type="password" autoComplete="new-password" placeholder={form === 'trocar' ? 'Nova senha' : 'Senha (6+ caracteres)'} value={pw} onChange={(e) => setPw(e.target.value)} aria-label="Nova senha do diário" autoFocus />
              <input className="input" type="password" autoComplete="new-password" placeholder="Repita a senha" value={pw2} onChange={(e) => setPw2(e.target.value)} aria-label="Repita a senha do diário" />
              <label className="row" style={{ alignItems: 'flex-start' }}>
                <input type="checkbox" className="check square" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 2 }} />
                <span>Entendi: se eu esquecer a senha, não será possível recuperar o diário e as memórias.</span>
              </label>
              <div className="row">
                <button className="btn primary sm" type="submit" disabled={busy}>
                  {busy ? 'Criptografando…' : form === 'trocar' ? 'Trocar senha' : 'Ativar'}
                </button>
                <button className="btn ghost sm" type="button" onClick={reset}>
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </Section>
  )
}

function DataSection() {
  const data = useData()
  const s = useSettings()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [usage, setUsage] = useState<string>('')
  const [protect, setProtect] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {})
    navigator.storage
      ?.estimate?.()
      .then((e) => e.usage != null && setUsage(`${(e.usage / 1024 / 1024).toFixed(1)} MB usados${e.quota ? ` de ~${Math.round(e.quota / 1024 / 1024 / 1024)} GB disponíveis` : ''}`))
      .catch(() => {})
  }, [])
  const total = Object.values(data).reduce((a, l) => a + l.length, 0)

  async function exportAll() {
    if (protect && (pw.length < 6 || pw !== pw2)) return toast(pw.length < 6 ? 'A senha do backup precisa ter 6+ caracteres.' : 'As senhas do backup não conferem.', 'erro')
    setBusy(true)
    try {
      const b = await buildBackup(data, s, true)
      let json = JSON.stringify(b)
      // verificação: o arquivo gerado precisa ser lido de volta como backup válido
      validateBackup(JSON.parse(json))
      if (protect) json = await protectBackup(json, pw)
      const r = await shareOrDownload(`life-os-backup-${today()}.json`, json, 'application/json')
      if (r === 'cancelado') return
      await saveSettings({ lastBackupAt: new Date().toISOString() })
      toast(protect ? 'Backup protegido gerado. Guarde a senha — sem ela o arquivo não abre.' : 'Backup gerado e verificado. Guarde o arquivo em local seguro.')
    } catch (e) {
      toast(`Falha ao gerar o backup: ${(e as Error).message}`, 'erro')
    } finally {
      setBusy(false)
    }
  }

  async function importFile(file: File) {
    setBusy(true)
    await restoreFromFile(file)
    setBusy(false)
  }

  async function wipe() {
    if (!(await confirm({ title: 'Apagar todos os dados?', body: `Isto apaga permanentemente ${total} registros, anexos e configurações deste aparelho. Não há como desfazer.\n\nRecomendação: exporte um backup antes.`, confirmLabel: 'Continuar', danger: true }))) return
    if (!(await confirm({ title: 'Tem certeza absoluta?', body: 'Última confirmação. Tudo será apagado.', confirmLabel: 'Apagar tudo', danger: true }))) return
    const ok = await attempt(() => replaceEverything({ categories: defaultCategories(), finCategories: defaultFinCategories() }, { ...defaultSettings() }), 'Todos os dados foram apagados.')
    if (ok !== undefined) {
      try {
        localStorage.clear()
      } catch {
        /* sem acesso */
      }
      initVault()
    }
  }

  return (
    <Section id="dados" icon={<Database size={17} />} title="Seus dados: backup e exclusão">
      <div className="stack">
        <p className="small muted">
          {total} registros salvos neste aparelho. {usage}
        </p>
        <p className="small">
          Último backup: <b>{s.lastBackupAt ? new Date(s.lastBackupAt).toLocaleDateString('pt-BR') : 'nunca'}</b>
          {s.journalLock.encrypted && ' · o diário vai criptografado no backup'}
        </p>
        <Switch checked={protect} onChange={setProtect} label="Proteger o arquivo de backup com senha (recomendado se for guardar na nuvem)" />
        {protect && (
          <div className="row wrap">
            <input className="input" type="password" autoComplete="new-password" placeholder="Senha do backup (6+)" value={pw} onChange={(e) => setPw(e.target.value)} style={{ maxWidth: 220 }} aria-label="Senha do backup" />
            <input className="input" type="password" autoComplete="new-password" placeholder="Repita a senha" value={pw2} onChange={(e) => setPw2(e.target.value)} style={{ maxWidth: 220 }} aria-label="Repita a senha do backup" />
          </div>
        )}
        <div className="row wrap">
          <button className="btn primary sm" onClick={exportAll} disabled={busy}>
            <Download size={15} /> {/iPhone|iPad|Android/i.test(navigator.userAgent) ? 'Salvar backup (Arquivos/iCloud)' : 'Exportar backup completo (.json)'}
          </button>
          <button className="btn sm" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload size={15} /> Restaurar backup
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => (e.target.files?.[0] && importFile(e.target.files[0]), (e.target.value = ''))} />
        </div>
        <p className="hint">O backup inclui tudo: tarefas, agenda, objetivos, estudos, hábitos, finanças, diário, memórias (com fotos) e configurações. Para levar para outro aparelho, exporte aqui e restaure lá.</p>
        <div className="row wrap between">
          <span className="small row">
            <HardDrive size={15} /> Armazenamento persistente: {persisted == null ? 'verificando…' : persisted ? 'ativo (o navegador não apaga automaticamente)' : 'não garantido'}
          </span>
          {persisted === false && (
            <button className="btn sm ghost" onClick={async () => { const r = await requestPersistence(); setPersisted(!!r); toast(r ? 'Armazenamento persistente ativado.' : 'O navegador não concedeu. Instalar o app costuma ajudar.', r ? 'sucesso' : 'info') }}>
              Pedir ao navegador
            </button>
          )}
        </div>
        <hr className="divider" />
        <div className="row wrap between">
          <span className="small">Apagar todos os dados deste aparelho</span>
          <button className="btn sm danger" onClick={wipe}>
            <Trash2 size={15} /> Apagar tudo
          </button>
        </div>
      </div>
    </Section>
  )
}

function About() {
  return (
    <Section id="sobre" icon={<Shield size={17} />} title="Sobre e custos">
      <div className="stack small">
        <p>
          <b>Life OS</b> é gratuito, sem anúncios, sem assinaturas e sem limites artificiais. Funciona offline, sem conta e sem nenhum serviço pago. O assistente é um planejador
          local por regras — não usa IA paga nem envia dados para fora.
        </p>
        <p className="muted">Feito com React, TypeScript, IndexedDB e ícones Lucide (código aberto). Fontes Inter e Newsreader (licença livre), incluídas no app.</p>
      </div>
    </Section>
  )
}
