import { useApp } from '../lib/store'
import { api } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { DN, LV, clockHm, dayLong, dayMonth, dayNum, pad, tsDayLabel } from '../lib/time'
import { Legend } from '../ui'

export default function Plan({ mob }) {
  const { sday, setSday, editId, setEditId, sessions, openSlot, hourKey, residence } = useApp()
  const days = useAsync(() => api.forecastDays(28), [hourKey, residence?.id]).data ?? []
  const slots = useAsync(() => api.forecastDay(sday), [sday, hourKey, residence?.id]).data ?? []
  const best = slots.find((s) => s.is_best)
  const editing = editId && sessions.find((s) => s.id === editId)

  return (
    <div>
      <h1 style={{ fontSize: mob ? 30 : 40, letterSpacing: '-0.03em' }}>Plan</h1>
      {editing && (
        <div style={{ background: 'var(--color-accent-100)', color: 'var(--color-accent-800)', padding: '10px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderRadius: 12 }}>
          <span>Editing {tsDayLabel(editing.planned_start)} {clockHm(editing.planned_start)}. Pick a new slot.</span>
          <button className="btn btn-ghost" style={{ color: 'var(--color-accent-800)' }} onClick={() => setEditId(null)}>Stop editing</button>
        </div>
      )}

      <div className="scroll-x" style={{ display: 'flex', gap: mob ? 4 : 8, overflowX: 'auto', marginBottom: 20, padding: '2px 2px 8px', scrollSnapType: 'x proximity' }}>
        {days.map((d) => {
          const sel = d.day === sday
          return (
            <button key={d.day} onClick={() => setSday(d.day)} style={{ flex: 'none', width: 72, scrollSnapAlign: 'start', border: sel ? '2px solid var(--color-accent)' : '1px solid var(--color-divider)', background: sel ? 'var(--color-accent)' : 'var(--color-surface)', color: sel ? 'var(--color-bg)' : 'var(--color-text)', padding: '10px 4px', paddingLeft: mob ? 6 : 12, cursor: 'pointer', textAlign: 'left', borderRadius: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 800, minHeight: 12 }}>{d.is_today || dayNum(d.day) === 1 ? dayMonth(d.day) : ''}</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>{DN[d.weekday]}</div>
              <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{dayNum(d.day)}</div>
              <div style={{ height: 4, background: LV[d.avg_level].c, marginTop: 6, borderRadius: 999 }} />
            </button>
          )
        })}
      </div>

      <div style={{ marginBottom: 16 }}><Legend /></div>
      <h4 style={{ marginBottom: 12 }}>{dayLong(sday)}{best ? ` · best at ${pad(best.hour)}:00` : ''}</h4>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill,minmax(${mob ? 140 : 170}px,1fr))`, gap: 8 }}>
        {slots.map((s) => (
          <button key={s.hour} disabled={s.is_past} onClick={() => openSlot(sday, s.hour)} style={{ textAlign: 'left', background: 'var(--color-surface)', border: s.is_recommended ? '2px solid var(--color-text)' : '1px solid var(--color-divider)', padding: '10px 12px 12px', cursor: s.is_past ? 'not-allowed' : 'pointer', opacity: s.is_past ? 0.35 : 1, borderRadius: 12 }}>
            <div style={{ height: 6, background: LV[s.level].c, margin: '0 0 10px', borderRadius: 999 }} />
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em' }}>{pad(s.hour)}:00</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>{s.level_name}</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--color-accent-700)', marginTop: 6, minHeight: 14 }}>{s.is_best ? 'Best' : ''}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
