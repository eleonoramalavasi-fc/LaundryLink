import { useEffect, useRef, useState } from 'react'
import { useApp } from './lib/store'
import { api } from './lib/api'
import { useAsync } from './lib/useAsync'
import { LV, pad, toBars, toHeatRows } from './lib/time'
import { BarChart, IC, Icon, Logo, Reveal, useInView, useIsMobile } from './ui'

const TABS = [['Forecast', IC.chart], ['Plan', IC.cal], ['Timers', IC.timer], ['Insights', IC.dash]]
const HEADS = ['See the quiet hours', 'Plan in two taps', 'Never forget your clothes', 'Know your week']
const SUBS = ['An hourly forecast for every day.', 'Pick a time, wash or dry, done.', 'Reminders before and after each cycle.', 'Spot the busiest and quietest days.']

export default function Landing({ email, setEmail, openApp }) {
  const { hourKey } = useApp()
  const mob = useIsMobile()
  const [tab, setTab] = useState(0)
  const [step, setStep] = useState(0)
  const pauseUntil = useRef(0)
  const [featRef, featInView] = useInView({ once: false, threshold: 0.15 })

  // the demo plays from the start each time the features scroll into view, and rests while off-screen
  useEffect(() => {
    if (!featInView) return
    setStep(0)
    const iv = setInterval(() => {
      setStep((s) => {
        if (s + 1 >= 10) {
          if (Date.now() > pauseUntil.current) setTab((t) => (t + 1) % 4)
          return 0
        }
        return s + 1
      })
    }, 500)
    return () => clearInterval(iv)
  }, [featInView])

  const padX = mob ? 16 : 40
  const fs = mob ? { a: 44, c: 28, e: 44 } : { a: 84, c: 40, e: 88 }
  const cardPad = mob ? 16 : 40

  // the animated demo is drawn from backend data (forecast_day / forecast_heatmap)
  const dayRows = useAsync(() => api.forecastDay(), [hourKey]).data ?? []
  const bars = toBars(dayRows, false)
  const slots = dayRows.slice(8, 14).map((r) => ({ h: r.hour, bg: LV[r.level].c, label: pad(r.hour) + ':00', lname: r.level_name }))
  const heat = toHeatRows(useAsync(api.heatmap, []).data ?? [])
  const rem = Math.max(0, 600 - step * 70)
  const mmss = (x) => pad(Math.floor(x / 60)) + ':' + pad(x % 60)
  const chip = [
    step >= 6 ? 'Best time today: 15:00 · Quiet' : 'Reading the forecast…',
    step >= 5 ? 'Saved for 17:00 ✓' : step >= 2 ? '17:00 · Wash 45 min' : 'Pick a time',
    rem > 300 ? 'Timer running' : rem > 0 ? 'Ends in 5 minutes' : 'Washer 4 has finished',
    step >= 8 ? 'Sunday 15:00 is the busiest' : 'Building your week…',
  ][tab]
  const chipOn = [step >= 6, step >= 5, rem <= 300, step >= 8][tab]
  const chipBg = chipOn ? 'var(--color-accent-200)' : 'var(--color-surface)'

  const goTab = (i) => { pauseUntil.current = Date.now() + 12000; setTab(i); setStep(0) }

  return (
    <div>
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--color-bg)', borderBottom: '2px solid var(--color-divider)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: `14px ${padX}px`, display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ marginRight: 'auto' }}><Logo /></div>
          {!mob && <a href="#features" style={{ color: 'inherit', textDecoration: 'none', fontSize: 14 }}>Features</a>}
          {!mob && <button className="btn btn-secondary" onClick={openApp}>Log in</button>}
          <button className="btn btn-primary" onClick={openApp}>Get started</button>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: `0 ${padX}px` }}>
        <div style={{ padding: `${mob ? 56 : 96}px 0 ${mob ? 24 : 32}px` }}>
          <Reveal y={36}>
            <h1 style={{ fontSize: fs.a, lineHeight: 0.98, letterSpacing: '-0.035em', margin: 0, maxWidth: 1000 }}>Less waiting. Smarter timing. No forgotten laundry.</h1>
          </Reveal>
        </div>

        <div id="features" ref={featRef} style={{ padding: '0 0 72px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: mob ? 4 : 16 }}>
            {TABS.map(([label, d], i) => (
              <Reveal key={label} delay={i * 90} y={20}>
              <button onClick={() => goTab(i)} style={{ width: '100%', border: 0, cursor: 'pointer', background: tab === i ? 'var(--color-accent-100)' : 'transparent', padding: '12px 4px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, borderRadius: 18 }}>
                <span style={{ width: 48, height: 48, borderRadius: '50%', background: tab === i ? 'var(--color-accent)' : 'var(--color-accent-200)', color: tab === i ? '#fff' : 'var(--color-accent-700)', display: 'grid', placeItems: 'center' }}>
                  <Icon d={d} size={22} cap="round" />
                </span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
                <span style={{ width: '70%', height: 3, background: 'var(--color-neutral-300)', borderRadius: 999, overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: tab === i ? Math.min(100, (step + 1) * 10) + '%' : '0%', background: 'var(--color-accent)', transition: 'width .5s linear' }} />
                </span>
              </button>
              </Reveal>
            ))}
          </div>

          <Reveal delay={150} y={40} style={{ marginTop: 16 }}>
          <div style={{ background: 'var(--color-accent-100)', borderRadius: 28, padding: cardPad, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: 24, alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: fs.c, letterSpacing: '-0.02em' }}>{HEADS[tab]}</h3>
              <div style={{ fontSize: 17, opacity: 0.8, marginBottom: 16 }}>{SUBS[tab]}</div>
              <button className="btn btn-primary" onClick={openApp}>Try it<Icon d={IC.arrow} size={16} sw={2.5} /></button>
            </div>
            <div style={{ background: 'var(--color-bg)', borderRadius: 20, boxShadow: 'var(--shadow-md)', padding: 16, minHeight: 270, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 6 }}>{[0, 1, 2].map((i) => <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-neutral-300)' }} />)}</div>

              {tab === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                  <BarChart height={170} gap={4} bars={bars.map((b, i) => ({
                    ...b, op: 1, hgt: i < step * 2 + 3 ? b.hgt : '4%', bg: i < step * 2 + 3 ? b.bg : 'var(--color-neutral-300)',
                    out: step >= 6 && i === 8 ? '2px solid var(--color-text)' : 'none',
                  }))} />
                  <div style={{ minHeight: 34, padding: '8px 12px', borderRadius: 12, background: chipBg, fontWeight: 800, fontSize: 14 }}>{chip}</div>
                </div>
              )}
              {tab === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
                    {slots.map((s, i) => (
                      <div key={s.h} style={{ background: 'var(--color-surface)', border: `2px solid ${step >= 2 && i === 2 ? 'var(--color-accent)' : 'transparent'}`, borderRadius: 12, padding: 10, transition: 'border-color .3s' }}>
                        <div style={{ height: 5, background: s.bg, borderRadius: 999, marginBottom: 8 }} />
                        <div style={{ fontWeight: 800 }}>{s.label.slice(0, 5)}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>{s.lname}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: 12, borderRadius: 12, background: chipBg, fontWeight: 800, fontSize: 14, marginTop: 'auto' }}>{chip}</div>
                </div>
              )}
              {tab === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <b>Washer 4</b><span className="tag tag-outline">{rem > 300 ? 'Running' : rem > 0 ? 'Ending soon' : 'Finished'}</span>
                  </div>
                  <div style={{ fontSize: 60, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}>{mmss(rem)}</div>
                  <div style={{ height: 8, background: 'var(--color-neutral-300)', borderRadius: 999 }}>
                    <div style={{ height: '100%', width: Math.round((1 - rem / 600) * 100) + '%', background: 'var(--color-accent)', borderRadius: 999, transition: 'width .5s linear' }} />
                  </div>
                  <div style={{ padding: 12, borderRadius: 12, background: chipBg, fontWeight: 800, fontSize: 14, marginTop: 'auto' }}>{chip}</div>
                </div>
              )}
              {tab === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                  <div style={{ display: 'grid', gap: 3 }}>
                    {heat.map((r, i) => (
                      <div key={r.day} style={{ display: 'grid', gridTemplateColumns: '28px repeat(17,minmax(0,1fr))', gap: 2, alignItems: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 800 }}>{r.day}</span>
                        {r.cells.map((c) => <div key={c.h} style={{ height: 18, background: i < step ? c.bg : 'var(--color-neutral-300)', borderRadius: 4, transition: 'background .4s' }} />)}
                      </div>
                    ))}
                  </div>
                  <div style={{ minHeight: 34, padding: '8px 12px', borderRadius: 12, background: chipBg, fontWeight: 800, fontSize: 14, marginTop: 'auto' }}>{chip}</div>
                </div>
              )}
            </div>
          </div>
          </Reveal>
        </div>
      </div>

      <div style={{ background: 'var(--color-accent)', color: '#fff', borderRadius: 16 }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: `72px ${padX}px` }}>
          <Reveal y={36}><h2 style={{ fontSize: fs.e, lineHeight: 0.98, letterSpacing: '-0.04em', maxWidth: 900, color: '#fff' }}>Do laundry when the room is quiet.</h2></Reveal>
          <Reveal delay={150}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 32, maxWidth: 520 }}>
            <input className="input" style={{ flex: '1 1 220px', minHeight: 48, fontSize: 15, background: '#fff', borderColor: '#fff', borderRadius: 16 }} placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn" style={{ minHeight: 48, fontSize: 15, padding: '0 22px', background: 'var(--color-accent-200)', color: 'var(--color-text)', borderRadius: 16 }} onClick={openApp}>Get started free</button>
          </div>
          </Reveal>
        </div>
      </div>
      <Reveal y={16}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: `24px ${padX}px`, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', fontSize: 13, opacity: 0.75 }}>
          <span>LaundryLink · Student project prototype. All traffic and availability data is simulated.</span>
          <span>Not connected to SimplyPay or any machine.</span>
        </div>
      </Reveal>
    </div>
  )
}
