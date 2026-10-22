// Teste de ponta a ponta no navegador real (Chrome instalado no computador).
// Uso: com o app rodando (npm run dev -- --port 5317), execute: node tests/e2e.mjs
// Cobre os critérios de aceitação: persistência, CRUD, conflitos, projetos,
// hábitos, finanças, diário + busca, exportação, reorganização e responsividade.
import { chromium, webkit } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'

const URL = process.env.APP_URL ?? 'http://localhost:5317/'
const SHOTS = process.env.SHOTS ?? 'test-results/'
mkdirSync(SHOTS, { recursive: true })
const results = []
const ok = (name) => (results.push(['✓', name]), console.log('✓', name))
const fail = (name, e) => (results.push(['✗', name, String(e)]), console.log('✗', name, '-', e?.message ?? e))
async function step(name, fn) {
  try {
    await fn()
    ok(name)
  } catch (e) {
    fail(name, e)
  }
}
const assert = (c, msg) => {
  if (!c) throw new Error(msg)
}

// PW_BROWSER=webkit testa no motor do Safari (iPhone); padrão: Chrome instalado
const useWebkit = process.env.PW_BROWSER === 'webkit'
const browser = useWebkit ? await webkit.launch() : await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', acceptDownloads: true, ...(useWebkit ? { serviceWorkers: 'block', isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1' } : {}) })
const page = await ctx.newPage()
// No iPhone o app usa a folha de compartilhar em vez de baixar: o teste captura o arquivo entregue a ela.
if (useWebkit)
  await page.addInitScript(() => {
    navigator.share = async (d) => {
      window.__shared = await d.files[0].text()
    }
    navigator.canShare = () => true
  })
/** Executa a ação e devolve o conteúdo do arquivo gerado (download no computador, compartilhar no iPhone). */
async function fileFrom(action) {
  if (useWebkit) {
    await page.evaluate(() => (window.__shared = null))
    await action()
    await page.waitForFunction(() => window.__shared)
    return page.evaluate(() => window.__shared)
  }
  const [dl] = await Promise.all([page.waitForEvent('download'), action()])
  return readFileSync(await dl.path(), 'utf8')
}
await page.clock.setFixedTime(new Date('2026-10-22T10:00:00-03:00')) // quinta-feira, 10h
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && !/status of 429/.test(m.text()) && errors.push(m.text())) // 429 é simulado de propósito

const go = async (path) => {
  await page.goto(URL + '#/' + path)
  await page.waitForTimeout(350)
}
const dialog = () => page.locator('[role="dialog"]').last()
const shot = (n) => page.screenshot({ path: SHOTS + n + '.png', fullPage: true })

await page.goto(URL)
await page.waitForTimeout(500)

await step('Estado vazio + onboarding', async () => {
  await shot('01-onboarding')
  await page.getByPlaceholder('Seu nome (opcional)').fill('Ana')
  await page.getByRole('button', { name: 'Começar' }).click()
  await page.getByText('Bom dia, Ana!').waitFor()
  await page.getByText('Dia em branco').waitFor()
  await shot('02-dashboard-vazio')
})

await step('Criar tarefa (criação rápida com data/hora) e manter após recarregar', async () => {
  await go('tarefas')
  await page.getByLabel('Criação rápida de tarefa').fill('Ligar para o médico amanhã 10h #saude !alta')
  await page.getByLabel('Criar tarefa').click()
  await page.getByText('Ligar para o médico', { exact: true }).waitFor()
  await page.reload()
  await page.waitForTimeout(500)
  await page.getByText('Ligar para o médico', { exact: true }).waitFor()
  const meta = await page.locator('[data-testid="task-row"]').first().innerText()
  assert(/Amanhã/.test(meta) && /10:00/.test(meta), 'data/hora não reconhecidas: ' + meta)
})

