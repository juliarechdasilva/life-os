import { CloudUpload, ExternalLink, History, RefreshCw } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { backupNow, disableCloud, getCloud, listVersions, newerFromOtherDevice, onCloudChange, setupCloud, type RemoteVersion } from '../lib/cloud'
import { restoreFromCloud } from '../lib/restore'
import { attempt, ask, confirm, toast } from '../lib/ui'
import { Field, Modal } from './ui'

export function useCloud() {
  return useSyncExternalStore(onCloudChange, getCloud, getCloud)
}

const TOKEN_URL =
  'https://github.com/settings/personal-access-tokens/new?name=Life+OS+backup&description=Backup+autom%C3%A1tico+do+Life+OS&expires_in=none&contents=write'

const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

function Steps() {
  return (
    <div className="callout neutral small">
      <span>
        <b>Como criar a chave de acesso do GitHub (uma vez só):</b>
        <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          <li>
            Abra{' '}
            <a href={TOKEN_URL} target="_blank" rel="noopener noreferrer">
              este link do GitHub <ExternalLink size={11} />
            </a>{' '}
            (já vem com nome e permissão preenchidos). Entre na sua conta se pedir.
          </li>
          <li>
            Em <b>Repository access</b>, escolha <b>Only select repositories</b> e selecione <b>life-os-backup</b>.
          </li>
          <li>
            Confira que em <b>Permissions → Contents</b> está <b>Read and write</b>. Role até o fim e clique em <b>Generate token</b>.
          </li>
          <li>Copie o código que começa com <code>github_pat_</code> e cole abaixo. Ele só aparece uma vez.</li>
        </ol>
      </span>
    </div>
  )
}

/** Seção de Configurações: ativar, ver status, enviar agora, restaurar versão, desativar. */
export function CloudSection() {
  const c = useCloud()
  const [setup, setSetup] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [busy, setBusy] = useState(false)
  if (c?.enabled)
    return (
      <div className="card soft stack small">
        <div className="row between wrap">
          <span className="row">
            <CloudUpload size={16} /> <b>Backup automático ativo</b>
          </span>
          <span className="tag">
            {c.owner}/{c.repo}
          </span>
        </div>
        <p>
          Último envio deste aparelho: <b>{c.lastAt ? fmt(c.lastAt) : 'ainda não'}</b>. Envia sozinho cerca de 1 minuto depois de cada mudança (no máximo a cada 10 min), ao sair do
          app e quando a internet volta.
        </p>
        {c.lastError && <p className="error">Último erro: {c.lastError} O app tenta de novo sozinho.</p>}
        <div className="row wrap">
          <button
            className="btn sm primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              const r = await attempt(() => backupNow(true))
              setBusy(false)
              if (r) toast('Backup enviado ao GitHub.')
            }}
          >
            <RefreshCw size={15} /> {busy ? 'Enviando…' : 'Fazer backup agora'}
          </button>
          <button className="btn sm" onClick={() => setRestoring(true)}>
            <History size={15} /> Restaurar uma versão
          </button>
          <button
            className="btn sm ghost danger"
            onClick={async () => {
              const v = await confirm({ title: 'Desativar o backup automático?', body: 'Os backups que já estão no GitHub continuam lá. O token será apagado deste aparelho.', confirmLabel: 'Desativar', danger: true })
              if (v) await attempt(() => disableCloud(true), 'Backup automático desativado.')
            }}
          >
            Desativar
          </button>
        </div>
        {restoring && <CloudRestoreModal onClose={() => setRestoring(false)} preset={{ token: c.token, owner: c.owner, repo: c.repo }} />}
      </div>
    )
  return (
    <div className="card soft stack small">
      <span className="row">
        <CloudUpload size={16} /> <b>Backup automático no seu GitHub (grátis)</b>
      </span>
      <p>
        O app envia sozinho uma cópia <b>criptografada</b> dos seus dados para um repositório <b>privado</b> do seu GitHub (<b>life-os-backup</b>). O GitHub guarda
        cada versão, então dá para voltar a qualquer data — e restaurar em outro aparelho (computador ↔ celular).
      </p>
      <div className="row wrap">
        {!setup && (
          <button className="btn sm primary" onClick={() => setSetup(true)}>
            Configurar
          </button>
        )}
        <button className="btn sm" onClick={() => setRestoring(true)}>
          <History size={15} /> Restaurar do GitHub
        </button>
      </div>
      {setup && <CloudSetup onDone={() => setSetup(false)} />}
      {restoring && <CloudRestoreModal onClose={() => setRestoring(false)} />}
    </div>
  )
}

