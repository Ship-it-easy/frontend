import React, { useEffect, useState } from 'react'
import { api } from './api.js'
import { Badge, Button, Empty, Icon, Modal, PageHeader, Shell, Toast, formatDate, formatDateTime, formatTime } from './ui.jsx'

const nav = [
  { id: 'today', label: 'Сегодня', icon: 'today' },
  { id: 'future', label: 'Будущие', icon: 'future' },
  { id: 'history', label: 'История', icon: 'history' },
]
const labels = { NEW: 'Новая', IN_PROGRESS: 'В работе', COMPLETED: 'Выполнена', CANCELLED: 'Отменена' }

function Assignment({ item, onOpen }) {
  return <button className="assignment-card" onClick={() => onOpen(item)}><div className="assignment-sequence">{item.sequence}</div><div className="assignment-main"><header><b>{item.work_type_name}</b><Badge status={item.job_status}>{labels[item.job_status]}</Badge></header><p><Icon name="map" />{item.address}</p><footer><span>{formatTime(item.planned_start)}–{formatTime(item.planned_finish)}</span><span>{item.service_duration_min} мин</span><span>{formatDate(item.planning_date)}</span></footer></div><Icon name="chevron" /></button>
}

function AssignmentDetails({ item, onClose, onChanged, notify }) {
  async function action(name, message) {
    try { await api(`/api/engineer/assignments/${item.id}/${name}`, { method: 'POST' }); notify(message); onChanged(); onClose() }
    catch (error) { notify(error.message, 'error') }
  }
  return <Modal title={item.work_type_name} subtitle={`Заявка #${item.job_id}`} onClose={onClose}><div className="engineer-detail"><div className="route-time"><span>{formatTime(item.planned_start)}</span><i /><span>{formatTime(item.planned_finish)}</span></div><div className="address-block"><Icon name="map" /><div><small>Адрес</small><b>{item.address}</b></div></div><div className="detail-grid"><div><small>Дата</small><b>{formatDate(item.planning_date)}</b></div><div><small>Длительность</small><b>{item.service_duration_min} мин</b></div><div><small>Окно клиента</small><b>{item.time_window_start ? `${formatTime(item.time_window_start)}–${formatTime(item.time_window_end)}` : 'В течение смены'}</b></div><div><small>Крайний срок</small><b>{formatDate(item.sla_date)}</b></div></div></div><div className="engineer-actions">{item.job_status === 'NEW' && <Button className="wide" onClick={() => action('start', 'Работа начата')}>Начать работу</Button>}{item.job_status === 'IN_PROGRESS' && <><Button className="wide" onClick={() => action('complete', 'Работа завершена')}>Завершить</Button><Button className="wide" kind="secondary" onClick={() => action('return-to-new', 'Заявка возвращена в новые')}>Вернуть в новые</Button></>}</div></Modal>
}

export default function EngineerApp({ user, onLogout }) {
  const [scope, setScope] = useState('today'), [items, setItems] = useState([]), [selected, setSelected] = useState(null), [loading, setLoading] = useState(true), [toast, setToast] = useState(null)
  const notify = (message, type = 'info') => setToast({ message, type, key: Date.now() })
  const load = () => { setLoading(true); api(`/api/engineer/assignments?scope=${scope}`).then((value) => setItems(Array.isArray(value) ? value : [])).catch((error) => notify(error.message, 'error')).finally(() => setLoading(false)) }
  useEffect(() => { load() }, [scope])
  const title = scope === 'today' ? 'Заявки на сегодня' : scope === 'future' ? 'Будущие заявки' : 'История работ'
  const subtitle = scope === 'today' ? 'Выполняйте работы в указанной последовательности.' : scope === 'future' ? 'Опубликованные назначения на следующие дни.' : 'Завершённые и отменённые работы.'
  return <Shell user={user} roleLabel="Инженер" contextLabel="Личный кабинет" contextValue={`Инженер #${user.engineer_id}`} nav={nav} active={scope} onNavigate={setScope} onLogout={onLogout}><div className="page-wrap engineer-page"><PageHeader eyebrow="Мой маршрут" title={title} subtitle={subtitle} actions={<Button kind="secondary" icon="refresh" onClick={load}>Обновить</Button>} />{scope === 'today' && items.length > 0 && <div className="day-summary"><div><small>Заявок</small><b>{items.length}</b></div><div><small>Первая работа</small><b>{formatTime(items[0].planned_start)}</b></div><div><small>Завершение</small><b>{formatTime(items[items.length - 1].planned_finish)}</b></div></div>}<section className="assignments">{loading ? <div className="skeleton-list"><i /><i /><i /></div> : items.length ? items.map((item) => <Assignment key={item.id} item={item} onOpen={setSelected} />) : <Empty title="Назначений нет" text={scope === 'today' ? 'Диспетчер ещё не опубликовал план или на сегодня нет работ.' : 'В этом разделе пока пусто.'} />}</section>{selected && <AssignmentDetails item={selected} onClose={() => setSelected(null)} onChanged={load} notify={notify} />}</div><Toast toast={toast} onClose={() => setToast(null)} /></Shell>
}
