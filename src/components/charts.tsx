import { useState } from 'react'
import { fmtMoney } from '../lib/finance'

const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)']

/** Receitas × despesas por mês. Duas séries, legenda + tooltip ao passar o mouse/tocar. */
export function MonthBars({ months }: { months: { label: string; income: number; expense: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...months.flatMap((m) => [m.income, m.expense]))
  return (
    <div>
      <div className="legend" style={{ marginBottom: 4 }}>
        <span>
          <i className="swatch" style={{ background: 'var(--s1)' }} /> Receitas
        </span>
        <span>
          <i className="swatch" style={{ background: 'var(--s2)' }} /> Despesas
        </span>
      </div>
      <div className="bars" style={{ position: 'relative' }} role="img" aria-label="Receitas e despesas por mês">
        {months.map((m, i) => (
          <div
            key={m.label}
            className="b"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={() => setHover(hover === i ? null : i)}
            style={{ cursor: 'default', position: 'relative' }}
          >
            {hover === i && (
              <div className="chart-tip" style={{ left: '50%', top: `${100 - (Math.max(m.income, m.expense) / max) * 100 + 8}%` }}>
                <b>{m.label}</b>
                <div>Receitas: {fmtMoney(m.income)}</div>
                <div>Despesas: {fmtMoney(m.expense)}</div>
              </div>
            )}
            <div className="pair" style={{ opacity: hover == null || hover === i ? 1 : 0.55 }}>
              <i className="inc" style={{ height: `${(m.income / max) * 100}%` }} />
              <i className="exp" style={{ height: `${(m.expense / max) * 100}%` }} />
            </div>
            <span className="lbl">{m.label}</span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>Receitas e despesas por mês</caption>
        <tbody>
          {months.map((m) => (
            <tr key={m.label}>
              <th>{m.label}</th>
              <td>{fmtMoney(m.income)}</td>
              <td>{fmtMoney(m.expense)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Rosca de despesas por categoria: até 5 fatias + "Outros". Legenda sempre visível com valores. */
export function Donut({ items }: { items: { name: string; cents: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const top = items.slice(0, 5)
  const rest = items.slice(5).reduce((s, x) => s + x.cents, 0)
  const slices = rest > 0 ? [...top, { name: 'Outros', cents: rest }] : top
  const total = slices.reduce((s, x) => s + x.cents, 0)
  const R = 54
  const C = 2 * Math.PI * R
  const gap = slices.length > 1 ? 2.5 : 0
  let acc = 0
  const color = (i: number, name: string) => (name === 'Outros' && i === slices.length - 1 && rest > 0 ? 'var(--s-other)' : SERIES[i])
  return (
    <div className="donut-wrap">
      <svg width="150" height="150" viewBox="0 0 150 150" role="img" aria-label="Despesas por categoria">
        <circle cx="75" cy="75" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="18" />
        {slices.map((s, i) => {
          const len = (s.cents / total) * C
          const el = (
            <circle
              key={s.name}
              cx="75"
              cy="75"
              r={R}
              fill="none"
              stroke={color(i, s.name)}
              strokeWidth={hover === i ? 22 : 18}
              strokeDasharray={`${Math.max(0, len - gap)} ${C}`}
              strokeDashoffset={-acc}
              transform="rotate(-90 75 75)"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ transition: 'stroke-width .15s' }}
            />
          )
          acc += len
          return el
        })}
        <text x="75" y="71" textAnchor="middle" fontSize="11" fill="var(--text-2)">
          {hover != null ? slices[hover].name : 'Total'}
        </text>
        <text x="75" y="89" textAnchor="middle" fontSize="14" fontWeight="600" fill="var(--text)">
          {fmtMoney(hover != null ? slices[hover].cents : total).replace(',00', '')}
        </text>
      </svg>
      <div className="stack-sm grow" style={{ minWidth: 170 }}>
        {slices.map((s, i) => (
          <div key={s.name} className="row small" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ fontWeight: hover === i ? 600 : undefined }}>
            <i className="swatch" style={{ background: color(i, s.name) }} />
            <span className="grow ellipsis">{s.name}</span>
            <span className="num muted">{Math.round((s.cents / total) * 100)}%</span>
            <span className="num" style={{ minWidth: 86, textAlign: 'right' }}>
              {fmtMoney(s.cents)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