await step('Editar e excluir tarefa (com confirmação)', async () => {
  await page.getByText('Ligar para o médico', { exact: true }).click()
  await dialog().getByLabel('Título').fill('Ligar para a clínica')
  await dialog().getByRole('button', { name: 'Salvar' }).click()
  await page.getByText('Ligar para a clínica', { exact: true }).waitFor()
  await page.getByText('Ligar para a clínica', { exact: true }).click()
  await dialog().getByRole('button', { name: 'Excluir' }).click()
  await page.getByText('Excluir tarefa?').waitFor()
  await dialog().getByRole('button', { name: 'Excluir' }).click()
  await page.waitForTimeout(300)
  assert((await page.getByText('Ligar para a clínica', { exact: true }).count()) === 0, 'tarefa não foi excluída')
  await page.reload()
  await page.waitForTimeout(400)
  assert((await page.getByText('Ligar para a clínica', { exact: true }).count()) === 0, 'tarefa voltou após recarregar')
})

await step('Validação: tarefa sem título mostra erro e não salva', async () => {
  await page.getByRole('button', { name: 'Nova tarefa' }).click()
  await dialog().getByRole('button', { name: 'Salvar' }).click()
  await dialog().getByText('Dê um título à tarefa.').waitFor()
  await dialog().getByRole('button', { name: 'Cancelar' }).click()
})

await step('Criar evento e vê-lo na agenda', async () => {
  await go('agenda?data=2026-10-23')
  await page.getByRole('button', { name: 'Novo evento' }).click()
  await dialog().getByLabel('Título').fill('Aula de inglês')
  await dialog().getByLabel('Data').fill('2026-10-23')
  await dialog().getByLabel('Início').fill('14:00')
  await dialog().getByLabel('Duração (min)').fill('90')
  await dialog().getByRole('button', { name: 'Salvar' }).click()
  await page.locator('.ev-block', { hasText: 'Aula de inglês' }).waitFor()
})

await step('Detectar conflito de horário (não salva silenciosamente)', async () => {
  await page.getByRole('button', { name: 'Novo evento' }).click()
  await dialog().getByLabel('Título').fill('Dentista')
  await dialog().getByLabel('Data').fill('2026-10-23')
  await dialog().getByLabel('Início').fill('15:00')
  await dialog().getByText('Conflito de horário').waitFor()
  await dialog().getByRole('button', { name: 'Salvar' }).click()
  await dialog().getByRole('button', { name: 'Salvar mesmo assim' }).waitFor()
  await shot('03-conflito')
  await dialog().getByRole('button', { name: 'Salvar mesmo assim' }).click()
  await page.locator('.ev-block.conflict').first().waitFor()
  await shot('04-agenda-dia')
})

await step('Visões semanal e mensal', async () => {
  await page.getByRole('tab', { name: 'Semana' }).click()
  await page.locator('.week-grid').waitFor()
  await page.getByRole('tab', { name: 'Mês' }).click()
  await page.locator('.month-grid .pill', { hasText: 'Aula de inglês' }).waitFor()
  await shot('05-agenda-mes')
  await page.getByRole('tab', { name: 'Dia' }).click()
})

await step('Projeto com etapas e progresso real', async () => {
  await go('objetivos')
  await page.getByRole('button', { name: 'Novo objetivo' }).click()
  await dialog().getByLabel('Nome').fill('Planejar viagem')
  for (const s of ['Definir destino', 'Reservar hotel']) {
    await dialog().getByPlaceholder('Nova etapa').fill(s)
    await dialog().getByPlaceholder('Nova etapa').press('Enter')
  }
  await dialog().getByRole('button', { name: 'Salvar' }).click()
  await page.getByText('Planejar viagem').click()
  await page.getByText('0%').first().waitFor()
  await page.getByLabel('Concluir etapa Definir destino').click()
  await page.getByText('50%').first().waitFor()
  await page.getByText('Etapa concluída: Definir destino').waitFor()
  await shot('06-objetivo')
})

