import { useEffect, useState } from 'react'
import { AppProvider, useApp } from './lib/store'
import Landing from './Landing'
import Auth from './Auth'
import Plan from './pages/Plan'
import MyLaundry from './pages/MyLaundry'
import Insights from './pages/Insights'
import { Dialogs } from './Dialogs'
import { IC, Icon, Logo, ViewCtx, scrollTop, useIsMobile } from './ui'

const FRAME = { w: 390, h: 844, bezel: 10 } // iPhone-sized screen

// Phone preview: on a wide screen the app is shown inside a 390x844 phone frame
// (toggle top right). On a real phone it fills the screen with no frame.
export default function App() {
  const [wide, setWide] = useState(window.innerWidth >= 600)
  const [pref, setPref] = useState(() => {
    try { return localStorage.getItem('ll-phone') !== '0' } catch { return true }
  })
  useEffect(() => {
    const f = () => setWide(window.innerWidth >= 600)
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  const phone = wide && pref
  const toggle = () => {
    setPref(!pref)
    try { localStorage.setItem('ll-phone', pref ? '0' : '1') } catch { /* ignore */ }
  }

  const outer = FRAME.w + FRAME.bezel * 2
  const frame = phone
    ? {
        '--app-h': `min(${FRAME.h}px, calc(100vh - ${24 + FRAME.bezel * 2}px))`,
        width: outer, height: `min(${FRAME.h + FRAME.bezel * 2}px, calc(100vh - 24px))`, flex: 'none',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative',
        transform: 'translateZ(0)', // makes fixed children (nav, dialogs, toast) sit inside the frame
        border: `${FRAME.bezel}px solid #1d2b36`, borderRadius: 44, boxShadow: '0 20px 50px rgba(31,38,34,.3)',
        background: 'var(--color-bg)',
      }
    : { width: '100%' }

  return (
    <ViewCtx.Provider value={{ phone }}>
      <AppProvider>
        <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: phone ? 12 : 0, background: phone ? '#dbe9f4' : 'var(--color-bg)' }}>
          {wide && (
            <button className="btn btn-secondary" onClick={toggle} style={{ position: 'fixed', top: 12, right: 12, zIndex: 100, background: '#f5f9fc', borderRadius: 16 }}>
              {phone ? 'Desktop view' : 'Phone view'}
            </button>
          )}
          <div id="ll-frame" style={frame}>
            <div id="ll-scroll" className={phone ? 'phone-scroll' : ''} style={phone ? { flex: 1, minHeight: 0, overflow: 'auto' } : undefined}>
              <Root />
            </div>
          </div>
        </div>
      </AppProvider>
    </ViewCtx.Provider>
  )
}

const NAV = [
  { k: 'sched', label: 'Plan', d: IC.cal },
  { k: 'laundry', label: 'My Laundry', d: IC.timer },
  { k: 'insights', label: 'Insights', d: IC.chart },
]

function Root() {
  const { auth, loadError, toast } = useApp()
  const mob = useIsMobile()
  const [view, setView] = useState(null) // null = decide from auth
  const [email, setEmail] = useState('')

  const shown = view ?? (auth ? 'app' : 'landing')
  useEffect(() => { if (auth && view === 'auth') setView('app') }, [auth, view])
  useEffect(() => { if (!auth && view === 'app') setView('landing') }, [auth, view])

  if (auth === undefined) return <div style={{ padding: 32, opacity: 0.6 }}>Loading…</div>

  const openApp = () => { scrollTop(); setView(auth ? 'app' : 'auth') }

  return (
    <>
      {loadError && <div className="error" style={{ margin: 16 }}>Could not load data: {loadError}</div>}
      {shown === 'landing' && <Landing email={email} setEmail={setEmail} openApp={openApp} />}
      {shown === 'auth' && <Auth initialEmail={email} onBack={() => setView('landing')} />}
      {shown === 'app' && auth && <Shell mob={mob} goLanding={() => { scrollTop(); setView('landing') }} />}
      {toast && <div className="toast" style={{ bottom: mob && shown === 'app' ? 76 : 24 }}>{toast.msg}</div>}
    </>
  )
}

