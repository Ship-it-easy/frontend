import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { api } from './api.js'
import OwnerApp from './OwnerApp.jsx'
import DispatcherApp from './DispatcherApp.jsx'
import EngineerApp from './EngineerApp.jsx'
import './style.css'

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('Route app render error', error, info) }
  render() {
    if (!this.state.error) return this.props.children
    return <main className="crash-page"><section><span className="brand-mark">!</span><span className="eyebrow">Ошибка интерфейса</span><h1>Раздел не удалось открыть</h1><p>{this.state.error.message || 'Получены данные неожиданного формата.'}</p><button className="primary" onClick={() => window.location.reload()}>Перезагрузить приложение</button></section></main>
  }
}

function Login({ onLogin }) {
  const [form, setForm] = useState({ login: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await api('/api/auth/login', { method: 'POST', body: JSON.stringify(form) })
      onLogin(await api('/api/auth/me'))
    } catch (requestError) { setError(requestError.message || 'Не удалось войти') }
    finally { setBusy(false) }
  }
  return <main className="login-page">
    <section className="login-promo">
      <div className="login-brand"><span className="brand-mark">↗</span><span>Маршрут<small>выездной сервис</small></span></div>
      <div className="login-copy"><span className="eyebrow light">Умное планирование</span><h1>Рабочий день<br />без лишних километров</h1><p>Заявки, инженеры и оптимальные маршруты — в одном пространстве.</p></div>
      <div className="login-orbit"><i /><i /><i /></div>
    </section>
    <section className="login-panel"><form className="login-card" onSubmit={submit}>
      <div className="mobile-brand"><span className="brand-mark">↗</span> Маршрут</div>
      <span className="eyebrow">Добро пожаловать</span><h2>Вход в систему</h2><p>Используйте учётную запись владельца, диспетчера или инженера.</p>
      <label>Логин<input autoFocus autoComplete="username" required value={form.login} onChange={(event) => setForm({ ...form, login: event.target.value })} placeholder="Введите логин" /></label>
      <label>Пароль<input type="password" autoComplete="current-password" required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Введите пароль" /></label>
      {error && <div className="form-error">{error}</div>}
      <button className="primary wide" disabled={busy}>{busy ? 'Входим…' : 'Войти'}</button>
    </form></section>
  </main>
}

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api('/api/auth/me').then(setUser).catch(() => setUser(null)).finally(() => setLoading(false))
    const expire = () => setUser(null)
    window.addEventListener('route-app:unauthorized', expire)
    return () => window.removeEventListener('route-app:unauthorized', expire)
  }, [])
  async function logout() { try { await api('/api/auth/logout', { method: 'POST' }) } finally { setUser(null) } }
  if (loading) return <div className="app-loader"><span className="brand-mark">↗</span><b>Маршрут</b><i /></div>
  if (!user) return <Login onLogin={setUser} />
  const role = String(user.role).toLowerCase()
  if (role === 'owner' || role === 'admin') return <OwnerApp user={user} onLogout={logout} />
  if (role === 'engineer') return <EngineerApp user={user} onLogout={logout} />
  return <DispatcherApp user={user} onLogout={logout} />
}

const container = document.getElementById('root')
const root = container.__routeAppRoot || createRoot(container)
container.__routeAppRoot = root
root.render(<AppErrorBoundary><App /></AppErrorBoundary>)