await step('Criar hábito, registrar conclusão', async () => {
  await go('habitos')
  await page.getByRole('button', { name: 'Novo hábito' }).click()
  await dialog().getByLabel('Nome').fill('Ler')
  await dialog().getByLabel('Meta (opcional)').fill('20 min')
  await dialog().getByRole('button', { name: 'Salvar' }).click()
  await page.getByLabel('Marcar Ler como feito hoje').click()
  await page.getByLabel('Desmarcar Ler').waitFor()
  await page.reload()
  await page.waitForTimeout(400)
  await page.getByLabel('Desmarcar Ler').waitFor()
  await shot('07-habitos')
})

await step('Meta de economia + movimentação financeira', async () => {
  await go('financas')
  await page.getByRole('button', { name: 'Registrar movimentação' }).first().click()
  await dialog().getByLabel('Valor (R$)').fill('1.500,00')
  await dialog().getByRole('tab', { name: 'Receita' }).click()
  await dialog().getByLabel('Descrição').fill('Salário')
  await dialog().getByRole('button', { name: 'Salvar' }).click()
  await page.getByRole('button', { name: 'Registrar movimentação' }).first().click()
  await dialog().getByLabel('Valor (R$)').fill('42,90')
  await dialog().getByLabel('Descrição').fill('Mercado')
  await dialog().getByLabel('Categoria').selectOption({ label: 'Alimentação' })
  await dialog().getByRole('button', { name: 'Salvar' }).click()
  await page.getByText('R$ 1.457,10').first().waitFor()
  await page.getByRole('tab', { name: 'Metas de economia' }).click()
  await page.getByRole('button', { name: 'Nova meta' }).click()
  await dialog().getByLabel('Nome').fill('Viagem')
  await dialog().getByLabel('Valor-alvo (R$)').fill('1000')
  await dialog().getByRole('button', { name: 'Salvar' }).click()
  await page.getByRole('button', { name: 'Registrar valor reservado' }).click()
  await dialog().getByLabel('Valor (R$)').fill('250')
  await dialog().getByRole('button', { name: 'Registrar' }).click()
  await page.getByText('25%').first().waitFor()
  await page.getByRole('tab', { name: 'Resumo' }).click()
  await shot('08-financas')
})

await step('Exportar CSV de finanças válido', async () => {
  await page.getByRole('tab', { name: 'Movimentações' }).click()
  const text = await fileFrom(() => page.getByRole('button', { name: 'Exportar CSV' }).click())
  assert(text.includes('Mercado') && text.includes('-42,90') && text.split('\r\n').length === 3, 'CSV inesperado')
})

await step('Entrada de diário encontrada pela busca global', async () => {
  await go('diario')
  await page.getByRole('button', { name: 'Nova entrada' }).click()
  await dialog().getByLabel('Título').fill('Um dia produtivo')
  await dialog().getByLabel('Texto').fill('Hoje caminhei no parque e pensei em girassóis.')
  await dialog().getByRole('button', { name: 'Salvar' }).click()
  await page.getByText('Um dia produtivo').waitFor()
  await page.keyboard.press('Control+k')
  await page.getByPlaceholder('Buscar tarefas, eventos, diário, finanças…').fill('girassóis')
  await page.locator('.result', { hasText: 'Um dia produtivo' }).waitFor()
  await shot('09-busca')
  await page.keyboard.press('Escape')
})

