import { useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { useTheme } from '../theme/ThemeContext.jsx'
import { firebaseConfigured } from '../firebase.js'

export default function Settings() {
  const { user, updateDisplayName } = useAuth()
  const { theme, setTheme } = useTheme()

  const [name, setName] = useState(user?.displayName || '')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const saveName = async (e) => {
    e.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      await updateDisplayName(name)
      setNotice('Display name saved.')
    } catch (err) {
      setError(err.message.replace('Firebase: ', ''))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container" style={{ maxWidth: 560 }}>
      <h1>Settings</h1>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Appearance</h2>
        <label>Theme</label>
        <div className="theme-toggle">
          <button
            type="button"
            className={theme === 'dark' ? 'primary' : ''}
            aria-pressed={theme === 'dark'}
            onClick={() => setTheme('dark')}
          >
            🌙 Dark
          </button>
          <button
            type="button"
            className={theme === 'light' ? 'primary' : ''}
            aria-pressed={theme === 'light'}
            onClick={() => setTheme('light')}
          >
            ☀️ Light
          </button>
        </div>
      </div>

      <form className="card" onSubmit={saveName} style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Profile</h2>
        <div style={{ marginBottom: 12 }}>
          <label>Display name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="How your name appears in the app"
            maxLength={40}
          />
          <div className="muted" style={{ marginTop: 4, fontSize: '0.8rem' }}>
            Shown in the nav and on your dashboard. Leave blank to fall back to your email.
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Email</label>
          <input type="email" value={user?.email || ''} disabled />
        </div>
        {error && <div className="error">{error}</div>}
        {notice && <div className="success">{notice}</div>}
        <button className="primary" type="submit" disabled={busy || !firebaseConfigured}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  )
}
