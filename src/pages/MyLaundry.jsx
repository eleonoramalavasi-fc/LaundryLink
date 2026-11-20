import { useState } from 'react'
import { useApp } from '../lib/store'
import { K, clockHm, fmtOffset, mmss, tsDayLabel } from '../lib/time'
import { IC, Icon, ReminderEditor, Seg, Switch } from '../ui'

const TIMER_PRESETS = [1, 2, 5, 10, 15, 30]
const summary = (a) => (a.length ? a.map(fmtOffset).join(', ') + ' before' : 'none before')

// Per-timer reminders: how many, and how long before the cycle ends
function ReminderPanel({ s }) {
  const { setReminders } = useApp()
  const [open, setOpen] = useState(false)
  const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: 13 }
  return (
    <div style={{ borderTop: '1px solid var(--color-divider)', paddingTop: 10 }}>
      <button onClick={() => setOpen(!open)} aria-expanded={open} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: 12, border: 0, background: 'transparent', padding: 0, cursor: 'pointer', fontSize: 13 }}>
        <span style={{ fontWeight: 600 }}>Reminders</span>
        <span style={{ opacity: 0.75 }}>{summary(s.remind_minutes)} {open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
          <ReminderEditor value={s.remind_minutes} onChange={(v) => setReminders(s, { remind_minutes: v })} presets={TIMER_PRESETS} lo={1} hi={60} empty="No early reminders" />
          <div style={row}><span>When it finishes</span><Switch small on={s.remind_end} label="Remind when finished" onClick={() => setReminders(s, { remind_end: !s.remind_end })} /></div>
          <div style={row}><span>If I forget to collect it</span><Switch small on={s.remind_collect} label="Remind if not collected" onClick={() => setReminders(s, { remind_collect: !s.remind_collect })} /></div>
        </div>
      )}
    </div>
  )
}

