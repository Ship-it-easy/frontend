import React, { useEffect, useRef, useState } from 'react'
import { api } from './api.js'
import { Badge, Button, Empty, Icon, Modal, PageHeader, Shell, Toast, formatDate, formatDateTime, formatTime } from './ui.jsx'

const nav = [
  { id: 'today', label: 'Сегодня', icon: 'today' },
  { id: 'future', label: 'Будущие', icon: 'future' },
  { id: 'history', label: 'История', icon: 'history' },
]
const labels = { NEW: 'Новая', IN_PROGRESS: 'В работе', COMPLETED: 'Выполнена', CANCELLED: 'Отменена' }
const changeLabels = { ADDED: 'Добавлена', REMOVED: 'Снята с маршрута', CHANGED: 'Изменена' }
const changeReasonLabels = { JOB_CANCELLED: 'Заявка отменена', ENGINEER_UNAVAILABLE: 'Инженер недоступен', CANCELLED_EN_ROUTE_ASSUMPTION: 'Маршрут продолжен от адреса отменённой заявки', NEW_ASSIGNMENT: 'Новое назначение', REPLANNED: 'Маршрут пересчитан', DISPLACED_TO_FUTURE: 'Перенесена на будущую дату', NOT_ASSIGNED_IN_NEW_HORIZON: 'Снята с опубликованного маршрута' }

function assignmentSummary(value) {
  if (!value) return 'нет в маршруте'
  return `${formatDate(value.planning_date)}, №${value.sequence}, ${formatTime(value.planned_start)}–${formatTime(value.planned_finish)}`
}

function changedFields(before, after) {
  if (!before || !after) return []
  return [
    ['planning_date', 'Дата', formatDate],
    ['sequence', 'Порядок', (value) => `№${value}`],
    ['planned_start', 'Начало', formatTime],
    ['planned_finish', 'Окончание', formatTime],
  ].filter(([key]) => before[key] !== after[key]).map(([key, label, format]) => `${label}: ${format(before[key])} → ${format(after[key])}`)
}

