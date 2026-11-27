import { useApp } from './lib/store'
import { api } from './lib/api'
import { useAsync } from './lib/useAsync'
import { clockHm, dayLong, fmtOffset, hm, pad, tsDayLabel } from './lib/time'
import { ReminderEditor, Seg, Switch } from './ui'

const stop = (e) => e.stopPropagation()

export function Dialogs({ goLanding }) {
  const a = useApp()
  const { modal, notesOpen, panel, calendarFor } = a
  return (
    <>
      {modal && <ConfirmDialog />}
      {calendarFor && <CalendarDialog />}
      {notesOpen && <NotesDialog />}
      {panel === 'settings' && <SettingsDialog />}
      {panel === 'profile' && <ProfileDialog goLanding={goLanding} />}
    </>
  )
}

function ConfirmDialog() {
  const { modal, setModal, editId, kind, setKind, mode, setMode, cur, mLead, setMLead, confirmModal, programs, hourKey } = useApp()
  const kinds = [{ label: 'Wash', v: 'wash' }, { label: 'Dry', v: 'dry' }]
  const k = kind === 'dry' ? 'dry' : 'wash'
  // expected crowd for the chosen slot comes from the database
  const slot = (useAsync(() => api.forecastDay(modal.day), [modal.day, hourKey]).data ?? []).find((r) => r.hour === modal.h)
  return (
    <div className="dialog-backdrop" onClick={() => setModal(null)}>
      <div className="dialog" style={{ width: 'min(480px,100%)' }} onClick={stop}>
        <div className="dialog-title">{editId ? 'Update session' : 'Confirm session'}</div>
        <div style={{ fontSize: 17, fontWeight: 800 }}>
          {dayLong(modal.day)} · {pad(modal.h)}:00 – {hm(modal.h * 3600 + cur.m * 60)}
        </div>
        <div style={{ fontSize: 13, opacity: 0.75 }}>
          Expected crowd: {slot ? slot.level_name : '…'}
        </div>
        <div><Seg options={kinds} value={kind === 'dry' ? 'dry' : 'wash'} onChange={(v) => { setKind(v); setMode(0) }} /></div>
        <div style={{ display: 'grid', gap: 8 }}>
          {programs.filter((p) => p.kind === k).map((o, i) => (
            <button key={o.id} onClick={() => setMode(i)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', border: `2px solid ${mode === i ? 'var(--color-accent)' : 'var(--color-divider)'}`, background: mode === i ? 'var(--color-accent-100)' : 'transparent', cursor: 'pointer', fontSize: 15, fontWeight: 600, textAlign: 'left', borderRadius: 12 }}>
              <span>{o.name}</span><span style={{ opacity: 0.7 }}>{o.minutes} min</span>
            </button>
          ))}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Remind me before it starts</div>
          <ReminderEditor value={mLead} onChange={setMLead} presets={[10, 15, 30, 60, 120, 1440]} lo={5} hi={1440} />
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>Saved in your calendar event, and sent here as a notification.</div>
        </div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Saves a plan. Does not reserve a machine.</div>
        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={confirmModal}>{editId ? 'Save changes' : 'Confirm session'}</button>
        </div>
      </div>
    </div>
  )
}

function CalendarDialog() {
  const { calendarFor, setCalendarFor } = useApp()
  const { data: ev, error } = useAsync(() => api.calendarEvent(calendarFor), [calendarFor])
  const close = () => setCalendarFor(null)
  const enc = encodeURIComponent
  const g = (iso) => new Date(iso).toISOString().replace(/[-:]|\.\d{3}/g, '') // 20261121T090000Z
  const google = ev && `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${enc(ev.title)}&dates=${g(ev.starts_at)}/${g(ev.ends_at)}&details=${enc(ev.description)}&location=${enc(ev.location)}`
  const outlook = ev && `https://outlook.live.com/calendar/0/deeplink/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent&subject=${enc(ev.title)}&startdt=${enc(new Date(ev.starts_at).toISOString())}&enddt=${enc(new Date(ev.ends_at).toISOString())}&body=${enc(ev.description)}&location=${enc(ev.location)}`
  const downloadIcs = () => {
    const a = document.createElement('a')
    a.href = 'data:text/calendar;charset=utf-8,' + enc(ev.ics)
    a.download = 'laundrylink.ics'
    document.body.appendChild(a); a.click(); a.remove()
  }
  const alarms = (ev?.alarm_minutes ?? []).map((m) => (m === 0 ? 'at the time' : fmtOffset(m) + ' before'))
  return (
    <div className="dialog-backdrop" onClick={close}>
      <div className="dialog" onClick={stop}>
        <div className="dialog-title">Add to your calendar</div>
        {error && <div className="error">{error.message}</div>}
        {!ev && !error && <div style={{ opacity: 0.7 }}>Preparing…</div>}
        {ev && (
          <>
            <div style={{ padding: '12px 14px', background: 'var(--color-bg)', borderRadius: 12 }}>
              <div style={{ fontWeight: 800 }}>{ev.title}</div>
              <div style={{ fontSize: 14, opacity: 0.8 }}>{tsDayLabel(ev.starts_at)} · {clockHm(ev.starts_at)}–{clockHm(ev.ends_at)}</div>
              <div style={{ fontSize: 13, opacity: 0.65 }}>{ev.location}</div>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <a className="btn btn-secondary" style={{ justifyContent: 'flex-start' }} href={google} target="_blank" rel="noreferrer">Google Calendar</a>
              <button className="btn btn-secondary" style={{ justifyContent: 'flex-start' }} onClick={downloadIcs}>Apple Calendar (.ics file)</button>
              <a className="btn btn-secondary" style={{ justifyContent: 'flex-start' }} href={outlook} target="_blank" rel="noreferrer">Outlook (web)</a>
            </div>
            <div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.45 }}>
              {alarms.length > 0
                ? <>Your reminders ({alarms.join(', ')}) are included in the <b>.ics file</b>, which also works with the Outlook app. Google Calendar and Outlook on the web use your calendar's default reminder, so add one there if you want it.</>
                : <>No reminders are set for this event.</>}
            </div>
          </>
        )}
        <div className="dialog-actions"><button className="btn btn-primary" onClick={close}>Done</button></div>
      </div>
    </div>
  )
}