function CloudSetup({ onDone, presetPassword }: { onDone: () => void; presetPassword?: string }) {
  const [token, setToken] = useState('')
  const [repo, setRepo] = useState('life-os-backup')
  const [pw, setPw] = useState(presetPassword ?? '')
  const [pw2, setPw2] = useState(presetPassword ?? '')
  const [ack, setAck] = useState(!!presetPassword)
  const [busy, setBusy] = useState(false)
  async function submit() {
    if (!/^(github_pat_|ghp_)/.test(token.trim())) return toast('Cole o token do GitHub (começa com github_pat_).', 'erro')
    if (pw.length < 8) return toast('A senha de backup precisa ter pelo menos 8 caracteres.', 'erro')
    if (pw !== pw2) return toast('As senhas não conferem.', 'erro')
    if (!ack) return toast('Confirme que vai guardar a senha de backup.', 'erro')
    setBusy(true)
    try {
      await setupCloud({ token, owner: '', repo, password: pw })
      toast('Backup automático ativado e primeiro backup enviado!')
      onDone()
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="stack" onSubmit={(e) => (e.preventDefault(), submit())}>
      <Steps />
      <Field label="Token do GitHub">
        <input className="input" type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value.trim())} placeholder="github_pat_…" />
      </Field>
      <Field label="Repositório privado">
        <input className="input" value={repo} onChange={(e) => setRepo(e.target.value.trim())} spellCheck={false} />
      </Field>
      {!presetPassword && (
        <>
          <Field label="Senha de backup (8+ caracteres)" hint="Criptografa o backup antes de sair do aparelho. Você vai precisar dela para restaurar em outro aparelho.">
            <input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
          <Field label="Repita a senha de backup">
            <input className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </Field>
          <label className="row small" style={{ alignItems: 'flex-start' }}>
            <input type="checkbox" className="check square" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 2 }} />
            <span>Vou guardar essa senha. Sem ela, os backups do GitHub não podem ser abertos.</span>
          </label>
        </>
      )}
      <div className="row">
        <button className="btn primary sm" type="submit" disabled={busy}>
          {busy ? 'Ativando…' : 'Ativar backup automático'}
        </button>
        <button className="btn ghost sm" type="button" onClick={onDone}>
          Cancelar
        </button>
      </div>
      <p className="hint">O token fica salvo só neste aparelho e dá acesso apenas ao repositório escolhido.</p>
    </form>
  )
}

