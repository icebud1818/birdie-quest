import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { lookupProfileByEmail } from '../utils/firestore.js'
import { firebaseConfigured } from '../firebase.js'

export default function FriendLookup() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const profile = await lookupProfileByEmail(email)
      if (!profile) {
        setError('No account found with that email.')
      } else if (profile.isPublic !== true) {
        setError('This user keeps their stats private.')
      } else {
        nav(`/u/${profile.uid}`)
      }
    } catch (err) {
      setError(err.message.replace('Firebase: ', ''))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container" style={{ maxWidth: 480 }}>
      <h1>Friends</h1>
      <p className="subtitle">Look up another golfer by email to see their stats.</p>
      <form className="card" onSubmit={submit}>
        <div style={{ marginBottom: 12 }}>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="friend@example.com"
            required
            autoFocus
          />
        </div>
        {error && <div className="error">{error}</div>}
        <button className="primary" type="submit" disabled={busy || !firebaseConfigured}>
          {busy ? 'Looking up…' : 'View stats'}
        </button>
        <div className="muted" style={{ marginTop: 12, fontSize: '0.85rem' }}>
          They'll only show up if they've made their stats public in Settings.
        </div>
      </form>
    </div>
  )
}
