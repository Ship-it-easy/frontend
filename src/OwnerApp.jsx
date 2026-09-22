import React, { useEffect, useMemo, useState } from 'react'
import { api, qs } from './api.js'
import { Badge, Button, Empty, Field, Icon, Modal, PageHeader, Shell, StatCard, Toast, formatDate, formatPriority } from './ui.jsx'
import { JobForm, PlanningPage, ScheduleEditor } from './DispatcherApp.jsx'
import JobImports from './JobImports.jsx'

const nav = [
  { id: 'projects', label: 'Проекты', icon: 'projects' },
  { id: 'owners', label: 'Владельцы', icon: 'owners' },
  { id: 'jobs', label: 'Заявки', icon: 'jobs' },
  { id: 'imports', label: 'Импорт CSV', icon: 'jobs' },
  { id: 'engineers', label: 'Инженеры', icon: 'engineers' },
  { id: 'planning', label: 'Планирование', icon: 'planning' },
]

function UserActions({ item, onChanged, notify }) {
  const [password, setPassword] = useState(false)
  async function toggle() {
    try { const result = await api(`/api/admin/users/${item.id}/${item.status === 'ACTIVE' ? 'block' : 'unblock'}`, { method: 'POST' }); if (result?.planning_event_id) window.sessionStorage.setItem('route-app:last-planning-event', String(result.planning_event_id)); notify(result?.planning_event_id ? `Статус обновлён. Перепланирование #${result.planning_event_id} запущено` : 'Статус пользователя обновлён'); onChanged() }
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

function OwnerPlanning({ user, notify, onNavigate }) {
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  useEffect(() => {
    api('/api/admin/projects?status=ACTIVE').then((items) => {
      const values = Array.isArray(items) ? items : []
      setProjects(values)
      setProjectId((current) => current || String(values[0]?.id || ''))
    }).catch((error) => notify(error.message, 'error'))
  }, [])
  return <><div className="owner-project-switch"><Field label="Проект для планирования"><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Выберите проект</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.planning_timezone}</option>)}</select></Field></div>{projectId ? <PlanningPage key={projectId} user={user} projectId={Number(projectId)} notify={notify} ownerMode onNavigate={onNavigate} /> : <Empty title="Нет активного проекта" text="Создайте или включите проект, чтобы запустить планирование." />}</>
}

function OwnerImports({ notify, onOpenJobs }) {
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  useEffect(() => {
    api('/api/admin/projects?status=ACTIVE').then((items) => {
      const values = Array.isArray(items) ? items : []
      setProjects(values)
      setProjectId((current) => current || String(values[0]?.id || ''))
    }).catch((error) => notify(error.message, 'error'))
  }, [])
  const selected = projects.find((project) => String(project.id) === String(projectId))
  return <><div className="owner-project-switch"><Field label="Проект для импорта"><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Выберите проект</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.planning_timezone}</option>)}</select></Field></div>{projectId ? <JobImports key={projectId} projectId={Number(projectId)} projectLabel={selected?.name} notify={notify} onOpenJobs={(batchId) => onOpenJobs(Number(projectId), batchId)} /> : <Empty title="Нет активного проекта" text="Создайте или включите проект, чтобы импортировать заявки." />}</>
}

