import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { LV, fmtOffset } from './lib/time'

export const IC = {
  arrow: 'M5 12h14 M12 5l7 7-7 7',
  check: 'M20 6 9 17l-5-5',
  pin: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9 M10.3 21a1.94 1.94 0 0 0 3.4 0',
  sliders: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
  dash: 'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z',
  cal: 'M8 2v4 M16 2v4 M3 6h18v15H3z M3 10h18',
  timer: 'M10 2h4 M12 14l3-3 M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  chart: 'M3 3v18h18 M7 16v-5 M12 16V7 M17 16v-3',
}

export function Icon({ d, size = 18, sw = 2, cap = 'square' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}
      strokeLinecap={cap} strokeLinejoin={cap === 'round' ? 'round' : undefined} style={{ flex: 'none' }}>
      <path d={d} />
    </svg>
  )
}

export function Logo({ onClick }) {
  const inner = (
    <>
      <span style={{ width: 18, height: 18, background: 'var(--color-accent)', display: 'block', borderRadius: 6 }} />
      LaundryLink
    </>
  )
  const style = { display: 'flex', alignItems: 'center', gap: 10, fontWeight: 800, fontSize: 19, letterSpacing: '-0.02em' }
  return onClick
    ? <button onClick={onClick} style={{ ...style, padding: '0 8px', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', borderRadius: 16 }}>{inner}</button>
    : <div style={style}>{inner}</div>
}

export function Seg({ options, value, onChange }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={String(o.v)} className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>{o.label}</button>
      ))}
    </div>
  )
}

export function Switch({ on, onClick, small, label }) {
  const [w, h, top] = small ? [38, 22, 2] : [42, 24, 3]
  return (
    <button role="switch" aria-checked={on} aria-label={label} className={'switch' + (on ? ' on' : '')} onClick={onClick} style={{ width: w, height: h }}>
      <span style={{ top, left: on ? 22 : 2, width: 16, height: 16 }} />
    </button>
  )
}

export function Legend() {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, alignItems: 'center' }}>
      {LV.map((l) => (
        <span key={l.n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, background: l.c, display: 'block', borderRadius: 4 }} />{l.n}
        </span>
      ))}
    </div>
  )
}

export function BarChart({ bars, height = 200, gap = 6, ticks }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap, height, borderBottom: '2px solid var(--color-divider)' }}>
        {bars.map((b, i) => (
          <div key={i} title={b.title} style={{ flex: 1, height: b.hgt, background: b.bg, outline: b.out, outlineOffset: 2, opacity: b.op ?? 1, borderRadius: 5, transition: 'height .4s' }} />
        ))}
      </div>
      {ticks && (
        <div style={{ display: 'flex', gap, marginTop: 6 }}>
          {bars.map((b, i) => <div key={i} style={{ flex: 1, fontSize: 11, textAlign: 'center', opacity: 0.65, whiteSpace: 'nowrap', overflow: 'visible' }}>{b.tick}</div>)}
        </div>
      )}
    </div>
  )
}

// Whether the app is shown inside the phone-frame preview (set in App.jsx)
export const ViewCtx = createContext({ phone: false })

export function useIsMobile(bp = 820) {
  const { phone } = useContext(ViewCtx)
  const [w, setW] = useState(window.innerWidth)
  useEffect(() => {
    const f = () => setW(window.innerWidth)
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  return phone || w < bp
}

// Scroll to the top, both in the phone frame (inner scroller) and in a normal page
export function scrollTop() {
  document.getElementById('ll-scroll')?.scrollTo(0, 0)
  window.scrollTo(0, 0)
}

// True once the element scrolls into view (once=false: tracks it live).
// Works inside the phone frame too, because the observer respects scroll containers.
export function useInView({ once = true, threshold = 0.15 } = {}) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!('IntersectionObserver' in window)) { setInView(true); return }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setInView(true); if (once) io.disconnect() }
      else if (!once) setInView(false)
    }, { threshold, rootMargin: '0px 0px -6% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [once, threshold])
  return [ref, inView]
}

// Fades and slides its children in when they scroll into view.
export function Reveal({ children, delay = 0, y = 28, style }) {
  const [ref, inView] = useInView()
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const shown = inView || reduce
  return (
    <div ref={ref} style={{
      opacity: shown ? 1 : 0, transform: shown ? 'none' : `translateY(${y}px)`,
      transition: reduce ? 'none' : `opacity .7s ease ${delay}ms, transform .8s cubic-bezier(.2,.7,.2,1) ${delay}ms`,
      ...style,
    }}>{children}</div>
  )
}

// Pick how many reminders and when: tap the preset chips, or add your own number of minutes.
export function ReminderEditor({ value, onChange, presets, lo, hi, max = 5, empty = 'No reminders' }) {
  const [custom, setCustom] = useState('')
  const desc = (a) => [...a].sort((x, y) => y - x)
  const chips = [...new Set([...presets, ...value])].sort((a, b) => a - b)
  const full = value.length >= max
  const toggle = (m) => onChange(value.includes(m) ? value.filter((x) => x !== m) : full ? value : desc([...value, m]))
  const addCustom = () => {
    const n = parseInt(custom, 10)
    if (Number.isInteger(n) && n >= lo && n <= hi && !value.includes(n) && !full) onChange(desc([...value, n]))
    setCustom('')
  }
  const chip = (on) => ({
    padding: '6px 12px', fontSize: 13, borderRadius: 999, cursor: 'pointer',
    border: '1px solid ' + (on ? 'var(--color-accent)' : 'var(--color-divider)'),
    background: on ? 'var(--color-accent)' : 'transparent', color: on ? 'var(--color-bg)' : 'var(--color-text)',
  })
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {chips.map((m) => {
          const on = value.includes(m)
          return <button key={m} type="button" aria-pressed={on} disabled={!on && full} onClick={() => toggle(m)} style={{ ...chip(on), opacity: !on && full ? 0.45 : 1 }}>{fmtOffset(m)}</button>
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
        <input className="input" type="number" min={lo} max={hi} placeholder="Custom (min)" value={custom} style={{ width: 130, minHeight: 32 }}
          onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustom())} />
        <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px' }} onClick={addCustom}>Add</button>
        <span style={{ fontSize: 12, opacity: 0.65, marginLeft: 'auto' }}>{value.length ? `${value.length} of ${max}` : empty}</span>
      </div>
    </div>
  )
}
