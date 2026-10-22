import { Download, Edit3, PiggyBank, Plus, Repeat, Search, Trash2, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Donut, MonthBars } from '../components/charts'
import { Card, ColorPick, Empty, Field, Modal, Progress, Seg, Tabs } from '../components/ui'
import { shareOrDownload } from '../lib/backup'
import { addMonths, fmtDate, fmtRelative, MONTHS, MONTHS_SHORT, today } from '../lib/dates'
import { balance, byCategory, centsToInput, fmtMoney, lastMonths, monthTotals, parseMoney, savedIn, toCSV } from '../lib/finance'
import { norm } from '../lib/nlp'
import { patch, remove, save, uid, useData } from '../lib/store'
import type { FinCategory, SavingsGoal } from '../lib/types'
import { attempt, confirm, openEditor, useRoute } from '../lib/ui'

type Tab = 'resumo' | 'movimentacoes' | 'metas' | 'limites'
const monthName = (m: string) => `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`

export default function Finance() {
  const data = useData()
  const { params } = useRoute()
  const ref = today()
  const [tab, setTab] = useState<Tab>('resumo')
  const [month, setMonth] = useState(ref.slice(0, 7))
  useEffect(() => {
    const id = params.get('id')
    if (id) {
      setTab('movimentacoes')
      openEditor({ type: 'transaction', id })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const txs = data.transactions

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Finanças</h1>
          <p>Registro manual, só neste aparelho. Sem conexão com bancos.</p>
        </div>
        <button className="btn primary sm" onClick={() => openEditor({ type: 'transaction' })}>
          <Plus size={16} /> Registrar movimentação
        </button>
      </div>
      <Tabs
        label="Seções de finanças"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'resumo', label: 'Resumo' },
          { value: 'movimentacoes', label: 'Movimentações' },
          { value: 'metas', label: 'Metas de economia' },
          { value: 'limites', label: 'Limites e categorias' },
        ]}
      />
      {tab === 'resumo' && (txs.length === 0 ? <FirstUse /> : <Summary month={month} setMonth={setMonth} />)}
      {tab === 'movimentacoes' && <Transactions />}
      {tab === 'metas' && <Savings />}
      {tab === 'limites' && <Limits month={month} />}
    </div>
  )
}

function FirstUse() {
  return (
    <div className="card">
      <Empty title="Comece registrando uma movimentação" icon={<Wallet size={34} />} action={<button className="btn primary" onClick={() => openEditor({ type: 'transaction' })}>Registrar movimentação</button>}>
        O saldo, os gráficos e as comparações são calculados apenas a partir do que você registrar. Nada é estimado ou inventado.
      </Empty>
    </div>
  )
}

