import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import ConfigWarning from '../components/ConfigWarning.jsx'
import { firebaseConfigured } from '../firebase.js'

export default function Login() {
  const { login, resetPassword } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      await login(email, password)
      nav('/')
    } catch (err) {
      setError(err.message.replace('Firebase: ', ''))
    } finally {
      setBusy(false)
    }
  }

  const forgotPassword = async () => {
    setError('')
    setNotice('')
    if (!email) {
      setError('Enter your email above, then click “Forgot password?”')
      return
    }
    setBusy(true)
    try {
      await resetPassword(email)
      setNotice(`Password reset email sent to ${email}.`)
    } catch (err) {
      setError(err.message.replace('Firebase: ', ''))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container" style={{ maxWidth: 420 }}>
      <h1>Log in</h1>
      <ConfigWarning />
      <form className="card" onSubmit={submit}>
        <div style={{ marginBottom: 12 }}>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <div className="error">{error}</div>}
        {notice && <div className="success">{notice}</div>}
        <button className="primary" type="submit" disabled={busy || !firebaseConfigured}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
        <div className="muted" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="link-button"
            onClick={forgotPassword}
            disabled={busy || !firebaseConfigured}
          >
            Forgot password?
          </button>
        </div>
        <div className="muted" style={{ marginTop: 12 }}>
          No account? <Link to="/signup">Sign up</Link>
        </div>
      </form>
    </div>
  )
}