function Shell({ mob, goLanding }) {
  const { tab, setTab, setNotesOpen, notes, profile, residences, residence, updateProfile, setPanel } = useApp()
  const go = (k) => { setTab(k); setNotesOpen(false); scrollTop() }
  const padX = mob ? 16 : 40
  const initial = (profile?.display_name || '?').slice(0, 1).toUpperCase()

  return (
    <div>
      <div style={{ display: 'flex', minHeight: 'var(--app-h)' }}>
        {!mob && (
          <aside style={{ width: 240, flex: 'none', borderRight: '2px solid var(--color-divider)', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 24, position: 'sticky', top: 0, height: '100vh' }}>
            <Logo onClick={goLanding} />
            <nav style={{ display: 'grid', gap: 4 }}>
              {NAV.map((n) => (
                <button key={n.k} onClick={() => go(n.k)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600, textAlign: 'left', background: tab === n.k ? 'var(--color-accent)' : 'transparent', color: tab === n.k ? 'var(--color-bg)' : 'var(--color-text)', borderRadius: 12 }}>
                  <Icon d={n.d} />{n.label}
                </button>
              ))}
            </nav>
            <div style={{ marginTop: 'auto', display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, opacity: 0.7, padding: 12, border: '1px solid var(--color-divider)', borderRadius: 12 }}>
                Traffic data is simulated. Machines are not reserved or live-tracked.
              </div>
              <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', color: 'var(--color-text)' }} onClick={goLanding}>← About LaundryLink</button>
            </div>
          </aside>
        )}

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `12px ${padX}px`, borderBottom: '2px solid var(--color-divider)', position: 'sticky', top: 0, background: 'var(--color-bg)', zIndex: 15 }}>
            {mob && <button aria-label="Back to landing page" onClick={goLanding} style={{ width: 20, height: 20, padding: 0, border: 0, cursor: 'pointer', background: 'var(--color-accent)', flex: 'none', borderRadius: 6 }} />}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: '0 1 300px' }}>
              <Icon d={IC.pin} size={16} />
              <select className="input" style={{ minHeight: 36, fontWeight: 600 }} value={residence?.id || ''} onChange={(e) => updateProfile({ residence_id: e.target.value })}>
                {residences.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
              <button className="btn btn-icon" aria-label="Notifications" onClick={() => setNotesOpen((o) => !o)} style={{ position: 'relative' }}>
                <Icon d={IC.bell} size={19} />
                {notes.length > 0 && <span style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, background: 'var(--color-accent)', borderRadius: 999 }} />}
              </button>
              <button className="btn btn-icon" aria-label="Settings" onClick={() => { setNotesOpen(false); setPanel('settings') }}><Icon d={IC.sliders} size={19} /></button>
              <button aria-label="Profile" onClick={() => { setNotesOpen(false); setPanel('profile') }} style={{ width: 36, height: 36, border: 0, background: 'var(--color-accent-200)', fontWeight: 800, cursor: 'pointer', borderRadius: '50%' }}>{initial}</button>
            </div>
          </div>

          <main style={{ flex: 1, padding: `${mob ? 20 : 32}px ${padX}px ${mob ? 96 : 48}px`, maxWidth: 1200, width: '100%' }}>
            {tab === 'sched' && <Plan mob={mob} />}
            {tab === 'laundry' && <MyLaundry mob={mob} />}
            {tab === 'insights' && <Insights mob={mob} />}
          </main>
        </div>
      </div>

      {mob && (
        <nav style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: 'var(--color-bg)', borderTop: '2px solid var(--color-divider)', display: 'grid', gridTemplateColumns: `repeat(${NAV.length},1fr)`, zIndex: 25, padding: '4px 4px 8px', gap: 4 }}>
          {NAV.map((n) => (
            <button key={n.k} onClick={() => go(n.k)} style={{ border: 0, background: 'transparent', color: tab === n.k ? 'var(--color-accent-700)' : 'var(--color-text)', padding: '8px 2px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer', minHeight: 54, borderRadius: 12 }}>
              <Icon d={n.d} size={22} />{n.label}
            </button>
          ))}
        </nav>
      )}
      <Dialogs goLanding={goLanding} />
    </div>
  )
}