function MonthPicker({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  return (
    <div className="row">
      <button className="btn sm ghost" onClick={() => setMonth(addMonths(month + '-01', -1).slice(0, 7))} aria-label="Mês anterior">
        ‹
      </button>
      <b className="small" style={{ minWidth: 120, textAlign: 'center', textTransform: 'capitalize' }}>
        {monthName(month)}
      </b>
      <button className="btn sm ghost" onClick={() => setMonth(addMonths(month + '-01', 1).slice(0, 7))} aria-label="Próximo mês">
        ›
      </button>
    </div>
  )
}

function Summary({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const data = useData()
  const txs = data.transactions
  const bal = balance(txs)
  const cur = monthTotals(txs, month)
  const prevMonth = addMonths(month + '-01', -1).slice(0, 7)
  const prev = monthTotals(txs, prevMonth)
  const months = lastMonths(month, 6).map((m) => ({ label: MONTHS_SHORT[+m.slice(5, 7) - 1], ...monthTotals(txs, m) }))
  const cats = byCategory(txs, month, data.finCategories)
  const prevCats = byCategory(txs, prevMonth, data.finCategories)
  const limits = data.finCategories.filter((c) => c.kind === 'despesa' && c.monthlyLimitCents)
  const recurring = txs.filter((t) => t.recurring)
  const recurringUnique = [...new Map(recurring.sort((a, b) => b.date.localeCompare(a.date)).map((t) => [norm(t.description), t])).values()]
  const diff = cur.expense - prev.expense

  return (
    <div className="dash">
      <div className="grid">
        <Card>
          <div className="row between wrap">
            <span className="small muted">Saldo calculado (todos os registros)</span>
            <MonthPicker month={month} setMonth={setMonth} />
          </div>
          <div className={`big-money ${bal < 0 ? 'neg' : ''}`}>{fmtMoney(bal)}</div>
          <div className="row wrap small" style={{ gap: 16, marginTop: 6 }}>
            <span className="row pos" style={{ gap: 4 }}>
              <TrendingUp size={15} /> {fmtMoney(cur.income)} entradas
            </span>
            <span className="row" style={{ gap: 4, color: 'var(--text-2)' }}>
              <TrendingDown size={15} /> {fmtMoney(cur.expense)} saídas
            </span>
            <span className={cur.net >= 0 ? 'pos' : 'neg'}>
              {cur.net >= 0 ? '+' : '−'}
              {fmtMoney(Math.abs(cur.net))} no mês
            </span>
          </div>
          <div style={{ marginTop: 16 }}>
            <MonthBars months={months} />
          </div>
        </Card>
        <Card title={`Despesas por categoria — ${monthName(month)}`}>
          {cats.length === 0 ? <p className="small muted">Nenhuma despesa registrada neste mês.</p> : <Donut items={cats.map((c) => ({ name: c.name, cents: c.cents }))} />}
        </Card>
      </div>
      <div className="grid">
        <Card title="Comparação com o mês anterior">
          {prev.expense === 0 && cur.expense === 0 ? (
            <p className="small muted">Sem despesas nos dois meses.</p>
          ) : (
            <>
              <p className="small" style={{ marginBottom: 10 }}>
                {prev.expense === 0
                  ? `Sem despesas em ${monthName(prevMonth)} para comparar.`
                  : `Você gastou ${fmtMoney(Math.abs(diff))} ${diff > 0 ? 'a mais' : 'a menos'} que em ${monthName(prevMonth)} (${diff > 0 ? '+' : '−'}${Math.round((Math.abs(diff) / prev.expense) * 100)}%).`}
              </p>
              <table className="simple">
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th style={{ textAlign: 'right' }}>{MONTHS_SHORT[+prevMonth.slice(5, 7) - 1]}</th>
                    <th style={{ textAlign: 'right' }}>{MONTHS_SHORT[+month.slice(5, 7) - 1]}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...new Set([...cats, ...prevCats].map((c) => c.name))].map((name) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{fmtMoney(prevCats.find((c) => c.name === name)?.cents ?? 0)}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{fmtMoney(cats.find((c) => c.name === name)?.cents ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Card>
        <Card title="Limites do mês">
          {limits.length === 0 ? (
            <p className="small muted">Defina limites de gastos por categoria na aba "Limites e categorias".</p>
          ) : (
            <div className="stack">
              {limits.map((c) => {
                const spent = cats.find((x) => x.id === c.id)?.cents ?? 0
                const pct = (spent / c.monthlyLimitCents!) * 100
                return (
                  <div key={c.id} className="stack-sm">
                    <div className="row between small">
                      <span>{c.name}</span>
                      <span className={`num ${pct > 100 ? 'neg' : 'faint'}`}>
                        {fmtMoney(spent)} / {fmtMoney(c.monthlyLimitCents!)}
                      </span>
                    </div>
                    <Progress value={pct} over={pct > 100} />
                    {pct > 100 && <span className="tiny neg">Passou {fmtMoney(spent - c.monthlyLimitCents!)} do limite.</span>}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
        <Card title="Despesas e receitas recorrentes">
          {recurringUnique.length === 0 ? (
            <p className="small muted">Marque uma movimentação como "recorrente" para acompanhá-la aqui (ex.: aluguel, assinatura, salário).</p>
          ) : (
            <div className="list">
              {recurringUnique.map((t) => (
                <button key={t.id} className="list-item clickable" style={{ border: 0, borderBottom: '1px solid var(--line)', background: 'none', width: '100%', textAlign: 'left' }} onClick={() => openEditor({ type: 'transaction', id: t.id })}>
                  <Repeat size={15} className="faint" />
                  <span className="grow small">
                    {t.description}
                    <div className="tiny faint">último: {fmtDate(t.date)}</div>
                  </span>
                  <span className={`num small ${t.type === 'receita' ? 'pos' : ''}`}>
                    {t.type === 'receita' ? '+' : '−'}
                    {fmtMoney(t.amountCents)}
                  </span>
                </button>
              ))}
              <button
                className="btn sm"
                style={{ marginTop: 10 }}
                onClick={async () => {
                  const m = today().slice(0, 7)
                  const missing = recurringUnique.filter((t) => !data.transactions.some((x) => norm(x.description) === norm(t.description) && x.date.slice(0, 7) === m))
                  if (!missing.length) return confirm({ title: 'Tudo lançado', body: 'Todas as recorrentes já têm registro neste mês.', confirmLabel: 'Ok' })
                  if (await confirm({ title: `Lançar ${missing.length} recorrente(s) neste mês?`, body: missing.map((t) => `• ${t.description} — ${fmtMoney(t.amountCents)}`).join('\n') + '\n\nOs valores são copiados do último registro. Edite depois se mudarem.', confirmLabel: 'Lançar' }))
                    for (const t of missing) {
                      const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = t
                      void _i, void _c, void _u
                      await attempt(() => save('transactions', { ...rest, date: today() }))
                    }
                }}
              >
                Lançar recorrentes deste mês
              </button>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function Transactions() {
  const data = useData()
  const [q, setQ] = useState('')
  const [type, setType] = useState<'todas' | 'receita' | 'despesa'>('todas')
  const [cat, setCat] = useState('')
  const [month, setMonth] = useState('')
  const list = useMemo(
    () =>
      data.transactions
        .filter((t) => type === 'todas' || t.type === type)
        .filter((t) => !cat || t.categoryId === cat)
        .filter((t) => !month || t.date.startsWith(month))
        .filter((t) => !q.trim() || norm(t.description + ' ' + t.notes).includes(norm(q)))
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [data.transactions, type, cat, month, q],
  )
  const months = [...new Set(data.transactions.map((t) => t.date.slice(0, 7)))].sort().reverse()
  const total = list.reduce((s, t) => s + (t.type === 'receita' ? t.amountCents : -t.amountCents), 0)
  const byDate = new Map<string, typeof list>()
  for (const t of list) byDate.set(t.date, [...(byDate.get(t.date) ?? []), t])

  return (
    <div className="stack">
      <div className="row wrap">
        <label className="searchbox" style={{ minWidth: 0, flex: '1 1 200px', display: 'flex' }}>
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar movimentações" style={{ border: 0, background: 'none', minWidth: 0, flex: 1 }} aria-label="Pesquisar movimentações" />
        </label>
        <Seg label="Tipo" value={type} onChange={setType} options={[{ value: 'todas', label: 'Todas' }, { value: 'receita', label: 'Receitas' }, { value: 'despesa', label: 'Despesas' }]} />
        <select className="select" style={{ width: 'auto' }} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {data.finCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="select" style={{ width: 'auto' }} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mês">
          <option value="">Todos os meses</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthName(m)}
            </option>
          ))}
        </select>
        <button className="btn sm" disabled={!list.length} onClick={() => shareOrDownload(`life-os-financas-${today()}.csv`, toCSV(list, data.finCategories), 'text/csv')}>
          <Download size={15} /> Exportar CSV
        </button>
      </div>
      {list.length > 0 && (
        <p className="small muted">
          {list.length} movimentaç{list.length === 1 ? 'ão' : 'ões'} · resultado {total >= 0 ? '+' : '−'}
          {fmtMoney(Math.abs(total))}
        </p>
      )}
      {list.length === 0 ? (
        <div className="card">
          <Empty compact title={data.transactions.length ? 'Nada encontrado' : 'Nenhuma movimentação ainda'} icon={<Wallet size={28} />}>
            {data.transactions.length ? 'Ajuste os filtros.' : 'Registre receitas e despesas para acompanhar seu saldo.'}
          </Empty>
        </div>
      ) : (
        [...byDate.entries()].map(([d, items]) => (
          <section key={d}>
            <div className="group-label">{fmtRelative(d)}</div>
            <div className="card" style={{ padding: '4px 14px' }}>
              <div className="list">
                {items.map((t) => {
                  const c = data.finCategories.find((x) => x.id === t.categoryId)
                  return (
                    <button key={t.id} className="list-item clickable" style={{ border: 0, borderBottom: '1px solid var(--line)', background: 'none', width: '100%', textAlign: 'left' }} onClick={() => openEditor({ type: 'transaction', id: t.id })}>
                      <span className="icon-tile" data-c={c?.color ?? 'cinza'} style={{ width: 34, height: 34 }}>
                        {t.type === 'receita' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                      </span>
                      <span className="grow">
                        <div className="ellipsis">{t.description}</div>
                        <div className="tiny faint">
                          {c?.name ?? 'Sem categoria'}
                          {t.recurring && ' · recorrente'}
                        </div>
                      </span>
                      <span className={`num ${t.type === 'receita' ? 'pos' : ''}`}>
                        {t.type === 'receita' ? '+' : '−'}
                        {fmtMoney(t.amountCents)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </section>
        ))
      )}
    </div>
  )
}

function Savings() {
  const data = useData()
  const [edit, setEdit] = useState<SavingsGoal | 'new' | null>(null)
  const [contrib, setContrib] = useState<SavingsGoal | null>(null)
  return (
    <div className="stack">
      <div className="callout neutral">
        <PiggyBank size={18} />
        <span className="small">Valores reservados são uma marcação para acompanhar sua meta — não alteram o saldo calculado. Para refletir no saldo, registre também uma despesa (ex.: "Transferência para poupança").</span>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn primary sm" onClick={() => setEdit('new')}>
          <Plus size={16} /> Nova meta
        </button>
      </div>
      {data.savings.length === 0 ? (
        <div className="card">
          <Empty title="Junte para algo que importa" icon={<PiggyBank size={34} />}>
            Uma viagem, uma reserva de emergência, um curso… Crie uma meta e registre quanto já reservou.
          </Empty>
        </div>
      ) : (
        <div className="grid-3">
          {data.savings.map((g) => {
            const saved = savedIn(g)
            const pct = (saved / g.targetCents) * 100
            return (
              <Card
                key={g.id}
                title={<h3>{g.name}</h3>}
                action={
                  <div className="row" style={{ gap: 0 }}>
                    <button className="icon-btn sm" aria-label={`Editar ${g.name}`} onClick={() => setEdit(g)}>
                      <Edit3 size={15} />
                    </button>
                    <button
                      className="icon-btn sm"
                      aria-label={`Excluir ${g.name}`}
                      onClick={async () => (await confirm({ title: 'Excluir meta?', body: `"${g.name}" e seus registros de reserva serão apagados.`, confirmLabel: 'Excluir', danger: true })) && attempt(() => remove('savings', g.id), 'Meta excluída.')}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                }
              >
                <div className="big-money" style={{ fontSize: 26 }}>{fmtMoney(saved)}</div>
                <div className="small faint" style={{ marginBottom: 8 }}>
                  de {fmtMoney(g.targetCents)} · {Math.min(100, Math.round(pct))}%{g.targetDate && ` · até ${fmtDate(g.targetDate)}`}
                </div>
                <Progress value={pct} />
                {saved >= g.targetCents && <p className="small pos" style={{ marginTop: 8 }}>Meta alcançada! 🎉</p>}
                <button className="btn sm block" style={{ marginTop: 12 }} onClick={() => setContrib(g)}>
                  <Plus size={15} /> Registrar valor reservado
                </button>
                {g.contributions.length > 0 && (
                  <div className="list" style={{ marginTop: 8 }}>
                    {[...g.contributions].reverse().slice(0, 5).map((c) => (
                      <div key={c.id} className="list-item tiny">
                        <span className="grow">
                          {fmtDate(c.date)} {c.note && `· ${c.note}`}
                        </span>
                        <span className="num">{c.amountCents < 0 ? '−' : '+'}{fmtMoney(Math.abs(c.amountCents))}</span>
                        <button
                          className="icon-btn sm"
                          aria-label="Remover registro"
                          onClick={async () => (await confirm({ title: 'Remover este registro?', confirmLabel: 'Remover', danger: true })) && attempt(() => patch('savings', g.id, { contributions: g.contributions.filter((x) => x.id !== c.id) }))}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
      {edit && <SavingsForm goal={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {contrib && <ContributionForm goal={contrib} onClose={() => setContrib(null)} />}
    </div>
  )
}

function SavingsForm({ goal, onClose }: { goal?: SavingsGoal; onClose: () => void }) {
  const [name, setName] = useState(goal?.name ?? '')
  const [target, setTarget] = useState(goal ? centsToInput(goal.targetCents) : '')
  const [date, setDate] = useState(goal?.targetDate ?? '')
  const [err, setErr] = useState<Record<string, string>>({})
  async function submit() {
    const e: Record<string, string> = {}
    const cents = parseMoney(target)
    if (!name.trim()) e.name = 'Dê um nome à meta.'
    if (!cents) e.target = 'Informe um valor maior que zero.'
    setErr(e)
    if (Object.keys(e).length) return
    const ok = await attempt(() => save('savings', { ...(goal ?? { contributions: [] }), name: name.trim(), targetCents: cents!, targetDate: date || undefined } as SavingsGoal), goal ? 'Meta atualizada.' : 'Meta criada.')
    if (ok) onClose()
  }
  return (
    <Modal title={goal ? 'Editar meta de economia' : 'Nova meta de economia'} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={submit}>Salvar</button></>}>
      <form className="stack" onSubmit={(e) => (e.preventDefault(), submit())}>
        <Field label="Nome" error={err.name}>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Viagem para Gramado" />
        </Field>
        <Field label="Valor-alvo (R$)" error={err.target}>
          <input className="input num" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0,00" />
        </Field>
        <Field label="Data-alvo (opcional)">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

function ContributionForm({ goal, onClose }: { goal: SavingsGoal; onClose: () => void }) {
  const [amount, setAmount] = useState('')
  const [withdraw, setWithdraw] = useState(false)
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  async function submit() {
    const cents = parseMoney(amount)
    if (!cents) return setErr('Informe um valor maior que zero.')
    const ok = await attempt(() => patch('savings', goal.id, { contributions: [...goal.contributions, { id: uid(), date, amountCents: withdraw ? -cents : cents, note: note.trim() }] }), withdraw ? 'Retirada registrada.' : 'Valor reservado registrado.')
    if (ok) onClose()
  }
  return (
    <Modal title={goal.name} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={submit}>Registrar</button></>}>
      <form className="stack" onSubmit={(e) => (e.preventDefault(), submit())}>
        <Seg full label="Tipo" value={withdraw ? 'r' : 'g'} onChange={(v) => setWithdraw(v === 'r')} options={[{ value: 'g', label: 'Reservar' }, { value: 'r', label: 'Retirar' }]} />
        <Field label="Valor (R$)" error={err}>
          <input className="input num" autoFocus inputMode="decimal" value={amount} onChange={(e) => (setAmount(e.target.value), setErr(''))} placeholder="0,00" />
        </Field>
        <Field label="Data">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Observação (opcional)">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

function Limits({ month }: { month: string }) {
  const data = useData()
  const [newCat, setNewCat] = useState<{ name: string; kind: 'despesa' | 'receita'; color: string } | null>(null)
  const cats = byCategory(data.transactions, month, data.finCategories)
  const row = (c: FinCategory) => (
    <LimitRow key={c.id} c={c} spent={cats.find((x) => x.id === c.id)?.cents ?? 0} inUse={data.transactions.some((t) => t.categoryId === c.id)} />
  )
  return (
    <div className="grid-2">
      <Card title="Despesas — limite mensal">
        <p className="small muted" style={{ marginBottom: 10 }}>Deixe em branco para não ter limite. Gastos de {monthName(month)} ao lado.</p>
        <div className="list">{data.finCategories.filter((c) => c.kind === 'despesa').map(row)}</div>
      </Card>
      <div className="grid">
        <Card title="Receitas">
          <div className="list">{data.finCategories.filter((c) => c.kind === 'receita').map(row)}</div>
        </Card>
        <Card title="Nova categoria">
          {newCat ? (
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault()
                if (!newCat.name.trim()) return
                const ok = await attempt(() => save('finCategories', { name: newCat.name.trim(), kind: newCat.kind, color: newCat.color }), 'Categoria criada.')
                if (ok) setNewCat(null)
              }}
            >
              <input className="input" autoFocus value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} placeholder="Nome" aria-label="Nome da categoria" />
              <Seg label="Tipo" value={newCat.kind} onChange={(kind) => setNewCat({ ...newCat, kind })} options={[{ value: 'despesa', label: 'Despesa' }, { value: 'receita', label: 'Receita' }]} />
              <ColorPick value={newCat.color} onChange={(color) => setNewCat({ ...newCat, color })} />
              <div className="row">
                <button className="btn primary sm" type="submit" disabled={!newCat.name.trim()}>
                  Criar
                </button>
                <button className="btn ghost sm" type="button" onClick={() => setNewCat(null)}>
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <button className="btn sm" onClick={() => setNewCat({ name: '', kind: 'despesa', color: 'salvia' })}>
              <Plus size={15} /> Adicionar categoria
            </button>
          )}
        </Card>
      </div>
    </div>
  )
}

function LimitRow({ c, spent, inUse }: { c: FinCategory; spent: number; inUse: boolean }) {
  const [v, setV] = useState(c.monthlyLimitCents ? centsToInput(c.monthlyLimitCents) : '')
  const commit = () => {
    const cents = v.trim() ? parseMoney(v) : undefined
    if (v.trim() && !cents) return setV(c.monthlyLimitCents ? centsToInput(c.monthlyLimitCents) : '')
    if (cents !== c.monthlyLimitCents) attempt(() => patch('finCategories', c.id, { monthlyLimitCents: cents ?? undefined }), cents ? `Limite de ${c.name}: ${fmtMoney(cents)}.` : `Limite de ${c.name} removido.`)
  }
  return (
    <div className="list-item" data-c={c.color}>
      <i className="dot-c" />
      <span className="grow small">
        {c.name}
        {c.kind === 'despesa' && <div className="tiny faint">{fmtMoney(spent)} no mês</div>}
      </span>
      {c.kind === 'despesa' && (
        <input className="input num" style={{ width: 110, minHeight: 36 }} inputMode="decimal" placeholder="Sem limite" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label={`Limite mensal de ${c.name}`} />
      )}
      <button
        className="icon-btn sm"
        aria-label={`Excluir categoria ${c.name}`}
        onClick={async () => (await confirm({ title: `Excluir "${c.name}"?`, body: inUse ? 'Movimentações com esta categoria ficarão "Sem categoria".' : undefined, confirmLabel: 'Excluir', danger: true })) && attempt(() => remove('finCategories', c.id), 'Categoria excluída.')}
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}
