import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext.jsx'
import { ThemeProvider } from './theme/ThemeContext.jsx'
import { DataProvider } from './data/DataContext.jsx'
import Nav from './components/Nav.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import AchievementToast from './components/AchievementToast.jsx'
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import Dashboard from './pages/Dashboard.jsx'
import AddRound from './pages/AddRound.jsx'
import EditRound from './pages/EditRound.jsx'
import RoundsList from './pages/RoundsList.jsx'
import RoundDetail from './pages/RoundDetail.jsx'
import BestScores from './pages/BestScores.jsx'
import Records from './pages/Records.jsx'
import Achievements from './pages/Achievements.jsx'
import Settings from './pages/Settings.jsx'
import FriendLookup from './pages/FriendLookup.jsx'
import FriendStats from './pages/FriendStats.jsx'

// Only wrap logged-in routes with DataProvider so we don't hit Firestore
// before the user is authenticated.
function AppRoutes() {
  const { user } = useAuth()
  const wrapProtected = (element) => (
    <ProtectedRoute>
      <DataProvider>
        {element}
        <AchievementToast />
      </DataProvider>
    </ProtectedRoute>
  )

  return (
    <>
      <Nav />
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/signup" element={user ? <Navigate to="/" replace /> : <Signup />} />
        <Route path="/" element={user ? wrapProtected(<Dashboard />) : <Home />} />
        <Route path="/add" element={wrapProtected(<AddRound />)} />
        <Route path="/rounds" element={wrapProtected(<RoundsList />)} />
        <Route path="/rounds/:id" element={wrapProtected(<RoundDetail />)} />
        <Route path="/rounds/:id/edit" element={wrapProtected(<EditRound />)} />
        <Route path="/best" element={wrapProtected(<BestScores />)} />
        <Route path="/records" element={wrapProtected(<Records />)} />
        <Route path="/achievements" element={wrapProtected(<Achievements />)} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/friends" element={<ProtectedRoute><FriendLookup /></ProtectedRoute>} />
        <Route path="/u/:uid" element={<ProtectedRoute><FriendStats /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <div className="app">
      <HashRouter>
        <ThemeProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </ThemeProvider>
      </HashRouter>
    </div>
  )
}
