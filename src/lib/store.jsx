import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { api } from './api'
import { dayOf, hourOf, setTz } from './time'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

// The app holds data and calls the backend. Rules (forecast, validation, timers,
// reminders) are all enforced in Supabase.
export function AppProvider({ children }) {
  const [auth, setAuth] = useState(undefined) // undefined = loading, null = signed out
  const [profile, setProfile] = useState(null)
  const [residences, setResidences] = useState([])
  const [programs, setPrograms] = useState([])
  const [sessions, setSessions] = useState([])
  const [notes, setNotes] = useState([])
  const [offset, setOffset] = useState(0) // server clock minus device clock (ms)
  const [now, setNow] = useState(() => new Date())
  const [toast, setToast] = useState(null)
  const [speed, setSpeed] = useState(1) // demo timers: 1 = real time, 60 = a minute per second
  const [loadError, setLoadError] = useState('')

  // UI state shared between screens
  const [tab, setTab] = useState('sched')
  const [sdayState, setSday] = useState(null)
  const [kind, setKind] = useState('wash')
  const [mode, setMode] = useState(0)
  const [modal, setModal] = useState(null) // { day: 'YYYY-MM-DD', h }
  const [editId, setEditId] = useState(null)
  const [notesOpen, setNotesOpen] = useState(false)
  const [panel, setPanel] = useState(false) // 'settings' | 'profile'
  const [mLead, setMLead] = useState([30]) // calendar reminders (minutes before start) in the plan dialog
  const [calendarFor, setCalendarFor] = useState(null) // session id shown in the add-to-calendar dialog

  const say = useCallback((msg, ms = 3500) => setToast({ msg, until: Date.now() + ms }), [])
  const fail = useCallback((e) => say(e?.message || 'Something went wrong.', 5000), [say])

  // --- auth ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuth(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setAuth(s))
    return () => data.subscription.unsubscribe()
  }, [])

  // --- public data + server clock (works signed out) ---
  useEffect(() => {
    ;(async () => {
      try {
        const t0 = Date.now()
        const [r, p, st] = await Promise.all([api.residences(), api.programs(), api.serverTime()])
        setResidences(r); setPrograms(p)
        setOffset(new Date(st).getTime() - (t0 + Date.now()) / 2)
      } catch (e) { setLoadError(e.message) }
    })()
  }, [])

  // --- private data ---
  const userId = auth?.user?.id
  const loadSessions = useCallback(async () => {
    try { setSessions(await api.sessions()) } catch (e) { fail(e) }
  }, [fail])
  const loadNotes = useCallback(async () => {
    try { setNotes(await api.notifications()) } catch (e) { fail(e) }
  }, [fail])

  useEffect(() => {
    if (!userId) { setProfile(null); setSessions([]); setNotes([]); return }
    ;(async () => {
      try {
        const p = await api.profile(userId)
        setProfile(p); setKind(p.default_kind === 'dry' ? 'dry' : 'wash')
        await Promise.all([loadSessions(), loadNotes()])
      } catch (e) { setLoadError(e.message) }
    })()
  }, [userId, loadSessions, loadNotes])

  // --- live updates: the database creates notifications and changes sessions ---
  useEffect(() => {
    if (!userId) return
    const channel = supabase.channel('laundrylink-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `user_id=eq.${userId}` }, loadSessions)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (p) => {
        setNotes((n) => (n.some((x) => x.id === p.new.id) ? n : [p.new, ...n]))
        say(p.new.title + '. ' + p.new.body, 4500)
      })
      .subscribe()
    const onVisible = () => { if (document.visibilityState === 'visible') { loadSessions(); loadNotes() } }
    document.addEventListener('visibilitychange', onVisible)
    return () => { supabase.removeChannel(channel); document.removeEventListener('visibilitychange', onVisible) }
  }, [userId, loadSessions, loadNotes, say])

  // --- clock (server-corrected) + toast expiry ---
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date(Date.now() + offset)), 1000)
    return () => clearInterval(iv)
  }, [offset])
  useEffect(() => { if (toast && toast.until < Date.now()) setToast(null) }, [now, toast])

  // --- derived ---
  const residence = useMemo(
    () => residences.find((r) => r.id === profile?.residence_id) || residences[0] || null,
    [residences, profile]
  )
  setTz(residence?.timezone)
  const today = dayOf(now)
  const sday = sdayState ?? today
  const hourKey = today + '-' + hourOf(now) // forecasts refresh when the hour changes
  const cur = useMemo(() => {
    const list = programs.filter((p) => p.kind === (kind === 'dry' ? 'dry' : 'wash'))
    const o = list[mode] || list[0]
    return { l: kind === 'dry' ? 'Dry' : 'Wash', m: o?.minutes ?? 45, n: o?.name ?? '' }
  }, [programs, kind, mode])
  const reminders = profile?.reminders_default ?? true

  // --- actions: each one is a single backend call, then refresh ---
  const run = useCallback(async (fn, okMsg) => {
    try {
      const out = await fn()
      if (okMsg) say(okMsg)
      await loadSessions()
      return out
    } catch (e) { fail(e) }
  }, [fail, say, loadSessions])

  const updateProfile = useCallback(async (patch) => {
    setProfile((p) => ({ ...p, ...patch }))
    try { await api.updateProfile(userId, patch) } catch (e) { fail(e) }
  }, [userId, fail])

  const clearNotes = useCallback(async () => {
    setNotes([])
    try { await api.clearNotifications(userId) } catch (e) { fail(e) }
  }, [userId, fail])

  const cancelSession = (id) => run(() => api.cancelPlanned(id), 'Session cancelled.')
  const collect = (s) => run(() => api.collect(s.id), `${s.machine_label} marked as collected.`)
  // patch: { remind_minutes?, remind_end?, remind_collect? }
  const setReminders = (s, patch) => {
    setSessions((ss) => ss.map((x) => (x.id === s.id ? { ...x, ...patch } : x)))
    return run(() => api.setReminders(s.id, patch))
  }
  const startTimer = async ({ machine, cycle, minutes, kind: k = 'wash', fromPlannedId = null, remindMinutes = null }) => {
    const out = await run(() => api.startTimer({
      p_machine: machine, p_cycle: cycle, p_kind: k, p_minutes: minutes, p_time_scale: speed, p_from_planned: fromPlannedId, p_remind_minutes: remindMinutes,
    }), `${machine} timer started for ${minutes} min.`)
    if (out) setTab('laundry')
  }

  const openSlot = (day, h) => {
    const editing = editId && sessions.find((x) => x.id === editId)
    setMLead(editing ? editing.lead_minutes : profile?.default_lead_minutes ?? [30])
    setModal({ day, h })
  }
  const editSession = (u) => {
    setTab('sched'); setSday(dayOf(u.planned_start)); setEditId(u.id); setKind(u.kind === 'dry' ? 'dry' : 'wash'); setMode(0)
  }
  const confirmModal = async () => {
    const { day, h } = modal
    const args = { p_day: day, p_hour: h, p_kind: kind === 'dry' ? 'dry' : 'wash', p_cycle: `${cur.l} · ${cur.n}`, p_minutes: cur.m, p_lead_minutes: mLead }
    setModal(null)
    const out = editId
      ? await run(() => api.updatePlanned({ p_id: editId, ...args }), 'Session updated.')
      : await run(() => api.planSession(args), 'Session saved. No machine is reserved.')
    if (out) { setEditId(null); setTab('laundry'); setCalendarFor(out.id) }
  }

  const value = {
    auth, profile, residences, residence, programs, sessions, notes, now, toast, speed, setSpeed, loadError, reminders,
    tab, setTab, sday, setSday, kind, setKind, mode, setMode, modal, setModal, editId, setEditId,
    notesOpen, setNotesOpen, panel, setPanel, mLead, setMLead, calendarFor, setCalendarFor, cur, say, today, hourKey,
    updateProfile, clearNotes, cancelSession, startTimer, collect, setReminders, openSlot, editSession, confirmModal,
    signOut: () => supabase.auth.signOut(),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
