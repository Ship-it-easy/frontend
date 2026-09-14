import React, { useEffect, useMemo, useState } from 'react'
import { api, qs } from './api.js'
import { Badge, Button, Empty, Field, Icon, Modal, PageHeader, Shell, StatCard, Toast, formatDate } from './ui.jsx'
import { PlanningPage } from './DispatcherApp.jsx'

const nav = [
  { id: 'projects', label: 'Проекты', icon: 'projects' },
  { id: 'owners', label: 'Владельцы', icon: 'owners' },
  { id: 'planning', label: 'Планирование', icon: 'planning' },
]

function UserActions({ item, onChanged, notify }) {
  const [password, setPassword] = useState(false)
  async function toggle() {
    try { await api(`/api/admin/users/${item.id}/${item.status === 'ACTIVE' ? 'block' : 'unblock'}`, { method: 'POST' }); notify('Статус пользователя обновлён'); onChanged() }
    catch (error) { notify(error.message, 'error') }
  }
  async function reset(event) {
    event.preventDefault()
    const value = new FormData(event.currentTarget).get('password')
    try { await api(`/api/admin/users/${item.id}/reset-password`, { method: 'POST', body: JSON.stringify({ password: value }) }); notify('Пароль изменён, активные сессии завершены'); setPassword(false) }
    catch (error) { notify(error.message, 'error') }
  }
  return <><div className="row-actions"><button onClick={() => setPassword(true)}>Сменить пароль</button><button className={item.status === 'ACTIVE' ? 'danger-link' : ''} onClick={toggle}>{item.status === 'ACTIVE' ? 'Заблокировать' : 'Разблокировать'}</button></div>{password && <Modal title="Новый пароль" onClose={() => setPassword(false)}><form className="stack-form" onSubmit={reset}><Field label="Пароль" name="password" type="password" minLength="1" required autoFocus /><div className="form-actions"><Button kind="ghost" type="button" onClick={() => setPassword(false)}>Отмена</Button><Button>Сохранить</Button></div></form></Modal>}</>
}

function ProjectUsers({ project, onClose, notify }) {
  const [users, setUsers] = useState([])
  const [form, setForm] = useState({ login: '', password: '' })
  const [busy, setBusy] = useState(false)
  const load = () => api(`/api/admin/projects/${project.id}/users`).then((value) => setUsers(Array.isArray(value) ? value : [])).catch((error) => notify(error.message, 'error'))
  useEffect(() => { void load() }, [project.id])
  async function submit(event) {
    event.preventDefault(); setBusy(true)
    try { await api(`/api/admin/projects/${project.id}/users`, { method: 'POST', body: JSON.stringify({ ...form, role: 'dispatcher' }) }); setForm({ login: '', password: '' }); notify('Диспетчер создан'); load() }
    catch (error) { notify(error.message, 'error') } finally { setBusy(false) }
  }
  return <Modal wide title={project.name} subtitle={`Пользователи проекта · ${project.planning_timezone}`} onClose={onClose}>
    <div className="modal-split"><div><h3>Доступы диспетчеров</h3>{users.length ? <div className="data-list">{users.map((item) => <article key={item.id}><span className="avatar soft">{String(item.login || '?')[0].toUpperCase()}</span><div><b>{item.login || 'Без логина'}</b><small>{item.role === 'engineer' ? 'Инженер' : 'Диспетчер'}</small></div><Badge status={item.status}>{item.status === 'ACTIVE' ? 'Активен' : 'Заблокирован'}</Badge><UserActions item={item} onChanged={load} notify={notify} /></article>)}</div> : <Empty title="Нет пользователей" text="Создайте первый доступ диспетчера для проекта." />}</div><form className="side-form" onSubmit={submit}><span className="form-symbol">+</span><h3>Новый диспетчер</h3><p>Доступ только к данным этого проекта.</p><Field label="Логин" required value={form.login} onChange={(event) => setForm({ ...form, login: event.target.value })} /><Field label="Пароль" required type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><Button className="wide" disabled={busy}>{busy ? 'Создаём…' : 'Создать доступ'}</Button></form></div>
  </Modal>
}

