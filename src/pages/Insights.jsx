import { useState } from 'react'
import { useApp } from '../lib/store'
import { api } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { DF, LV, pad, toHeatRows } from '../lib/time'
import { Legend } from '../ui'

const HOURS = Array.from({ length: 17 }, (_, i) => i + 7)

export default function Insights({ mob }) {
  const { residence } = useApp()
  const [heat, setHeat] = useState({ d: 6, h: 15 })
  // facts, the heatmap and the "N machines in use" estimate are all computed by the database
  const sum = useAsync(api.insights, []).data
  const rows = toHeatRows(useAsync(api.heatmap, []).data ?? [])
  const inUse = useAsync(() => api.estimateInUse(heat.d, heat.h), [heat.d, heat.h, residence?.id]).data
  const cell = rows[heat.d]?.cells.find((c) => c.h === heat.h)
  const m = residence?.washer_count ?? 0
  const hs = mob ? 30 : 36
  const facts = sum ? [
    { k: 'Busiest day', v: DF[sum.busiest_weekday] },
    { k: 'Quietest day', v: DF[sum.quietest_weekday] },
    { k: 'Busiest hour', v: pad(sum.busiest_hour) + ':00' },
    { k: 'Quietest hour', v: pad(sum.quietest_hour) + ':00' },
  ] : []

  return (
    <div>
      <h1 style={{ fontSize: mob ? 30 : 40, letterSpacing: '-0.03em' }}>Insights</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,230px),1fr))', borderTop: '2px solid var(--color-divider)', borderBottom: '2px solid var(--color-divider)', margin: '20px 0 28px', minHeight: 90 }}>
        {facts.map((f) => (
          <div key={f.k} style={{ padding: '16px 16px 16px 0' }}>
            <div style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', opacity: 0.65 }}>{f.k}</div>
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.15 }}>{f.v}</div>
          </div>
        ))}
      </div>

      <div style={{ border: '2px solid var(--color-divider)', padding: mob ? 16 : 24, borderRadius: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <h4 style={{ margin: 0 }}>Week at a glance</h4><span className="tag tag-neutral">Simulated</span>
        </div>
        <div style={{ display: 'grid', gap: 3 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '34px repeat(17,minmax(0,1fr))', gap: 3, fontSize: 10, opacity: 0.65 }}>
            <span />{HOURS.map((h) => <span key={h} style={{ whiteSpace: 'nowrap' }}>{h % 3 === 1 ? pad(h) : ''}</span>)}
          </div>
          {rows.map((r) => (
            <div key={r.day} style={{ display: 'grid', gridTemplateColumns: '34px repeat(17,minmax(0,1fr))', gap: 3, alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 800 }}>{r.day}</span>
              {r.cells.map((c) => (
                <button key={c.h} title={c.title} onClick={() => setHeat({ d: r.d, h: c.h })} style={{ height: hs, border: 0, padding: 0, cursor: 'pointer', background: c.bg, outline: heat.d === r.d && heat.h === c.h ? '2px solid var(--color-text)' : 'none', outlineOffset: -2, borderRadius: 5 }} />
              ))}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--color-surface)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', borderRadius: 12 }}>
          <span style={{ fontWeight: 800 }}>{DF[heat.d]} {pad(heat.h)}:00{cell ? ` · ${LV[cell.level].n}` : ''}</span>
          <span style={{ fontSize: 14 }}>{inUse == null ? '…' : `~${inUse} of ${m} in use`}</span>
        </div>
        <div style={{ marginTop: 14 }}><Legend /></div>
      </div>

      <h6 style={{ margin: '28px 0 12px' }}>Good to know</h6>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,260px),1fr))', borderTop: '2px solid var(--color-divider)' }}>
        {['Monday mornings are quiet.', 'Wednesday evenings are busy.', 'Sunday afternoons are the busiest.'].map((t) => (
          <div key={t} style={{ padding: '16px 20px 16px 0', fontSize: 16, fontWeight: 600, lineHeight: 1.4 }}>{t}</div>
        ))}
      </div>
    </div>
  )
}