function OwnerJobs({ notify, importSelection, onClearImportFilter }) {
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [jobs, setJobs] = useState([])
  const [workTypes, setWorkTypes] = useState([])
  const [editor, setEditor] = useState(false)
  useEffect(() => {
    api('/api/admin/projects?status=ACTIVE').then((items) => {
      const values = Array.isArray(items) ? items : []
      setProjects(values)
      setProjectId((current) => String(importSelection?.projectId || current || values[0]?.id || ''))
    }).catch((error) => notify(error.message, 'error'))
  }, [])
  useEffect(() => {
    if (importSelection?.projectId) setProjectId(String(importSelection.projectId))
  }, [importSelection?.projectId])
  const load = () => projectId && api(`/api/projects/${projectId}/jobs${qs({ import_batch_id: importSelection?.batchId })}`).then((items) => setJobs(Array.isArray(items) ? items : [])).catch((error) => notify(error.message, 'error'))
  useEffect(() => {
    if (!projectId) { setJobs([]); setWorkTypes([]); return }
    void load()
    api(`/api/projects/${projectId}/work-types`).then((items) => setWorkTypes(Array.isArray(items) ? items : [])).catch((error) => notify(error.message, 'error'))
  }, [projectId, importSelection?.batchId])
  async function cancel(job) {
    const warning = job.status === 'IN_PROGRESS' ? '\n\nРабота уже выполняется: оставшийся маршрут инженера будет пересчитан.' : ''
    if (!window.confirm(`Отменить заявку #${job.id}?${warning}`)) return
    try {
      const result = await api(`/api/projects/${projectId}/jobs/${job.id}/cancel`, { method: 'POST' })
      if (result?.planning_event_id) window.sessionStorage.setItem('route-app:last-planning-event', String(result.planning_event_id))
      notify(result?.planning_event_id ? `Заявка отменена. Перепланирование #${result.planning_event_id} запущено` : 'Заявка уже была отменена')
      load()
    } catch (error) { notify(error.message, 'error') }
  }
  return <><PageHeader eyebrow="Операционная работа" title="Заявки проектов" subtitle="Владелец может создавать и отменять заявки; план перестроится автоматически." actions={projectId ? <Button icon="plus" onClick={() => setEditor(true)}>Новая заявка</Button> : null} />{importSelection?.batchId && <div className="planning-impact-warning">Показаны заявки из пакета импорта #{importSelection.batchId}. <button className="text-action" onClick={onClearImportFilter}>Показать все заявки</button></div>}<div className="owner-project-switch"><Field label="Проект"><select value={projectId} onChange={(event) => { setProjectId(event.target.value); onClearImportFilter() }}><option value="">Выберите проект</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field></div>{projectId ? <div className="table-card">{jobs.length ? <table><thead><tr><th>Заявка</th><th>Адрес</th><th>Приоритет</th><th>Срок</th><th>Статус</th><th /></tr></thead><tbody>{jobs.map((job) => <tr key={job.id}><td><b>#{job.id}</b></td><td className="address-cell">{job.address}</td><td><Badge status={job.priority}>{formatPriority(job.priority)}</Badge></td><td>{formatDate(job.sla_date)}</td><td><Badge status={job.status}>{job.status}</Badge></td><td>{['NEW', 'IN_PROGRESS'].includes(job.status) && <Button kind="danger" onClick={() => cancel(job)}>Отменить</Button>}</td></tr>)}</tbody></table> : <Empty title="Заявок нет" text="В выбранном проекте пока нет заявок." action={<Button icon="plus" onClick={() => setEditor(true)}>Создать заявку</Button>} />}</div> : <Empty title="Нет активного проекта" text="Создайте или включите проект." />}{editor && <JobForm apiBase={`/api/projects/${projectId}`} workTypes={workTypes} notify={notify} onSaved={load} onClose={() => setEditor(false)} />}</>
}

function OwnerEngineers({ notify }) {
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [engineers, setEngineers] = useState([])
  const [schedule, setSchedule] = useState(null)
  useEffect(() => {
    api('/api/admin/projects?status=ACTIVE').then((items) => {
      const values = Array.isArray(items) ? items : []
      setProjects(values)
      setProjectId((current) => current || String(values[0]?.id || ''))
    }).catch((error) => notify(error.message, 'error'))
  }, [])
  useEffect(() => {
    if (!projectId) { setEngineers([]); return }
    api(`/api/projects/${projectId}/engineers`).then((items) => setEngineers(Array.isArray(items) ? items : [])).catch((error) => notify(error.message, 'error'))
  }, [projectId])
  return <><PageHeader eyebrow="Операционная работа" title="Доступность инженеров" subtitle="Владелец может изменить смены; значимые изменения автоматически пересчитают план." /><div className="owner-project-switch"><Field label="Проект"><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Выберите проект</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field></div>{projectId ? <div className="engineer-grid">{engineers.map((item) => <article className="engineer-card" key={item.id}><header><span className="avatar large">{String(item.name || '?')[0].toUpperCase()}</span><Badge status={item.active ? 'ACTIVE' : 'BLOCKED'}>{item.active ? 'Активен' : 'Неактивен'}</Badge></header><h3>{item.name || `Инженер #${item.id}`}</h3><p><Icon name="map" /> {item.start_address || 'Адрес не указан'}</p><div className="card-actions"><button onClick={() => setSchedule(item)}>Изменить график</button></div></article>)}{!engineers.length && <Empty title="Инженеров нет" text="В выбранном проекте пока нет инженеров." />}</div> : <Empty title="Нет активного проекта" text="Создайте или включите проект." />}{schedule && <ScheduleEditor engineer={schedule} apiBase={`/api/projects/${projectId}`} notify={notify} onClose={() => setSchedule(null)} />}</>
}

export default function OwnerApp({ user, onLogout }) {
  const [section, setSection] = useState('projects'), [toast, setToast] = useState(null), [importSelection, setImportSelection] = useState(null)
  const notify = (message, type = 'info') => setToast({ message, type, key: Date.now() })
  return <Shell user={user} roleLabel="Владелец" contextLabel="Управление продуктом" contextValue="Все проекты" nav={nav} active={section} onNavigate={setSection} onLogout={onLogout}><div className="page-wrap">{section === 'projects' && <Projects notify={notify} />}{section === 'owners' && <Owners notify={notify} />}{section === 'jobs' && <OwnerJobs notify={notify} importSelection={importSelection} onClearImportFilter={() => setImportSelection(null)} />}{section === 'imports' && <OwnerImports notify={notify} onOpenJobs={(projectId, batchId) => { setImportSelection({ projectId, batchId }); setSection('jobs') }} />}{section === 'engineers' && <OwnerEngineers notify={notify} />}{section === 'planning' && <OwnerPlanning user={user} notify={notify} onNavigate={setSection} />}</div><Toast toast={toast} onClose={() => setToast(null)} /></Shell>
}