export default function MyLaundry({ mob }) {
  const { sessions, programs, profile, now, startTimer, collect, editSession, cancelSession, setTab, setCalendarFor } = useApp()
  const [form, setForm] = useState(false)
  const [fm, setFm] = useState({ type: 'Washer', n: 5, mi: 0 })
  const [rm, setRm] = useState(null) // reminders for the timer being started (null = my defaults)
  const rmv = rm ?? profile?.default_remind_minutes ?? [5]

  const actives = sessions.filter((s) => s.status === 'active').sort((a, b) => new Date(b.started_at) - new Date(a.started_at))
  const ups = sessions.filter((s) => s.status === 'planned').sort((a, b) => new Date(a.planned_start) - new Date(b.planned_start))
  const dones = sessions.filter((s) => s.status === 'collected').sort((a, b) => new Date(b.collected_at) - new Date(a.collected_at))
  const modes = programs.filter((p) => p.kind === (fm.type === 'Washer' ? 'wash' : 'dry'))

  const start = () => {
    const md = modes[fm.mi]
    if (!md) return
    startTimer({ machine: `${fm.type} ${fm.n}`, cycle: `${fm.type === 'Washer' ? 'Wash' : 'Dry'} · ${md.name}`, minutes: md.minutes, kind: fm.type === 'Washer' ? 'wash' : 'dry', remindMinutes: rmv })
    setForm(false); setRm(null)
  }
  const startPlanned = (u) => {
    const dry = u.kind === 'dry'
    startTimer({ machine: dry ? 'Dryer 3' : 'Washer 5', cycle: `${dry ? 'Dry' : u.kind === 'both' ? 'Wash + dry' : 'Wash'} · Planned session`, minutes: u.duration_minutes, kind: u.kind, fromPlannedId: u.id })
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <h1 style={{ fontSize: mob ? 30 : 40, letterSpacing: '-0.03em', margin: 0 }}>My Laundry</h1>
        <button className="btn btn-primary" style={{ minHeight: 40, padding: '0 18px' }} onClick={() => setForm(!form)}>{form ? 'Close' : 'Start a timer'}</button>
      </div>

      {form && (
        <div style={{ background: 'var(--color-surface)', padding: 20, marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 16, alignItems: 'end', borderRadius: 16 }}>
          <div className="field"><label>Machine</label>
            <Seg options={[{ label: 'Washer', v: 'Washer' }, { label: 'Dryer', v: 'Dryer' }]} value={fm.type} onChange={(v) => setFm({ ...fm, type: v, mi: 0 })} />
          </div>
          <div className="field"><label>Machine number</label>
            <input className="input" type="number" min="1" max="12" value={fm.n} onChange={(e) => setFm({ ...fm, n: Math.min(12, Math.max(1, +e.target.value || 1)) })} />
          </div>
          <div className="field"><label>Program</label>
            <Seg options={modes.map((o, i) => ({ label: `${o.name} · ${o.minutes}`, v: i }))} value={fm.mi} onChange={(v) => setFm({ ...fm, mi: v })} />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Remind me before it ends</label>
            <ReminderEditor value={rmv} onChange={setRm} presets={TIMER_PRESETS} lo={1} hi={60} empty="No early reminders" />
          </div>
          <button className="btn btn-primary" style={{ minHeight: 40, gridColumn: '1 / -1' }} onClick={start}>Start timer</button>
        </div>
      )}

      <h6 style={{ marginBottom: 12 }}>Active · {actives.length}</h6>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))', gap: 16 }}>
        {actives.map((s) => {
          const ends = new Date(s.ends_at), total = (ends - new Date(s.started_at)) / 1000
          const remaining = Math.max(0, (ends - now) / 1000), fin = remaining <= 0
          const pct = Math.min(100, Math.round((1 - remaining / total) * 100))
          return (
            <div key={s.id} style={{ border: `2px solid ${fin ? 'var(--color-accent)' : 'var(--color-divider)'}`, background: 'var(--color-surface)', padding: 20, display: 'flex', flexDirection: 'column', gap: 10, borderRadius: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div><div style={{ fontWeight: 800, fontSize: 18 }}>{s.machine_label}</div><div style={{ fontSize: 13, opacity: 0.75 }}>{s.cycle_label}</div></div>
                <span className={'tag ' + (fin ? 'tag-accent' : 'tag-outline')}>{fin ? 'Collect now' : 'Running'}</span>
              </div>
              <div style={{ fontSize: 60, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}>{fin ? 'Done' : mmss(remaining)}</div>
              <div style={{ height: 8, background: 'var(--color-neutral-300)', borderRadius: 999 }}><div style={{ width: pct + '%', height: '100%', background: 'var(--color-accent)', borderRadius: 999 }} /></div>
              <div style={{ fontSize: 13 }}>{fin ? 'Finished at ' : 'Done around '}{clockHm(ends)}</div>
              {!fin && <ReminderPanel s={s} />}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                <button className={'btn ' + (fin ? 'btn-primary' : 'btn-secondary')} onClick={() => collect(s)}><Icon d={IC.check} size={16} sw={2.5} />Mark as collected</button>
                {!fin && <button className="btn btn-secondary" onClick={() => setCalendarFor(s.id)}><Icon d={IC.cal} size={16} />Add to calendar</button>}
              </div>
            </div>
          )
        })}
      </div>
      {actives.length === 0 && <div style={{ border: '2px dashed var(--color-divider)', padding: 32, fontSize: 15, opacity: 0.8, borderRadius: 16 }}>No cycle running.</div>}

      <h6 style={{ margin: '32px 0 12px' }}>Upcoming · {ups.length}</h6>
      <div style={{ borderTop: '2px solid var(--color-divider)' }}>
        {ups.map((u) => (
          <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '14px 0', borderBottom: '1px solid var(--color-divider)' }}>
            <div>
              <div style={{ fontWeight: 800 }}>{tsDayLabel(u.planned_start)} · {clockHm(u.planned_start)}–{clockHm(new Date(u.planned_start).getTime() + u.duration_minutes * 60000)}</div>
              <div style={{ fontSize: 13, opacity: 0.75 }}>{u.cycle_label || K[u.kind].l} · reminder {summary(u.lead_minutes).replace('before', 'before start')}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={() => setCalendarFor(u.id)}><Icon d={IC.cal} size={16} />Add to calendar</button>
              <button className="btn btn-secondary" onClick={() => startPlanned(u)}>Start timer</button>
              <button className="btn btn-secondary" onClick={() => editSession(u)}>Edit</button>
              <button className="btn btn-secondary" onClick={() => cancelSession(u.id)}>Cancel</button>
            </div>
          </div>
        ))}
        {ups.length === 0 && <div style={{ padding: '16px 0', fontSize: 14, opacity: 0.75 }}>No upcoming sessions. <a href="#plan" onClick={(e) => { e.preventDefault(); setTab('sched') }}>Plan one</a>.</div>}
      </div>

      <h6 style={{ margin: '32px 0 12px' }}>Completed · {dones.length}</h6>
      <div style={{ borderTop: '2px solid var(--color-divider)' }}>
        {dones.map((u) => (
          <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--color-divider)' }}>
            <div><div style={{ fontWeight: 600 }}>{u.machine_label || K[u.kind].l} · {u.cycle_label}</div><div style={{ fontSize: 13, opacity: 0.7 }}>{tsDayLabel(u.collected_at)} · {clockHm(u.collected_at)}</div></div>
            <span className="tag tag-neutral">Collected</span>
          </div>
        ))}
      </div>
    </div>
  )
}