/** Restaurar uma versão do GitHub (também usado na tela inicial, em um aparelho novo). */
export function CloudRestoreModal({ onClose, preset }: { onClose: () => void; preset?: { token: string; owner: string; repo: string } }) {
  const [token, setToken] = useState(preset?.token ?? '')
  const [owner, setOwner] = useState(preset?.owner ?? '')
  const [repo, setRepo] = useState(preset?.repo ?? 'life-os-backup')
  const [versions, setVersions] = useState<RemoteVersion[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [keep, setKeep] = useState(!preset)
  const [password, setPassword] = useState<string | null>(null)

  async function load() {
    setBusy(true)
    try {
      const { checkAccess } = await import('../lib/cloud')
      const a = await checkAccess(token, owner, repo)
      setOwner(a.owner)
      const v = await listVersions(token, a.owner, repo)
      if (!v.length) toast('Ainda não há backups nesse repositório.', 'info')
      setVersions(v)
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    if (preset) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function pick(v: RemoteVersion) {
    const pw = await ask({ title: 'Senha de backup', body: `Restaurar o backup de ${fmt(v.date)}.`, input: { label: 'Senha de backup', type: 'password' }, confirmLabel: 'Restaurar' })
    if (!pw) return
    setBusy(true)
    const ok = await restoreFromCloud(token, owner, repo, v.sha, pw, fmt(v.date))
    setBusy(false)
    if (ok) {
      if (keep && !preset) setPassword(pw)
      else onClose()
    }
  }

  if (password)
    return (
      <Modal title="Continuar com backup automático aqui?" onClose={onClose}>
        <p className="small muted" style={{ marginBottom: 12 }}>Seus dados foram restaurados. Ative o backup automático neste aparelho também (mesma senha de backup).</p>
        <CloudSetup presetPassword={password} onDone={onClose} />
      </Modal>
    )

  return (
    <Modal title="Restaurar do GitHub" onClose={onClose} wide>
      <div className="stack">
        {!preset && (
          <>
            <p className="small muted">Use o mesmo tipo de token do backup automático (crie um novo se não tiver o anterior) e a sua senha de backup.</p>
            <Steps />
            <Field label="Token do GitHub">
              <input className="input" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value.trim())} placeholder="github_pat_…" />
            </Field>
            <Field label="Repositório">
              <input className="input" value={repo} onChange={(e) => setRepo(e.target.value.trim())} />
            </Field>
            <label className="row small">
              <input type="checkbox" className="check square" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
              Depois de restaurar, ativar o backup automático neste aparelho
            </label>
            <button className="btn primary sm" style={{ alignSelf: 'flex-start' }} disabled={busy || !token} onClick={load}>
              {busy ? 'Buscando…' : 'Buscar backups'}
            </button>
          </>
        )}
        {versions && versions.length > 0 && (
          <div className="list">
            {versions.map((v, i) => (
              <button key={v.sha} className="list-item clickable" style={{ border: 0, borderBottom: '1px solid var(--line)', background: 'none', width: '100%', textAlign: 'left' }} disabled={busy} onClick={() => pick(v)}>
                <History size={15} className="faint" />
                <span className="grow small">
                  {fmt(v.date)} {i === 0 && <span className="tag">mais recente</span>}
                  <div className="tiny faint">{v.message}</div>
                </span>
              </button>
            ))}
          </div>
        )}
        {preset && !versions && <p className="small muted">Buscando versões…</p>}
      </div>
    </Modal>
  )
}

/** Aviso no Início quando outro aparelho enviou um backup mais novo. */
let checkedThisSession = false
export function NewerBackupBanner() {
  const c = useCloud()
  const [v, setV] = useState<RemoteVersion | null>(null)
  useEffect(() => {
    if (!c?.enabled || checkedThisSession) return
    checkedThisSession = true
    newerFromOtherDevice().then(setV).catch(() => {})
  }, [c?.enabled])
  if (!v || !c) return null
  return (
    <div className="callout" style={{ marginBottom: 16 }}>
      <span className="grow small">
        Há um backup mais novo feito em outro aparelho ({fmt(v.date)} — {v.message.replace(/^Backup [^—]+— /, '')}). Quer trazer esses dados para cá?
      </span>
      <div className="row">
        <button
          className="btn sm"
          onClick={async () => {
            const pw = await ask({ title: 'Senha de backup', body: 'Os dados deste aparelho serão substituídos pelos do backup mais novo.', input: { label: 'Senha de backup', type: 'password' }, confirmLabel: 'Continuar' })
            if (pw && (await restoreFromCloud(c.token, c.owner, c.repo, v.sha, pw, fmt(v.date)))) setV(null)
          }}
        >
          Trazer
        </button>
        <button className="btn sm ghost" onClick={() => setV(null)}>
          Agora não
        </button>
      </div>
    </div>
  )
}
