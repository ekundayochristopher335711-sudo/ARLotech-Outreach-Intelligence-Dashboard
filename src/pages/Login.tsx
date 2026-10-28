import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, ArrowUpRight, AudioLines, Check, Fingerprint, KeyRound, LockKeyhole, ShieldCheck, Terminal, Zap } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import './Login.css'

type LoginMode = 'standard' | 'blacksite'
const currentYear = new Date().getFullYear()

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<LoginMode>(() => {
    try {
      return localStorage.getItem('arlotech-login-mode') === 'blacksite' ? 'blacksite' : 'standard'
    } catch { return 'standard' }
  })

  const toggleMode = () => {
    const nextMode = mode === 'standard' ? 'blacksite' : 'standard'
    setMode(nextMode)
    try { localStorage.setItem('arlotech-login-mode', nextMode) } catch { /* storage is optional */ }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && window.location.pathname === '/login') navigate('/', { replace: true })
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && window.location.pathname === '/login') navigate('/', { replace: true })
    })
    return () => listener.subscription.unsubscribe()
  }, [navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      else navigate('/', { replace: true })
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Sign in failed. Please try again.')
    } finally { setLoading(false) }
  }

  const isBlacksite = mode === 'blacksite'

  return (
    <main className={`login-shell ${isBlacksite ? 'login-blacksite' : 'login-standard'}`}>
      <div className="login-noise" aria-hidden="true" />
      <header className="login-topbar">
        <a className="login-brand" href="/login" aria-label="Arlotech login home">
          <span className="login-brand-mark"><Activity size={19} strokeWidth={2.2} /></span>
          <span>ARLOTECH<span className="login-brand-sub"> / OUTREACH INTELLIGENCE</span></span>
        </a>
        <div className="login-top-actions">
          <span className="login-secure-status"><span className="status-pulse" /> SECURE ACCESS</span>
          <button className="mode-toggle" type="button" onClick={toggleMode} aria-pressed={isBlacksite}>
            <span className="toggle-icon">{isBlacksite ? <Terminal size={15} /> : <Zap size={15} />}</span>
            <span className="toggle-copy"><small>INTERFACE</small><strong>{isBlacksite ? 'BLACKSITE MODE' : 'STANDARD MODE'}</strong></span>
            <span className={`toggle-track ${isBlacksite ? 'is-on' : ''}`}><span /></span>
          </button>
        </div>
      </header>

      <div className="login-layout">
        <section className="login-intro">
          <div className="intro-eyebrow"><span className="eyebrow-line" /> {isBlacksite ? 'RESTRICTED OPERATIONS // NODE 01' : 'YOUR BUSINESS, IN MOTION'}</div>
          <h1>{isBlacksite ? <>ENTER THE<br /><span>BLACKSITE.</span></> : <>Find the signal.<br /><span>Start the conversation.</span></>}</h1>
          <p className="intro-description">{isBlacksite
            ? 'A secure command environment for prospect intelligence, campaign operations, and precision outreach.'
            : 'One command center for prospect research, sharper outreach, and turning opportunities into real conversations.'}</p>

          <div className="intro-visual" aria-hidden="true">
            <div className="visual-grid" />
            <div className="visual-orbit orbit-one" /><div className="visual-orbit orbit-two" />
            <div className="visual-core"><div className="core-inner"><Fingerprint size={48} strokeWidth={1.15} /></div></div>
            <div className="visual-scanline" />
            <div className="visual-label label-left"><span>ENCRYPTION</span><strong>AES-256</strong></div>
            <div className="visual-label label-right"><span>AUTH STATUS</span><strong><i /> VERIFIED</strong></div>
            <div className="visual-coordinate">{isBlacksite ? 'NODE: 0xA7 // TRACE: NULL' : 'ARLOTECH INTELLIGENCE SYSTEMS'}</div>
          </div>

          <div className="login-feature-row">
            <div className="feature-icon"><ShieldCheck size={17} /></div>
            <div><strong>{isBlacksite ? 'Encrypted access layer' : 'Your workspace, protected'}</strong><span>{isBlacksite ? 'Identity verification required' : 'Private sign-in powered by Supabase Auth'}</span></div>
            <Check className="feature-check" size={17} />
          </div>
        </section>

        <section className="login-form-side">
          <div className="login-card">
            <div className="card-topline"><span className="card-overline">{isBlacksite ? 'AUTHENTICATION GATEWAY' : 'MEMBER ACCESS'}</span><span className="card-index">{isBlacksite ? 'SEC. 01' : '01 / 01'}</span></div>
            <div className="form-heading-icon">{isBlacksite ? <LockKeyhole size={22} /> : <KeyRound size={22} />}</div>
            <h2>{isBlacksite ? 'Identify yourself.' : 'Welcome back.'}</h2>
            <p className="form-subtitle">{isBlacksite ? 'Credentials are required to establish a secure session.' : 'Sign in to continue to your intelligence dashboard.'}</p>

            {isBlacksite && <div className="terminal-strip"><span className="terminal-dot" /><span>AUTH_PROTOCOL :: READY</span><AudioLines size={14} /></div>}

            <form onSubmit={handleSubmit} className="login-form">
              {error && <div role="alert" className="login-error"><span>!</span>{error}</div>}
              <div className="login-field">
                <label htmlFor="email">{isBlacksite ? 'OPERATOR IDENTIFIER' : 'Email address'}</label>
                <div className="field-wrap"><span className="field-prefix">{isBlacksite ? 'ID://' : '@'}</span><input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={isBlacksite ? 'operator@arlotech.io' : 'you@example.com'} required /></div>
              </div>
              <div className="login-field">
                <div className="label-row"><label htmlFor="password">{isBlacksite ? 'ACCESS KEY' : 'Password'}</label><span className="field-hint">{isBlacksite ? '••••••••••' : 'Protected'}</span></div>
                <div className="field-wrap"><span className="field-prefix"><LockKeyhole size={15} /></span><input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isBlacksite ? 'Enter decryption key' : 'Enter your password'} required /></div>
              </div>
              <button type="submit" className="login-submit" disabled={loading}>
                <span>{loading ? (isBlacksite ? 'VERIFYING CREDENTIALS…' : 'Signing in…') : (isBlacksite ? 'INITIATE SECURE SESSION' : 'Sign in to dashboard')}</span>
                {loading ? <span className="button-loader" /> : <ArrowUpRight size={18} />}
              </button>
            </form>

            <div className="login-encryption-note"><ShieldCheck size={15} /><span>{isBlacksite ? 'SESSION ENCRYPTION ACTIVE' : 'Secure authentication'}</span><span className="encryption-divider" /><span>{isBlacksite ? 'TLS 1.3' : 'Supabase Auth'}</span></div>
            {isBlacksite && <div className="access-warning"><Terminal size={13} /><span>UNAUTHORIZED ACCESS IS MONITORED AND LOGGED</span></div>}
          </div>
          <div className="login-footnote"><span>© {currentYear} ARLOTECH DIGITAL SOLUTIONS</span><span><i /> SYSTEMS OPERATIONAL</span></div>
        </section>
      </div>
      <div className="login-bottomline"><span>OUTREACH INTELLIGENCE PLATFORM</span><span>{isBlacksite ? 'NO SIGNAL. NO TRACE. JUST INTELLIGENCE.' : 'RESEARCH BETTER. REACH OUT SMARTER.'}</span><span>BUILD 2.6.10 <b>●</b></span></div>
    </main>
  )
}