await step('Reorganizar: propõe sem mover nada até aceitar', async () => {
  // tarefas com prazo + um bloco perdido
  await go('tarefas')
  for (const t of ['Relatório hoje !alta', 'Estudar química amanhã', 'Organizar o quarto']) {
    await page.getByLabel('Criação rápida de tarefa').fill(t)
    await page.getByLabel('Criar tarefa').click()
    await page.waitForTimeout(150)
  }
  await go('reorganizar')
  await page.getByRole('button', { name: 'Gerar proposta' }).click()
  await page.getByText('Proposta de planejamento').waitFor()
  const before = await page.evaluate(() => new Promise((r) => { const o = indexedDB.open('life-os'); o.onsuccess = () => { const q = o.result.transaction('tasks').objectStore('tasks').getAll(); q.onsuccess = () => r(q.result.filter((t) => t.plannedDate).length) } }))
  assert(before === 0, 'tarefas foram alteradas antes da aceitação')
  await shot('10-reorganizar')
  const n = await page.locator('.proposal').count()
  assert(n >= 3, 'esperava 3+ propostas, veio ' + n)
  // recusa uma, aceita o resto
  await page.locator('.proposal').first().getByRole('button', { name: /Recusar/ }).click()
  await page.getByRole('button', { name: /Aceitar/ }).click()
  await page.waitForTimeout(400)
  const after = await page.evaluate(() => new Promise((r) => { const o = indexedDB.open('life-os'); o.onsuccess = () => { const q = o.result.transaction('tasks').objectStore('tasks').getAll(); q.onsuccess = () => r(q.result.filter((t) => t.plannedDate).length) } }))
  assert(after === n - 1, `esperava ${n - 1} tarefas agendadas, veio ${after}`)
  // eventos não foram tocados
  await go('agenda?data=2026-10-23')
  await page.locator('.ev-block', { hasText: 'Aula de inglês' }).waitFor()
})

await step('Assistente: plano para prova + criar tarefa por frase', async () => {
  await go('assistente')
  await page.getByLabel('Mensagem para o assistente').fill('Tenho prova sexta e preciso estudar matemática, português e história')
  await page.getByLabel('Enviar').click()
  await page.getByText('Aqui está um plano de estudos').waitFor()
  await page.getByLabel('Mensagem para o assistente').fill('Adicione uma tarefa para amanhã às 15h: comprar presente')
  await page.getByLabel('Enviar').click()
  await page.getByText('Preparei esta tarefa').waitFor()
  await page.getByRole('button', { name: 'Confirmar' }).last().click()
  await page.getByText('1 alteração aplicada.').waitFor()
  await shot('11-assistente')
})

await step('Estudos: matéria, prova, cronograma e cronômetro de foco', async () => {
  await go('estudos')
  await page.getByRole('button', { name: 'Nova matéria' }).click()
  await dialog().getByLabel('Nome').fill('Matemática')
  await dialog().getByRole('button', { name: 'Salvar' }).click()
  await page.getByRole('tab', { name: 'Provas e planejamento' }).click()
  await page.getByRole('button', { name: 'Nova prova ou trabalho' }).click()
  await dialog().getByLabel('Título').fill('Prova de funções')
  await dialog().getByLabel('Matéria').selectOption({ label: 'Matemática' })
  await dialog().getByLabel('Data').fill('2026-10-27')
  await dialog().getByLabel('Conteúdo (um tópico por linha)').fill('Função afim\nFunção quadrática\nExponencial')
  await dialog().getByRole('button', { name: 'Salvar' }).click()
  await page.getByText('Prova de funções').click()
  await dialog().getByRole('button', { name: 'Sugerir cronograma' }).click()
  await dialog().locator('.proposal').first().waitFor()
  await shot('20-cronograma')
  assert((await dialog().locator('.proposal', { hasText: 'amanhã' }).count()) > 0, 'cronograma não distribuiu sessões em dias diferentes')
  await dialog().getByRole('button', { name: /Aceitar/ }).click()
  await page.getByText(/alterações aplicadas/).waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: 'Cronômetro' }).click()
  await page.getByLabel('O que você está estudando?').fill('Função afim — exercícios')
  await page.getByRole('button', { name: /Iniciar foco/ }).click()
  await page.clock.setFixedTime(new Date('2026-10-22T10:20:00-03:00')) // 20 min de foco
  await page.getByRole('button', { name: 'Encerrar e registrar' }).click()
  await page.getByText(/Sessão de 20 min registrada/).waitFor()
  await page.getByRole('tab', { name: 'Revisões' }).click()
  await page.getByText('Função afim — exercícios').first().waitFor()
  await page.clock.setFixedTime(new Date('2026-10-22T10:30:00-03:00'))
})

