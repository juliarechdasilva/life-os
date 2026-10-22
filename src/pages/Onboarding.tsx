import { HardDrive, Lock, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Leaf } from '../components/ui'
import { saveSettings, useSettings } from '../lib/store'
import { restoreFromFile } from '../lib/restore'
import { attempt } from '../lib/ui'

function Plant() {
  return (
    <svg width="150" height="120" viewBox="0 0 150 120" fill="none" aria-hidden="true" style={{ margin: '0 auto' }}>
      <ellipse cx="75" cy="112" rx="52" ry="6" fill="var(--surface-3)" />
      <path d="M58 86h34l-4 26H62z" fill="var(--c-areia)" opacity=".85" />
      <path d="M75 86V44" stroke="var(--sage-strong)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M75 62c-14 0-24-9-26-24 15 0 25 9 26 24Z" fill="var(--sage)" opacity=".65" />
      <path d="M75 52c13-1 22-10 23-24-14 1-22 10-23 24Z" fill="var(--sage)" />
      <path d="M75 74c10 0 18-6 20-17-11 0-18 6-20 17Z" fill="var(--sage)" opacity=".8" />
      <path d="M75 46c-6-5-8-12-6-20 6 5 8 12 6 20Z" fill="var(--sage-strong)" opacity=".7" />
      <circle cx="118" cy="26" r="9" fill="var(--gold)" opacity=".55" />
    </svg>
  )
}

export default function Onboarding() {
  const settings = useSettings()
  const [name, setName] = useState(settings.name)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function start() {
    const n = name.trim()
    if (n.length > 40) return setErr('Use até 40 caracteres.')
    await attempt(() => saveSettings({ name: n, onboarded: true }))
  }

  const restore = (file: File) => restoreFromFile(file)

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="logo">
          <Leaf size={44} /> Life OS
        </div>
        <p className="tagline">Seu dia, do seu jeito.</p>
        <Plant />
        <p className="muted">Tudo o que você precisa para uma vida mais equilibrada — rotina, estudos, metas, finanças e memórias — em um só lugar.</p>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault()
            start()
          }}
        >
          <label className="field" style={{ textAlign: 'left' }}>
            <span>Como quer ser chamado(a)?</span>
            <input className="input" value={name} onChange={(e) => (setName(e.target.value), setErr(''))} placeholder="Seu nome (opcional)" autoFocus maxLength={60} />
            {err && <span className="error">{err}</span>}
          </label>
          <button className="btn primary block" type="submit" style={{ minHeight: 46 }}>
            Começar
          </button>
          <button type="button" className="btn block" onClick={() => fileRef.current?.click()}>
            <Upload size={16} /> Restaurar um backup
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
        </form>
        <div className="privacy-note">
          <HardDrive size={18} />
          <span>
            <b>Sem conta e sem senha.</b> Seus dados ficam salvos apenas neste navegador, neste dispositivo. Nada é enviado para servidores. Faça backups pela tela de
            Configurações.
          </span>
        </div>
        <div className="row" style={{ justifyContent: 'center', gap: 18, color: 'var(--text-3)', fontSize: 12.5 }}>
          <span className="row" style={{ gap: 5 }}>
            <Lock size={13} /> Privado
          </span>
          <span>Sem custos</span>
          <span>Funciona offline</span>
        </div>
      </div>
    </div>
  )
}
