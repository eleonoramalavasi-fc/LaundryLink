// Presentation helpers only: labels, colours and date formatting.
// All forecast / session logic lives in Supabase (see supabase/migrations).

export const DN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const DF = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Crowd level -> colour (the level itself and its name come from the database)
export const LV = [
  { n: 'Quiet', c: 'var(--color-accent-200)' },
  { n: 'Moderate', c: 'var(--blue-300)' },
  { n: 'Busy', c: 'var(--blue-500)' },
  { n: 'Very busy', c: 'var(--blue-800)' },
]
export const K = { wash: { l: 'Wash' }, dry: { l: 'Dry' }, both: { l: 'Wash + dry' } }

// 5 -> '5 min', 60 -> '1 h', 1440 -> '1 day'
export const fmtOffset = (m) =>
  m % 1440 === 0 ? `${m / 1440} ${m === 1440 ? 'day' : 'days'}` : m % 60 === 0 ? `${m / 60} h` : m > 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`

export const pad = (n) => String(n).padStart(2, '0')
export const hm = (sec) => {
  sec = ((sec % 86400) + 86400) % 86400
  return pad(Math.floor(sec / 3600)) + ':' + pad(Math.floor((sec % 3600) / 60))
}
export const mmss = (s) => {
  s = Math.max(0, Math.round(s))
  return pad(Math.floor(s / 60)) + ':' + pad(s % 60)
}

// --- timestamps, shown in the residence's timezone -------------------------
let TZ = 'Europe/Paris'
export const setTz = (tz) => { TZ = tz || 'Europe/Paris' }

const fmt = (opts, locale = 'en-GB') => new Intl.DateTimeFormat(locale, { timeZone: TZ, ...opts })
export const clockHm = (ts) => fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts))
export const hourOf = (ts) => Number(fmt({ hour: 'numeric', hourCycle: 'h23' }).format(new Date(ts)))
export const dayOf = (ts) => fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }, 'en-CA').format(new Date(ts)) // YYYY-MM-DD
export const tsDayLabel = (ts) => {
  const p = Object.fromEntries(fmt({ weekday: 'short', day: 'numeric', month: 'short' }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]))
  return `${p.weekday} ${p.day} ${p.month}`
}

// --- plain calendar days ('YYYY-MM-DD'), no timezone maths -------------------
const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)) }
export const dayWeekday = (s) => (parseDay(s).getUTCDay() + 6) % 7
export const dayNum = (s) => parseDay(s).getUTCDate()
export const dayMonth = (s) => MON[parseDay(s).getUTCMonth()]
export const addDays = (s, n) => { const d = parseDay(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
export const dayLabel = (s) => `${DN[dayWeekday(s)]} ${dayNum(s)} ${dayMonth(s)}`
export const dayLong = (s) => `${DF[dayWeekday(s)]} ${dayNum(s)} ${dayMonth(s)}`

// --- map database rows to what the charts draw ------------------------------
export const toBars = (rows = [], dimPast = false) =>
  rows.map((r) => ({
    hgt: Math.round(10 + r.crowd * 90) + '%',
    bg: LV[r.level].c,
    out: dimPast && r.is_recommended ? '2px solid var(--color-text)' : 'none',
    op: dimPast && r.is_past ? 0.35 : 1,
    tick: r.hour % 2 ? '' : pad(r.hour),
    title: pad(r.hour) + ':00 · ' + r.level_name,
  }))

export const toHeatRows = (rows = []) =>
  DN.map((day, d) => ({
    d, day,
    cells: rows.filter((r) => r.weekday === d).sort((a, b) => a.hour_of_day - b.hour_of_day)
      .map((r) => ({ h: r.hour_of_day, bg: LV[r.level].c, level: r.level, title: `${day} ${pad(r.hour_of_day)}:00 · ${LV[r.level].n}` })),
  }))