await step('Exportar backup completo e validar o arquivo', async () => {
  await go('configuracoes')
  const b = JSON.parse(await fileFrom(() => page.getByRole('button', { name: /Exportar backup completo|Salvar backup/ }).click()))
  assert(b.app === 'life-os' && b.data.tasks.length >= 4 && b.data.journal.length === 1 && b.data.events.length === 2, 'backup incompleto')
  assert(b.settings.name === 'Ana', 'configurações ausentes')
})

await step('Criptografia do diário: esconde na busca e só abre com a senha', async () => {
  await page.getByRole('button', { name: 'Ativar criptografia' }).click()
  await page.getByLabel('Nova senha do diário').fill('girafa azul 42')
  await page.getByLabel('Repita a senha do diário').fill('girafa azul 42')
  await page.getByText('Entendi: se eu esquecer a senha').click()
  await page.getByRole('button', { name: 'Ativar', exact: true }).click()
  await page.getByText('Diário e memórias criptografados.').waitFor()
  const raw = await page.evaluate(() => new Promise((r) => { const o = indexedDB.open('life-os'); o.onsuccess = () => { const q = o.result.transaction('journal').objectStore('journal').getAll(); q.onsuccess = () => r(JSON.stringify(q.result)) } }))
  assert(!/girassóis/.test(raw), 'texto do diário ainda legível no banco')
  await page.reload()
  await go('diario')
  await page.getByText('Diário protegido').waitFor()
  await page.keyboard.press('Control+k')
  await page.getByPlaceholder('Buscar tarefas, eventos, diário, finanças…').fill('girassóis')
  await page.getByText('Nada encontrado').waitFor()
  await page.keyboard.press('Escape')
  await page.getByLabel('Senha do diário').fill('errada')
  await page.getByRole('button', { name: /Desbloquear/ }).click()
  await page.getByText('Senha incorreta.').waitFor()
  await page.getByLabel('Senha do diário').fill('girafa azul 42')
  await page.getByRole('button', { name: /Desbloquear/ }).click()
  await page.getByText('Um dia produtivo').waitFor()
})

await step('Backup protegido por senha: exporta e restaura', async () => {
  await go('configuracoes?secao=dados')
  await page.getByText('Proteger o arquivo de backup com senha').click()
  await page.getByLabel('Senha do backup', { exact: true }).fill('backup123')
  await page.getByLabel('Repita a senha do backup').fill('backup123')
  const txt = await fileFrom(() => page.getByRole('button', { name: /Exportar backup completo|Salvar backup/ }).click())
  assert(JSON.parse(txt).protegido === true && !/Estudar química/.test(txt), 'backup não está protegido')
  await page.locator('input[type=file]').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(txt) })
  await page.getByLabel('Senha do backup').last().fill('backup123')
  await page.getByRole('button', { name: 'Abrir' }).click()
  await page.getByRole('button', { name: 'Substituir e restaurar' }).click()
  await page.getByText('Backup restaurado.').waitFor()
  await go('tarefas?filtro=todas')
  await page.getByText('Estudar química', { exact: true }).waitFor()
})

await step('Exportar agenda para o calendário do celular (.ics)', async () => {
  await go('agenda?data=2026-10-23')
  await page.getByTitle('Levar para o calendário do celular').click()
  const ics = await fileFrom(() => page.getByRole('button', { name: /Gerar arquivo/ }).click())
  assert(ics.startsWith('BEGIN:VCALENDAR') && ics.includes('SUMMARY:Aula de inglês') && ics.includes('BEGIN:VALARM'), 'ics inválido')
})

