// Thin wrappers around the Supabase backend. No business logic here.
import { supabase } from './supabase'

const unwrap = ({ data, error }) => {
  if (error) throw error
  return data
}
const first = (rows) => (Array.isArray(rows) ? rows[0] : rows)

export const api = {
  serverTime: async () => unwrap(await supabase.rpc('server_time')),

  // public data (works signed out)
  residences: async () => unwrap(await supabase.from('residence_overview').select('*').order('sort_order')),
  programs: async () => unwrap(await supabase.from('programs').select('*').order('sort_order')),
  forecastDay: async (day) => unwrap(await supabase.rpc('forecast_day', day ? { p_day: day } : {})),
  forecastDays: async (count = 28) => unwrap(await supabase.rpc('forecast_days', { p_count: count })),
  heatmap: async () => unwrap(await supabase.from('forecast_heatmap').select('*')),
  insights: async () => first(unwrap(await supabase.rpc('insights_summary'))),
  estimateInUse: async (weekday, hour) => unwrap(await supabase.rpc('estimate_in_use', { p_weekday: weekday, p_hour: hour })),

  // signed-in data
  profile: async (id) => unwrap(await supabase.from('profiles').select('*').eq('id', id).single()),
  updateProfile: async (id, patch) => unwrap(await supabase.from('profiles').update(patch).eq('id', id)),
  sessions: async () => unwrap(await supabase.from('my_sessions').select('*').order('created_at', { ascending: false })),
  notifications: async () => unwrap(await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(30)),
  clearNotifications: async (userId) => unwrap(await supabase.from('notifications').delete().eq('user_id', userId)),

  // session lifecycle: every rule is enforced by the database functions
  planSession: async (a) => unwrap(await supabase.rpc('plan_session', a)),
  updatePlanned: async (a) => unwrap(await supabase.rpc('update_planned_session', a)),
  cancelPlanned: async (id) => unwrap(await supabase.rpc('cancel_planned_session', { p_id: id })),
  startTimer: async (a) => unwrap(await supabase.rpc('start_timer', a)),
  collect: async (id) => unwrap(await supabase.rpc('collect_session', { p_id: id })),
  // patch: { remind_minutes?, remind_end?, remind_collect? } - anything left out stays unchanged
  setReminders: async (id, patch) => unwrap(await supabase.rpc('set_session_reminders', {
    p_id: id, p_remind_minutes: patch.remind_minutes ?? null, p_remind_end: patch.remind_end ?? null, p_remind_collect: patch.remind_collect ?? null,
  })),
  // calendar event + ready-made .ics text (with the reminder alarms) for a planned session or running timer
  calendarEvent: async (id) => first(unwrap(await supabase.rpc('session_calendar_event', { p_id: id }))),
}