function RouteChanges({ version, changes }) {
  if (!changes.length) return null
  return <section className="engineer-route-changes"><header><div><small>Обновление маршрута</small><h2>Что изменилось в версии {version}</h2></div><Badge status="PUBLISHED">Опубликовано</Badge></header><div>{changes.map((item) => { const fields = changedFields(item.old_assignment, item.new_assignment); return <article key={item.id} className={`route-change-${String(item.change_type).toLowerCase()}`}><div><b>Заявка #{item.job_id} · {item.work_type_name}</b><small>{item.address} · {changeReasonLabels[item.reason] || item.reason}</small></div><strong>{changeLabels[item.change_type] || item.change_type}</strong>{item.change_type === 'ADDED' && <p>{assignmentSummary(item.new_assignment)}</p>}{item.change_type === 'REMOVED' && <p>{assignmentSummary(item.old_assignment)}</p>}{item.change_type === 'CHANGED' && <ul>{fields.map((field) => <li key={field}>{field}</li>)}</ul>}</article> })}</div></section>
}

function Assignment({ item, onOpen }) {
  return <button className="assignment-card" onClick={() => onOpen(item)}><div className="assignment-sequence">{item.sequence}</div><div className="assignment-main"><header><b>{item.work_type_name}</b><span className="tag-row">{item.priority_type === 'EMERGENCY' && <Badge status="EMERGENCY">Аварийная</Badge>}<Badge status={item.job_status}>{labels[item.job_status]}</Badge></span></header><p><Icon name="map" />{item.address}</p><footer><span>{formatTime(item.planned_start)}–{formatTime(item.planned_finish)}</span><span>{item.service_duration_min} мин</span><span>{formatDate(item.planning_date)}</span></footer></div><Icon name="chevron" /></button>
}

function AssignmentDetails({ item, onClose, onChanged, notify }) {
  async function action(name, message) {
    try { await api(`/api/engineer/assignments/${item.id}/${name}`, { method: 'POST' }); notify(message); onChanged(); onClose() }
    catch (error) { notify(error.message, 'error') }
  }
  return <Modal title={item.work_type_name} subtitle={`Заявка #${item.job_id}`} onClose={onClose}><div className="engineer-detail">{item.priority_type === 'EMERGENCY' && <Badge status="EMERGENCY">Аварийная заявка</Badge>}<div className="route-time"><span>{formatTime(item.planned_start)}</span><i /><span>{formatTime(item.planned_finish)}</span></div><div className="address-block"><Icon name="map" /><div><small>Адрес</small><b>{item.address}</b></div></div><div className="detail-grid"><div><small>Дата</small><b>{formatDate(item.planning_date)}</b></div><div><small>Длительность</small><b>{item.service_duration_min} мин</b></div><div><small>Окно клиента</small><b>{item.time_window_start ? `${formatTime(item.time_window_start)}–${formatTime(item.time_window_end)}` : 'В течение смены'}</b></div><div><small>Крайний срок</small><b>{formatDate(item.sla_date)}</b></div></div></div><div className="engineer-actions">{item.job_status === 'NEW' && <Button className="wide" onClick={() => action('start', 'Работа начата')}>Начать работу</Button>}{item.job_status === 'IN_PROGRESS' && <><Button className="wide" onClick={() => action('complete', 'Работа завершена')}>Завершить</Button><Button className="wide" kind="secondary" onClick={() => action('return-to-new', 'Заявка возвращена в новые')}>Вернуть в новые</Button></>}</div></Modal>
}

export default function EngineerApp({ user, onLogout }) {
  const [scope, setScope] = useState('today'), [items, setItems] = useState([]), [changes, setChanges] = useState([]), [selected, setSelected] = useState(null), [loading, setLoading] = useState(true), [toast, setToast] = useState(null), [planVersion, setPlanVersion] = useState(null)
  const previousVersion = useRef(null)
  const notify = (message, type = 'info') => setToast({ message, type, key: Date.now() })
  const load = (quiet = false) => {
    if (!quiet) setLoading(true)
    api(`/api/engineer/assignments/route-state?scope=${scope}`).then((value) => {
      const nextItems = Array.isArray(value?.assignments) ? value.assignments : []
      const nextChanges = Array.isArray(value?.changes) ? value.changes : []
      const nextVersion = value?.plan_version != null && Number.isFinite(Number(value.plan_version)) ? Number(value.plan_version) : null
      if (nextVersion !== null && previousVersion.current !== null && nextVersion !== previousVersion.current) notify(`Опубликована новая версия плана #${nextVersion}. Маршрут обновлён.`)
      if (nextVersion !== null) previousVersion.current = nextVersion
      setPlanVersion(nextVersion); setItems(nextItems); setChanges(nextChanges)
    }).catch((error) => { if (!quiet) notify(error.message, 'error') }).finally(() => { if (!quiet) setLoading(false) })
  }
  useEffect(() => {
    load()
    const timer = window.setInterval(() => load(true), 15000)
    return () => window.clearInterval(timer)
  }, [scope])
  const title = scope === 'today' ? 'Заявки на сегодня' : scope === 'future' ? 'Будущие заявки' : 'История работ'
  const subtitle = scope === 'today' ? 'Выполняйте работы в указанной последовательности.' : scope === 'future' ? 'Опубликованные назначения на следующие дни.' : 'Завершённые и отменённые работы.'
  return <Shell user={user} roleLabel="Инженер" contextLabel="Личный кабинет" contextValue={`Инженер #${user.engineer_id}`} nav={nav} active={scope} onNavigate={setScope} onLogout={onLogout}>
    <div className="page-wrap engineer-page">
      <PageHeader eyebrow="Мой маршрут" title={title} subtitle={subtitle} actions={<>{planVersion !== null && <span className="plan-version-chip">Версия плана {planVersion}</span>}<Button kind="secondary" icon="refresh" onClick={() => load()}>Обновить</Button></>} />
      <RouteChanges version={planVersion} changes={changes} />
      {scope === 'today' && items.length > 0 && <div className="day-summary"><div><small>Заявок</small><b>{items.length}</b></div><div><small>Первая работа</small><b>{formatTime(items[0].planned_start)}</b></div><div><small>Завершение</small><b>{formatTime(items[items.length - 1].planned_finish)}</b></div></div>}
      <section className="assignments">{loading ? <div className="skeleton-list"><i /><i /><i /></div> : items.length ? items.map((item) => <Assignment key={item.id} item={item} onOpen={setSelected} />) : <Empty title="Назначений нет" text={scope === 'today' ? 'В актуальной версии плана на сегодня работ нет.' : 'В этом разделе пока пусто.'} />}</section>
      {selected && <AssignmentDetails item={selected} onClose={() => setSelected(null)} onChanged={() => load()} notify={notify} />}
    </div>
    <Toast toast={toast} onClose={() => setToast(null)} />
  </Shell>
}