await step('IA opcional (Groq simulada): configura, responde e volta às regras se o limite acabar', async () => {
  let mode = 'ok'
  await page.route('https://api.groq.com/**', (route) =>
    mode === 'ok'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ resposta: 'Sugiro adiantar a leitura amanhã cedo.', explicacao: ['Você tem horário livre de manhã.'], acoes: [{ tipo: 'criar_tarefa', titulo: 'Ler capítulo 3', data: '2026-10-23', prioridade: 'media', estimativaMin: 30, motivo: 'Horário livre.' }] }) } }] }) })
      : route.fulfill({ status: 429, body: '{}' }),
  )
  await go('configuracoes?secao=ia')
  await page.getByRole('tab', { name: 'Groq (recomendado)' }).click()
  await page.getByPlaceholder('gsk_…').fill('gsk_chave_de_teste_123')
  await page.locator('#sec-ia').getByRole('button', { name: 'Salvar', exact: true }).click()
  await page.getByText('marque a caixa de consentimento').waitFor()
  await page.getByText('Entendi e autorizo o envio').click()
  await page.getByRole('button', { name: 'Testar conexão' }).click()
  await page.getByText(/Funcionou! Conectado a Groq/).waitFor()
  await page.locator('#sec-ia').getByRole('button', { name: 'Salvar', exact: true }).click()
  await page.getByText('IA configurada.').waitFor()
  await go('assistente')
  await page.getByText(/IA: Groq/).waitFor()
  await page.getByLabel('Mensagem para o assistente').fill('o que posso adiantar amanhã de manhã?')
  await page.getByLabel('Enviar').click()
  await page.getByText('Sugiro adiantar a leitura amanhã cedo.').waitFor()
  await page.getByText(/Gerado por IA · Groq/).waitFor()
  await page.getByRole('button', { name: 'Confirmar' }).last().click()
  await page.getByText('1 alteração aplicada.').waitFor()
  mode = 'limite'
  await page.getByLabel('Mensagem para o assistente').fill('o que tenho hoje?')
  await page.getByLabel('Enviar').click()
  await page.getByText(/limite gratuito de uso da IA/).waitFor()
  await shot('21-assistente-ia')
})

await step('Dados continuam após "reiniciar" (nova aba)', async () => {
  const p2 = await ctx.newPage()
  await p2.goto(URL + '#/tarefas?filtro=todas')
  await p2.getByText('Estudar química', { exact: true }).waitFor()
  await p2.close()
})

await step('Interface no computador (claro e escuro)', async () => {
  await page.setViewportSize({ width: 1440, height: 900 })
  for (const [path, name] of [['inicio', '12-desk-inicio'], ['agenda?data=2026-10-23', '13-desk-agenda'], ['tarefas', '14-desk-tarefas'], ['estudos', '15-desk-estudos'], ['financas', '16-desk-financas'], ['configuracoes', '17-desk-config']]) {
    await go(path)
    await page.screenshot({ path: SHOTS + name + '.png' })
  }
  await page.getByRole('button', { name: 'Usar tema escuro' }).click()
  await go('inicio')
  await page.screenshot({ path: SHOTS + '18-desk-escuro.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await go('inicio')
  await shot('19-mobile-escuro')
  // sem rolagem horizontal no celular
  for (const p of ['inicio', 'agenda', 'tarefas', 'financas', 'habitos', 'diario', 'estudos', 'objetivos', 'configuracoes', 'reorganizar', 'assistente', 'mais']) {
    await go(p)
    const w = await page.evaluate(() => document.documentElement.scrollWidth)
    assert(w <= 390, `rolagem horizontal em ${p}: ${w}px`)
  }
})

await step('Sem erros no console', async () => {
  assert(errors.length === 0, errors.join(' | '))
})

await browser.close()
const failed = results.filter((r) => r[0] === '✗')
console.log(`\n${results.length - failed.length}/${results.length} cenários passaram`)
process.exit(failed.length ? 1 : 0)
