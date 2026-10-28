import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpRight, AudioLines, Check, Eye, Fingerprint, KeyRound, LockKeyhole, ShieldCheck, Terminal, X, ScanEye } from 'lucide-react'
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
  const [fingerprintHeld, setFingerprintHeld] = useState(false)
  const [scanActive, setScanActive] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scanTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const scanFinishTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdStarted = useRef(false)
  const [mode, setMode] = useState<LoginMode>(() => {
    try {
      return localStorage.getItem('arlotech-login-mode') === 'blacksite' ? 'blacksite' : 'standard'
    } catch { return 'standard' }
  })

  const setLoginMode = useCallback((nextMode: LoginMode) => {
    setMode(nextMode)
    try { localStorage.setItem('arlotech-login-mode', nextMode) } catch { /* storage is optional */ }
    window.dispatchEvent(new Event('arlotech-mode-change'))
  }, [])

  const clearScanTimers = useCallback(() => {
    if (scanTimer.current) clearInterval(scanTimer.current)
    if (scanFinishTimer.current) clearTimeout(scanFinishTimer.current)
    scanTimer.current = null
    scanFinishTimer.current = null
  }, [])

  const cancelEyeScan = useCallback(() => {
    clearScanTimers()
    setScanActive(false)
    setScanProgress(0)
  }, [clearScanTimers])

  const startFingerprintHold = () => {
    if (mode === 'blacksite') {
      setLoginMode('standard')
      return
    }
    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdStarted.current = true
    setFingerprintHeld(true)
    holdTimer.current = setTimeout(() => {
      holdStarted.current = false
      setFingerprintHeld(false)
      setLoginMode('blacksite')
    }, 5000)
  }

  const endFingerprintHold = () => {
    if (!holdStarted.current) return
    holdStarted.current = false
    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = null
    setFingerprintHeld(false)
  }

  const startEyeScan = () => {
    if (mode === 'blacksite') {
      setLoginMode('standard')
      return
    }
    clearScanTimers()
    setScanProgress(0)
    setScanActive(true)
    const startedAt = Date.now()
    scanTimer.current = setInterval(() => {
      const progress = Math.min(100, ((Date.now() - startedAt) / 7000) * 100)
      setScanProgress(progress)
      if (progress >= 100 && scanTimer.current) {
        clearInterval(scanTimer.current)
        scanTimer.current = null
      }
    }, 50)
    scanFinishTimer.current = setTimeout(() => {
      clearScanTimers()
      setScanActive(false)
      setScanProgress(0)
      setLoginMode('blacksite')
    }, 7000)
  }

  useEffect(() => {
    if (!scanActive) return
    const cancelOnOutsideAction = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('.eye-scan-panel')) { cancelEyeScan(); return }
      cancelEyeScan()
    }
    const cancelOnKey = () => cancelEyeScan()
    document.addEventListener('pointerdown', cancelOnOutsideAction, true)
    document.addEventListener('keydown', cancelOnKey, true)
    return () => {
      document.removeEventListener('pointerdown', cancelOnOutsideAction, true)
      document.removeEventListener('keydown', cancelOnKey, true)
    }
  }, [scanActive, cancelEyeScan])

  useEffect(() => () => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    clearScanTimers()
  }, [clearScanTimers])

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
      {isBlacksite && <div className="matrix-rain" aria-hidden="true"><div>{Array.from({ length: 34 }, (_, i) => <span key={i}>{Array.from({ length: 34 }, (_, j) => ((i * 13 + j * 7 + i * j) % 2)).join(' ')}</span>)}</div></div>}
      <header className="login-topbar">
        <a className="login-brand" href="/login" aria-label="Arlotech login home">
          <span className="login-brand-mark"><Fingerprint size={21} strokeWidth={1.8} /></span>
          <span>ARLOTECH<span className="login-brand-sub"> / OUTREACH INTELLIGENCE</span></span>
        </a>
        <div className="login-top-actions">
          <span className="login-secure-status"><span className="status-pulse" /> {isBlacksite ? 'COVERT NODE // ONLINE' : 'SECURE ACCESS'}</span>
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

          <div className="covert-access-zone" aria-label="Optional interface access gestures">
            <button
              type="button"
              className={`fingerprint-trigger ${fingerprintHeld ? 'is-holding' : ''}`}
              onPointerDown={(event) => { event.preventDefault(); startFingerprintHold() }}
              onPointerUp={endFingerprintHold}
              onPointerLeave={endFingerprintHold}
              onPointerCancel={endFingerprintHold}
              onKeyDown={(event) => { if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); startFingerprintHold() } }}
              onKeyUp={(event) => { if (event.key === ' ' || event.key === 'Enter') endFingerprintHold() }}
              onContextMenu={(event) => event.preventDefault()}
              aria-label={isBlacksite ? 'Fingerprint sensor' : 'Fingerprint sensor'}
            >
              <span className="fingerprint-trigger-ring"><Fingerprint size={43} strokeWidth={1.25} /></span>
              <span className="fingerprint-hold-meter"><i /></span>
            </button>
            <button type="button" className="eye-scan-trigger" onClick={startEyeScan} aria-label="Activate eye scan">
              <ScanEye size={27} strokeWidth={1.3} />
            </button>
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
      {scanActive && (
        <div className="eye-scan-overlay" role="dialog" aria-modal="true" aria-label="Eye scan simulation in progress" onPointerDown={(event) => { if (event.target === event.currentTarget) cancelEyeScan() }}>
          <div className="eye-scan-panel" onPointerDown={cancelEyeScan}>
            <button type="button" className="eye-scan-cancel" onClick={cancelEyeScan} aria-label="Cancel eye scan"><X size={17} /></button>
            <div className="scan-panel-kicker"><span className="status-pulse" /> SIMULATED BIOMETRIC GATEWAY</div>
            <div className="eye-visual"><div className="eye-target"><Eye size={76} strokeWidth={1.1} /><span className="eye-target-corner corner-tl" /><span className="eye-target-corner corner-tr" /><span className="eye-target-corner corner-bl" /><span className="eye-target-corner corner-br" /></div><div className="eye-beam" /><div className="eye-crosshair" /></div>
            <h2>RETINAL HANDSHAKE</h2>
            <div className="scan-progress-meta"><span>SEQUENCE INTEGRITY</span><strong>{Math.floor(scanProgress)}%</strong></div>
            <div className="scan-progress-track"><i style={{ width: `${scanProgress}%` }} /></div>

          </div>
        </div>
      )}
      <div className="login-bottomline"><span>OUTREACH INTELLIGENCE PLATFORM</span><span>{isBlacksite ? 'NO SIGNAL. NO TRACE. JUST INTELLIGENCE.' : 'RESEARCH BETTER. REACH OUT SMARTER.'}</span><span>BUILD 2.6.10 <b>●</b></span></div>
    </main>
  )
}
