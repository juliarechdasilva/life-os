import { addMonths, monthKey } from './dates'
import type { FinCategory, SavingsGoal, Transaction } from './types'

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function fmtMoney(cents: number): string {
  return BRL.format(cents / 100)
}

/** Converte "1.234,56", "1234.56", "R$ 50" em centavos. Retorna null se inválido. */
export function parseMoney(input: string): number | null {
  let s = input.replace(/R\$|\s/g, '').trim()
  if (!s) return null
  if (/^-/.test(s)) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const v = Math.round(parseFloat(s) * 100)
  return Number.isFinite(v) ? v : null
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

export function balance(txs: Transaction[]): number {
  return txs.reduce((s, t) => s + (t.type === 'receita' ? t.amountCents : -t.amountCents), 0)
}

export function monthTotals(txs: Transaction[], month: string) {
  let income = 0
  let expense = 0
  for (const t of txs) {
    if (monthKey(t.date) !== month) continue
    if (t.type === 'receita') income += t.amountCents
    else expense += t.amountCents
  }
  return { income, expense, net: income - expense }
}

export function lastMonths(ref: string, n: number): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) out.push(monthKey(addMonths(`${ref}-01`.slice(0, 10), -i)))
  return out
}

export function byCategory(txs: Transaction[], month: string, cats: FinCategory[]) {
  const map = new Map<string, number>()
  for (const t of txs) {
    if (t.type !== 'despesa' || monthKey(t.date) !== month) continue
    const k = t.categoryId ?? 'sem'
    map.set(k, (map.get(k) ?? 0) + t.amountCents)
  }
  return [...map.entries()]
    .map(([id, cents]) => {
      const c = cats.find((x) => x.id === id)
      return { id, name: c?.name ?? 'Sem categoria', color: c?.color ?? 'cinza', cents, limit: c?.monthlyLimitCents }
    })
    .sort((a, b) => b.cents - a.cents)
}

export function savedIn(g: SavingsGoal): number {
  return g.contributions.reduce((s, c) => s + c.amountCents, 0)
}

const csvCell = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/** CSV com ";" e vírgula decimal — abre direto no Excel/Sheets em português. */
export function toCSV(txs: Transaction[], cats: FinCategory[]): string {
  const head = ['Data', 'Tipo', 'Descrição', 'Categoria', 'Valor (R$)', 'Recorrente', 'Observações']
  const rows = [...txs]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((t) => [
      t.date.split('-').reverse().join('/'),
      t.type === 'receita' ? 'Receita' : 'Despesa',
      t.description,
      cats.find((c) => c.id === t.categoryId)?.name ?? '',
      ((t.type === 'despesa' ? -1 : 1) * t.amountCents / 100).toFixed(2).replace('.', ','),
      t.recurring ? 'Sim' : 'Não',
      t.notes,
    ])
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n')
}