function NotesDialog() {
  const { notes, setNotesOpen, clearNotes } = useApp()
  return (
    <div className="dialog-backdrop" onClick={() => setNotesOpen(false)}>
      <div className="dialog" style={{ maxHeight: '80%' }} onClick={stop}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="dialog-title">Notifications</div>
          <button className="btn btn-ghost" onClick={() => { clearNotes(); setNotesOpen(false) }}>Clear</button>
        </div>
        {notes.map((n) => (
          <div key={n.id} style={{ padding: '12px 14px', background: 'var(--color-bg)', borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <b style={{ fontSize: 15 }}>{n.title}</b>
              <span style={{ fontSize: 12, opacity: 0.6 }}>{clockHm(new Date(n.created_at))}</span>
            </div>
            <div style={{ fontSize: 14, opacity: 0.8 }}>{n.body}</div>
          </div>
        ))}
        {notes.length === 0 && <div style={{ padding: '16px 0', fontSize: 15, opacity: 0.7 }}>You're all caught up.</div>}
      </div>
    </div>
  )
}

function SettingsDialog() {
  const { setPanel, reminders, updateProfile, profile, speed, setSpeed, say } = useApp()
  return (
    <div className="dialog-backdrop" onClick={() => setPanel(false)}>
      <div className="dialog" onClick={stop}>
        <div className="dialog-title">Settings</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
          <span>Reminders and notifications</span>
          <Switch on={reminders} label="Reminders" onClick={() => { updateProfile({ reminders_default: !reminders }); say(reminders ? 'Reminders turned off.' : 'Reminders turned on.', 2500) }} />
        </div>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Timer reminders: before the cycle ends</div>
          <ReminderEditor value={profile?.default_remind_minutes ?? [5]} onChange={(v) => updateProfile({ default_remind_minutes: v })} presets={[1, 2, 5, 10, 15, 30]} lo={1} hi={60} empty="No early reminders" />
        </div>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Planned sessions: before it starts</div>
          <ReminderEditor value={profile?.default_lead_minutes ?? [30]} onChange={(v) => updateProfile({ default_lead_minutes: v })} presets={[10, 15, 30, 60, 120, 1440]} lo={5} hi={1440} />
        </div>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Default session</div>
          <Seg options={[{ label: 'Wash', v: 'wash' }, { label: 'Dry', v: 'dry' }]} value={profile?.default_kind === 'dry' ? 'dry' : 'wash'} onChange={(v) => updateProfile({ default_kind: v })} />
        </div>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Demo timer speed</div>
          <Seg options={[{ label: 'Real time', v: 1 }, { label: 'Demo ×60', v: 60 }]} value={speed} onChange={setSpeed} />
        </div>
        <div className="dialog-actions"><button className="btn btn-primary" onClick={() => setPanel(false)}>Done</button></div>
      </div>
    </div>
  )
}

function ProfileDialog({ goLanding }) {
  const { setPanel, profile, auth, residences, residence, updateProfile, signOut } = useApp()
  const initial = (profile?.display_name || '?').slice(0, 1).toUpperCase()
  return (
    <div className="dialog-backdrop" onClick={() => setPanel(false)}>
      <div className="dialog" onClick={stop}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 48, height: 48, background: 'var(--color-accent-200)', fontWeight: 800, fontSize: 22, display: 'grid', placeItems: 'center', borderRadius: '50%' }}>{initial}</div>
          <div className="dialog-title" style={{ margin: 0 }}>Profile</div>
        </div>
        <div className="field"><label>Name</label>
          <input className="input" defaultValue={profile?.display_name} onBlur={(e) => e.target.value.trim() && e.target.value !== profile?.display_name && updateProfile({ display_name: e.target.value.trim() })} />
        </div>
        <div className="field"><label>Email</label><input className="input" value={auth?.user?.email || ''} readOnly /></div>
        <div className="field"><label>Residence</label>
          <select className="input" value={residence?.id || ''} onChange={(e) => updateProfile({ residence_id: e.target.value })}>
            {residences.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={async () => { setPanel(false); await signOut(); goLanding() }}>Sign out</button>
          <button className="btn btn-primary" onClick={() => setPanel(false)}>Done</button>
        </div>
      </div>
    </div>
  )
}
