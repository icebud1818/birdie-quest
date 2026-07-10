import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { useTheme } from '../theme/ThemeContext.jsx'
import { firebaseConfigured } from '../firebase.js'
import { fetchProfile, setProfilePublic, upsertProfile } from '../utils/firestore.js'

export default function Settings() {
  const { user, updateDisplayName } = useAuth()
  const { theme, setTheme } = useTheme()

  const [name, setName] = useState(user?.displayName || '')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  // Sharing: null while loading, then a boolean.
  const [isPublic, setIsPublic] = useState(null)
  const [shareBusy, setShareBusy] = useState(false)

  // Ensure a profile doc exists (so friends can look this user up) and load
  // the current sharing choice for the toggle.
  useEffect(() => {
    if (!user || !firebaseConfigured) return
    let active = true
    ;(async () => {
      await upsertProfile(user.uid, { displayName: user.displayName, email: user.email }).catch(() => {})
      const profile = await fetchProfile(user.uid).catch(() => null)
      if (active) setIsPublic(profile?.isPublic === true)
    })()
    return () => {
      active = false
    }
  }, [user])

  const saveName = async (e) => {
    e.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      await updateDisplayName(name)
      // Reflect the new name on the public profile too.
      await upsertProfile(user.uid, { displayName: name, email: user.email }).catch(() => {})
      setNotice('Display name saved.')
    } catch (err) {
      setError(err.message.replace('Firebase: ', ''))
    } finally {
      setBusy(false)
    }
  }

  const changeSharing = async (next) => {
    if (next === isPublic) return
    setShareBusy(true)
    const prev = isPublic
    setIsPublic(next) // optimistic
    try {
      await setProfilePublic(user.uid, next)
    } catch (err) {
      setIsPublic(prev) // revert on failure
      setError(err.message.replace('Firebase: ', ''))
    } finally {
      setShareBusy(false)
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

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Sharing</h2>
        <label>Stats visibility</label>
        <div className="theme-toggle">
          <button
            type="button"
            className={isPublic === false ? 'primary' : ''}
            aria-pressed={isPublic === false}
            disabled={isPublic === null || shareBusy || !firebaseConfigured}
            onClick={() => changeSharing(false)}
          >
            🔒 Private
          </button>
          <button
            type="button"
            className={isPublic === true ? 'primary' : ''}
            aria-pressed={isPublic === true}
            disabled={isPublic === null || shareBusy || !firebaseConfigured}
            onClick={() => changeSharing(true)}
          >
            🌎 Public
          </button>
        </div>
        <div className="muted" style={{ marginTop: 8, fontSize: '0.85rem' }}>
          {isPublic === null
            ? 'Loading…'
            : isPublic
              ? 'Anyone signed in can look you up by email and view your stats (read-only). Your data stays private otherwise.'
              : 'Only you can see your stats. Switch to Public to let friends look you up by email.'}
        </div>
      </div>
    </div>
  )
}
