// Restauração de backup: de um arquivo escolhido pela pessoa ou de uma versão do GitHub.
import { adoptCurrentAsSynced, fetchVersion, listVersions } from './cloud'
import { filesFromBackup, isProtectedBackup, openProtectedBackup, validateBackup, type Backup } from './backup'
import { getState, replaceEverything } from './store'
import { ask, confirm, toast } from './ui'
import { initVault } from './vault'

/** Valida, pede confirmação e substitui os dados atuais. */
export async function restoreFromRaw(raw: unknown, origin: string): Promise<boolean> {
  const v = validateBackup(raw)
  const n = Object.values(v.counts).reduce((a, b) => a + b, 0)
  const current = Object.values(getState().data).reduce((a, l) => a + l.length, 0)
  const body =
    `${origin} tem ${n} registros${v.fileCount ? ` e ${v.fileCount} anexo(s)` : ''}.` +
    (current > 0 ? `\n\nTODOS os dados atuais deste aparelho (${current} registros) serão SUBSTITUÍDOS.` : '') +
    (v.settings.journalLock.encrypted ? '\n\nO diário deste backup é criptografado: você vai precisar da senha do diário para abri-lo.' : '')
  if (!(await confirm({ title: 'Restaurar este backup?', body, confirmLabel: current > 0 ? 'Substituir e restaurar' : 'Restaurar', danger: current > 0 }))) return false
  const keepAi = getState().settings.ai // a chave de IA deste aparelho é mantida
  await replaceEverything(v.data, { ...v.settings, ai: keepAi, onboarded: true }, await filesFromBackup(raw as Backup))
  initVault()
  toast('Backup restaurado.')
  return true
}

export async function restoreFromFile(file: File): Promise<boolean> {
  try {
    let raw: unknown = JSON.parse(await file.text())
    if (isProtectedBackup(raw)) {
      const pw = await ask({ title: 'Backup protegido', body: 'Este backup foi salvo com senha. Digite a senha do backup.', input: { label: 'Senha do backup', type: 'password' }, confirmLabel: 'Abrir' })
      if (!pw) return false
      raw = await openProtectedBackup(raw, pw)
    }
    return await restoreFromRaw(raw, 'O backup')
  } catch (e) {
    toast(e instanceof SyntaxError ? 'O arquivo não é um backup válido (JSON).' : `Não foi possível restaurar: ${(e as Error).message}`, 'erro')
    return false
  }
}

export async function restoreFromCloud(token: string, owner: string, repo: string, sha: string, password: string, label: string): Promise<boolean> {
  try {
    const raw = await fetchVersion(token, owner, repo, sha, password)
    const ok = await restoreFromRaw(raw, `O backup de ${label}`)
    if (ok) {
      const v = (await listVersions(token, owner, repo).catch(() => [])).find((x) => x.sha === sha)
      await adoptCurrentAsSynced(v?.date ?? new Date().toISOString())
    }
    return ok
  } catch (e) {
    toast(`Não foi possível restaurar: ${(e as Error).message}`, 'erro')
    return false
  }
}