function Projects({ notify }) {
  const [items, setItems] = useState([]), [search, setSearch] = useState(''), [status, setStatus] = useState(''), [selected, setSelected] = useState(null), [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', planning_timezone: 'Asia/Yekaterinburg' })
  const load = () => api(`/api/admin/projects${qs({ search, status })}`).then((value) => setItems(Array.isArray(value) ? value : [])).catch((error) => notify(error.message, 'error'))
  useEffect(() => { const timer = setTimeout(load, 200); return () => clearTimeout(timer) }, [search, status])
  const active = useMemo(() => items.filter((item) => item.status === 'ACTIVE').length, [items])
  async function create(event) {
    event.preventDefault(); setBusy(true)
    try { const created = await api('/api/admin/projects', { method: 'POST', body: JSON.stringify(form) }); setForm({ ...form, name: '' }); notify(`Проект «${created.name}» создан`); load() }
    catch (error) { notify(error.message, 'error') } finally { setBusy(false) }
  }
  async function toggle(item) {
    try { await api(`/api/admin/projects/${item.id}/${item.status === 'ACTIVE' ? 'block' : 'unblock'}`, { method: 'POST' }); notify('Статус проекта обновлён'); load() }
    catch (error) { notify(error.message, 'error') }
  }
  return <>
    <PageHeader eyebrow="Управление продуктом" title="Проекты" subtitle="Создавайте рабочие пространства и управляйте доступом команд." />
    <div className="stats-grid stats-two"><StatCard label="Всего проектов" value={items.length} tone="white" /><StatCard label="Активные пространства" value={active} /></div>
    <div className="content-split"><section><div className="filters"><div className="search-field"><Icon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Название проекта" /></div><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Все статусы</option><option value="ACTIVE">Активные</option><option value="BLOCKED">Заблокированные</option></select></div>
      <div className="table-card">{items.length ? <table><thead><tr><th>Проект</th><th>Часовой пояс</th><th>Статус</th><th /></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><div className="entity-cell"><span className="avatar soft">{String(item.name || '?')[0].toUpperCase()}</span><span><b>{item.name || `Проект #${item.id}`}</b><small>Создан {formatDate(item.created_at)}</small></span></div></td><td>{item.planning_timezone}</td><td><Badge status={item.status}>{item.status === 'ACTIVE' ? 'Активен' : 'Заблокирован'}</Badge></td><td><div className="row-actions"><button onClick={() => setSelected(item)}>Управление</button><button className={item.status === 'ACTIVE' ? 'danger-link' : ''} onClick={() => toggle(item)}>{item.status === 'ACTIVE' ? 'Блокировать' : 'Включить'}</button></div></td></tr>)}</tbody></table> : <Empty title="Проекты не найдены" text="Измените фильтры или создайте новый проект." />}</div>
    </section><form className="side-form sticky" onSubmit={create}><span className="form-symbol">+</span><h3>Новый проект</h3><p>Изолированное пространство команды.</p><Field label="Название" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Например, Пермский филиал" /><Field label="Часовой пояс" required value={form.planning_timezone} onChange={(event) => setForm({ ...form, planning_timezone: event.target.value })} hint="IANA-идентификатор, например Asia/Yekaterinburg" /><Button className="wide" disabled={busy}>{busy ? 'Создаём…' : 'Создать проект'}</Button></form></div>
    {selected && <ProjectUsers project={selected} onClose={() => setSelected(null)} notify={notify} />}
  </>
}

function Owners({ notify }) {
  const [items, setItems] = useState([]), [form, setForm] = useState({ login: '', password: '' }), [busy, setBusy] = useState(false)
  const load = () => api('/api/admin/owners').then((value) => setItems(Array.isArray(value) ? value : [])).catch((error) => notify(error.message, 'error'))
  useEffect(() => { void load() }, [])
  async function create(event) { event.preventDefault(); setBusy(true); try { await api('/api/admin/owners', { method: 'POST', body: JSON.stringify(form) }); setForm({ login: '', password: '' }); notify('Владелец создан'); load() } catch (error) { notify(error.message, 'error') } finally { setBusy(false) } }
  return <><PageHeader eyebrow="Управление доступом" title="Владельцы" subtitle="Пользователи с доступом ко всем проектам и настройкам." /><div className="content-split"><div className="table-card"><table><thead><tr><th>Пользователь</th><th>Статус</th><th /></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><div className="entity-cell"><span className="avatar soft">{String(item.login || '?')[0].toUpperCase()}</span><span><b>{item.login || 'Без логина'}</b><small>Владелец</small></span></div></td><td><Badge status={item.status}>{item.status === 'ACTIVE' ? 'Активен' : 'Заблокирован'}</Badge></td><td><UserActions item={item} onChanged={load} notify={notify} /></td></tr>)}</tbody></table></div><form className="side-form sticky" onSubmit={create}><span className="form-symbol">+</span><h3>Новый владелец</h3><p>Полный доступ к администрированию.</p><Field label="Логин" required value={form.login} onChange={(event) => setForm({ ...form, login: event.target.value })} /><Field label="Пароль" required type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><Button className="wide" disabled={busy}>{busy ? 'Создаём…' : 'Добавить'}</Button></form></div></>
}

function OwnerPlanning({ notify }) {
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  useEffect(() => {
    api('/api/admin/projects?status=ACTIVE').then((items) => {
      const values = Array.isArray(items) ? items : []
      setProjects(values)
      setProjectId((current) => current || String(values[0]?.id || ''))
    }).catch((error) => notify(error.message, 'error'))
  }, [])
  return <><div className="owner-project-switch"><Field label="Проект для планирования"><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Выберите проект</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.planning_timezone}</option>)}</select></Field></div>{projectId ? <PlanningPage key={projectId} projectId={Number(projectId)} notify={notify} ownerMode /> : <Empty title="Нет активного проекта" text="Создайте или включите проект, чтобы запустить планирование." />}</>
}

export default function OwnerApp({ user, onLogout }) {
  const [section, setSection] = useState('projects'), [toast, setToast] = useState(null)
  const notify = (message, type = 'info') => setToast({ message, type, key: Date.now() })
  return <Shell user={user} roleLabel="Владелец" contextLabel="Управление продуктом" contextValue="Все проекты" nav={nav} active={section} onNavigate={setSection} onLogout={onLogout}><div className="page-wrap">{section === 'projects' && <Projects notify={notify} />}{section === 'owners' && <Owners notify={notify} />}{section === 'planning' && <OwnerPlanning notify={notify} />}</div><Toast toast={toast} onClose={() => setToast(null)} /></Shell>
}
