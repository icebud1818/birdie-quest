import { useNavigate } from 'react-router-dom'
import RoundForm from '../components/RoundForm.jsx'
import { useData } from '../data/DataContext.jsx'

export default function AddRound() {
  const { addRound, loading } = useData()
  const nav = useNavigate()

  const onSubmit = async (round) => {
    const { id } = await addRound(round)
    nav(`/rounds/${id}`)
  }

  if (loading) return <div className="container center muted">Loading…</div>

  return <RoundForm onSubmit={onSubmit} heading="Log a round" submitLabel="Save round" />
}
