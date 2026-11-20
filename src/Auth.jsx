import { useState } from 'react'
import { supabase } from './lib/supabase'
import { Logo } from './ui'

export default function Auth({ initialEmail = '', onBack }) {
  const [mode, setMode] = useState('signup')
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr(''); setMsg('')
    const { data, error } =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { data: { display_name: name.trim() || email.split('@')[0] } } })
    setBusy(false)
    if (error) setErr(error.message)
    else if (mode === 'signup' && !data.session) setMsg('Account created. Check your email to confirm it, then log in.')
  }

  return (
    <div style={{ minHeight: 'var(--app-h)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <form onSubmit={submit} style={{ width: 'min(420px,100%)', background: 'var(--color-surface)', borderRadius: 20, padding: 28, display: 'grid', gap: 14, boxShadow: 'var(--shadow-md)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Logo />
          <button type="button" className="btn btn-ghost" onClick={onBack}>← Back</button>
        </div>
        <h2 style={{ margin: 0, fontSize: 28 }}>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
        {mode === 'signup' && (
          <div className="field"><label>Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maya" /></div>
        )}
        <div className="field"><label>Email</label><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label>Password</label><input className="input" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {err && <div className="error">{err}</div>}
        {msg && <div className="tag tag-accent" style={{ whiteSpace: 'normal', padding: '10px 12px', fontSize: 13 }}>{msg}</div>}
        <button className="btn btn-primary" style={{ minHeight: 44, fontSize: 15 }} disabled={busy}>{mode === 'login' ? 'Log in' : 'Sign up free'}</button>
        <button type="button" className="btn btn-ghost" onClick={() => { setErr(''); setMsg(''); setMode(mode === 'login' ? 'signup' : 'login') }}>
          {mode === 'login' ? 'No account? Sign up' : 'Have an account? Log in'}
        </button>
      </form>
    </div>
  )
}
