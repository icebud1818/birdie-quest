import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'

export default function Nav() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <nav className="nav">
      <Link to="/" className="brand" onClick={close}>
        score<span className="pulse">Pulse</span>
      </Link>

      {user && (
        <button
          className="nav-toggle"
          aria-label="Toggle navigation menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? '✕' : '☰'}
        </button>
      )}

      {user ? (
        <div className={`nav-links ${open ? 'open' : ''}`}>
          <NavLink to="/" end onClick={close}>Dashboard</NavLink>
          <NavLink to="/rounds" onClick={close}>Rounds</NavLink>
          <NavLink to="/add" onClick={close}>Add Round</NavLink>
          <NavLink to="/best" onClick={close}>Courses</NavLink>
          <NavLink to="/records" onClick={close}>Records</NavLink>
          <NavLink to="/achievements" onClick={close}>Achievements</NavLink>
          <NavLink to="/settings" onClick={close}>Settings</NavLink>
          <span className="nav-email muted">{user.displayName || user.email}</span>
          <button onClick={() => { close(); logout() }}>Log out</button>
        </div>
      ) : (
        <div className="nav-links">
          <NavLink to="/login">Log in</NavLink>
          <Link to="/signup"><button className="primary">Sign up</button></Link>
        </div>
      )}
    </nav>
  )
}
