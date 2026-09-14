import React, { useEffect, useMemo, useState } from 'react'
import { api, qs } from './api.js'
import RoutesMap from './RoutesMap.jsx'
import { AddressField, Badge, Button, CheckGroup, Empty, Field, Icon, Modal, PageHeader, Shell, StatCard, Toast, formatDate, formatDateTime, formatTime, today } from './ui.jsx'

const nav = [
  { id: 'jobs', label: 'Заявки', icon: 'jobs' },
  { id: 'planning', label: 'Планирование', icon: 'planning' },
  { id: 'engineers', label: 'Инженеры', icon: 'engineers' },
  { id: 'catalogs', label: 'Справочники', icon: 'catalogs' },
]
const statusLabels = { NEW: 'Новая', IN_PROGRESS: 'В работе', COMPLETED: 'Выполнена', CANCELLED: 'Отменена' }
const reasonLabels = { NO_ELIGIBLE_ENGINEER: 'Нет подходящего инженера', NO_SKILL: 'Нет квалификации', NO_EQUIPMENT: 'Нет оборудования', NO_TRANSPORT: 'Нет транспорта', TIME_WINDOW: 'Не помещается во временное окно', SHIFT: 'Не помещается в смену', DROPPED_BY_OPTIMIZER: 'Не выбрана оптимизатором', INVALID_INPUT: 'Некорректные данные заявки', GEOCODING_FAILED: 'Адрес не удалось определить', MISSING_SERVICE_DURATION: 'Не задана длительность работы', NO_COMPATIBLE_ENGINEER_IN_HORIZON: 'Нет совместимого инженера в горизонте', NO_SHIFT_IN_HORIZON: 'Нет смен в горизонте', DURATION_EXCEEDS_ALL_SHIFTS: 'Работа не помещается ни в одну смену', EQUIPMENT_UNAVAILABLE_IN_HORIZON: 'Оборудование недоступно', INVALID_TIME_WINDOW_FOR_HORIZON: 'Окно недоступно во всём горизонте', NO_AVAILABLE_ENGINEER_TODAY: 'Нет доступного инженера в этот день', NOT_SELECTED_BY_OPTIMIZER: 'Не выбрана оптимизатором', DATASET_LIMIT: 'Отложена из-за лимита набора', TRAVEL_DATA_NOT_READY: 'Дорожные данные не готовы', DAILY_TIME_WINDOW_CONFLICT: 'Конфликт окна в этот день', DAILY_EQUIPMENT_CAPACITY: 'Оборудование занято в этот день', NOT_ASSIGNED_WITHIN_HORIZON: 'Не назначена в пределах горизонта' }
const completionLabels = { ALL_ELIGIBLE_ASSIGNED: 'Все подходящие заявки назначены', NO_ELIGIBLE_JOBS: 'Нет подходящих заявок', NO_FUTURE_OPPORTUNITIES: 'В горизонте больше нет возможностей', HORIZON_LIMIT: 'Достигнут горизонт 30 дней', STOPPED_BY_USER: 'Расчёт остановлен пользователем', DAY_RUN_FAILED: 'Ошибка дневного расчёта', TOTAL_TIME_LIMIT: 'Достигнут общий лимит времени', SYSTEM_ERROR: 'Системная ошибка' }
const activeBatchStatuses = new Set(['CREATED', 'PREPARING', 'RUNNING', 'STOP_REQUESTED'])
const safeArray = (value) => Array.isArray(value) ? value : []

function JobForm({ item, workTypes, onClose, onSaved, notify }) {
  const [form, setForm] = useState({ address: item?.address || '', latitude: item?.latitude ?? null, longitude: item?.longitude ?? null, sla_date: item?.sla_date || today(), time_window_start: formatTime(item?.time_window_start) === '—' ? '' : formatTime(item?.time_window_start), time_window_end: formatTime(item?.time_window_end) === '—' ? '' : formatTime(item?.time_window_end), work_type_id: item?.work_type_id || workTypes[0]?.id || '' })
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault(); setBusy(true)
    const payload = { ...form, work_type_id: Number(form.work_type_id), time_window_start: form.time_window_start || null, time_window_end: form.time_window_end || null }
    try { await api(item ? `/api/project/jobs/${item.id}` : '/api/project/jobs', { method: item ? 'PATCH' : 'POST', body: JSON.stringify(payload) }); notify(item ? 'Заявка обновлена' : 'Заявка создана'); onSaved(); onClose() }
    catch (error) { notify(error.message, 'error') } finally { setBusy(false) }
  }
  return <Modal wide title={item ? `Заявка #${item.id}` : 'Новая заявка'} subtitle="Адрес, срок, доступное время и тип работы" onClose={onClose}><form className="stack-form" onSubmit={submit}>
    <AddressField value={form.address} onChange={(address) => setForm({ ...form, address, latitude: null, longitude: null })} onSelect={(choice) => setForm({ ...form, address: choice.display_name, latitude: choice.latitude, longitude: choice.longitude })} />
    <div className="form-grid"><Field label="Крайний срок"><input type="date" required value={form.sla_date} onChange={(event) => setForm({ ...form, sla_date: event.target.value })} /></Field><Field label="Тип работ"><select required value={form.work_type_id} onChange={(event) => setForm({ ...form, work_type_id: event.target.value })}><option value="">Выберите тип</option>{workTypes.filter((type) => type.active || type.id === item?.work_type_id).map((type) => <option key={type.id} value={type.id}>{type.name} · {type.default_service_duration_min} мин</option>)}</select></Field><Field label="Окно с"><input type="time" value={form.time_window_start} onChange={(event) => setForm({ ...form, time_window_start: event.target.value })} /></Field><Field label="Окно до"><input type="time" value={form.time_window_end} onChange={(event) => setForm({ ...form, time_window_end: event.target.value })} /></Field></div>
    <div className="form-note">Длительность подставится из выбранного типа работ. Если время не указано, заявка доступна в течение смены.</div><div className="form-actions"><Button type="button" kind="ghost" onClick={onClose}>Отмена</Button><Button disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</Button></div>
  </form></Modal>
}

function JobDetails({ job, workTypes, onClose, onEdit, onChanged, notify }) {
  const type = workTypes.find((item) => item.id === job.work_type_id)
  async function cancel() {
    if (!window.confirm(`Отменить заявку #${job.id}?`)) return
    try { await api(`/api/project/jobs/${job.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'CANCELLED', reason: 'Отменена диспетчером' }) }); notify('Заявка отменена'); onChanged(); onClose() }
    catch (error) { notify(error.message, 'error') }
  }
  return <Modal wide title={`Заявка #${job.id}`} subtitle={job.address} onClose={onClose}><div className="detail-grid"><div><small>Статус</small><Badge status={job.status}>{statusLabels[job.status]}</Badge></div><div><small>Тип работ</small><b>{type?.name || `#${job.work_type_id}`}</b></div><div><small>Крайний срок</small><b>{formatDate(job.sla_date)}</b></div><div><small>Временное окно</small><b>{job.time_window_start ? `${formatTime(job.time_window_start)}–${formatTime(job.time_window_end)}` : 'В течение смены'}</b></div><div><small>Длительность</small><b>{job.service_duration_min || type?.default_service_duration_min || '—'} мин</b></div><div><small>Координаты</small><b>{job.latitude ? `${Number(job.latitude).toFixed(5)}, ${Number(job.longitude).toFixed(5)}` : 'Определятся при расчёте'}</b></div><div><small>Создана</small><b>{formatDateTime(job.created_at)}</b></div><div><small>Назначение</small><b>{job.assignment ? `Инженер #${job.assignment.engineer_id}, ${formatDateTime(job.assignment.planned_start)}` : 'Не назначена'}</b></div></div>
    {!!job.status_history?.length && <div className="history"><h3>История статусов</h3>{job.status_history.map((item) => <div key={item.id}><span /><b>{statusLabels[item.to_status] || item.to_status}</b><small>{formatDateTime(item.created_at)}{item.reason ? ` · ${item.reason}` : ''}</small></div>)}</div>}
    <div className="form-actions">{job.status === 'NEW' && <><Button kind="danger" onClick={cancel}>Отменить заявку</Button><Button onClick={onEdit}>Изменить</Button></>}</div></Modal>
}

function JobsPage({ workTypes, notify }) {
  const [data, setData] = useState({ items: [], total: 0 }), [filters, setFilters] = useState({ search: '', status: '', work_type_id: '' }), [editor, setEditor] = useState(false), [selected, setSelected] = useState(null)
  const load = () => api(`/api/project/jobs${qs({ ...filters, limit: 200 })}`).then((value) => setData({ ...(value || {}), items: Array.isArray(value?.items) ? value.items : [], total: Number(value?.total || 0) })).catch((error) => notify(error.message, 'error'))
  useEffect(() => { const timer = setTimeout(load, 180); return () => clearTimeout(timer) }, [filters.search, filters.status, filters.work_type_id])
  const counts = useMemo(() => ['NEW', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((status) => data.items.filter((item) => item.status === status).length), [data])
  return <><PageHeader eyebrow="Операционная работа" title="Заявки" subtitle="Контролируйте сроки, статусы и назначения." actions={<Button icon="plus" onClick={() => setEditor(true)}>Новая заявка</Button>} />
    <div className="stats-grid"><StatCard label="Новые" value={counts[0]} /><StatCard label="В работе" value={counts[1]} tone="amber" /><StatCard label="Выполнены" value={counts[2]} tone="green" /><StatCard label="Отменены" value={counts[3]} tone="gray" /></div>
    <div className="table-card"><div className="filters embedded"><div className="search-field"><Icon name="search" /><input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Адрес" /></div><select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Все статусы</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={filters.work_type_id} onChange={(event) => setFilters({ ...filters, work_type_id: event.target.value })}><option value="">Все типы работ</option>{workTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></div>
      {data.items.length ? <table><thead><tr><th>Создана</th><th>Адрес</th><th>Тип работ</th><th>Крайний срок</th><th>Статус</th><th /></tr></thead><tbody>{data.items.map((item) => <tr key={item.id}><td><b>{formatDate(item.created_at)}</b><small>{new Date(item.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small></td><td className="address-cell">{item.address}</td><td>{workTypes.find((type) => type.id === item.work_type_id)?.name || `#${item.work_type_id}`}</td><td>{formatDate(item.sla_date)}{item.time_window_start && <small>{formatTime(item.time_window_start)}–{formatTime(item.time_window_end)}</small>}</td><td><Badge status={item.status}>{statusLabels[item.status]}</Badge></td><td><button className="text-action" onClick={() => setSelected(item)}>Открыть <Icon name="chevron" /></button></td></tr>)}</tbody></table> : <Empty title="Заявок пока нет" text="Создайте первую заявку — она сразу появится в списке." action={<Button icon="plus" onClick={() => setEditor(true)}>Создать заявку</Button>} />}</div>
    {editor && <JobForm item={typeof editor === 'object' ? editor : null} workTypes={workTypes} notify={notify} onSaved={load} onClose={() => setEditor(false)} />}{selected && <JobDetails job={selected} workTypes={workTypes} notify={notify} onClose={() => setSelected(null)} onChanged={load} onEdit={() => { setEditor(selected); setSelected(null) }} />}
  </>
}

function EngineerForm({ item, qualifications, onClose, onSaved, notify }) {
  const [form, setForm] = useState({ name: item?.name || '', active: item?.active ?? true, transport_type: item?.transport_type || 'NONE', start_address: item?.start_address || '', start_latitude: item?.start_latitude ?? null, start_longitude: item?.start_longitude ?? null, qualification_ids: item?.qualification_ids || [] })
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault(); setBusy(true)
    const engineer = { name: form.name, active: form.active, transport_type: form.transport_type, start_address: form.start_address, start_latitude: form.start_latitude, start_longitude: form.start_longitude, qualification_ids: form.qualification_ids }
    try {
      await api(item ? `/api/project/engineers/${item.id}` : '/api/project/engineers', { method: item ? 'PATCH' : 'POST', body: JSON.stringify(engineer) })
      notify(item ? 'Инженер обновлён' : 'Инженер создан'); onSaved(); onClose()
    } catch (error) { notify(error.message, 'error') } finally { setBusy(false) }
  }
  return <Modal wide title={item ? item.name : 'Новый инженер'} subtitle="Профиль, транспорт и квалификации" onClose={onClose}><form className="stack-form" onSubmit={submit}><Field label="Имя"><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field><label className="switch-row"><span><b>Участвует в расчётах</b><small>Неактивному инженеру новые заявки не назначаются</small></span><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /></label><Field label="Транспорт"><select value={form.transport_type} onChange={(event) => setForm({ ...form, transport_type: event.target.value })}><option value="NONE">Без автомобиля · пешком</option><option value="CAR">Автомобиль</option></select></Field><AddressField label="Стартовый адрес" value={form.start_address} onChange={(start_address) => setForm({ ...form, start_address, start_latitude: null, start_longitude: null })} onSelect={(choice) => setForm({ ...form, start_address: choice.display_name, start_latitude: choice.latitude, start_longitude: choice.longitude })} /><div><div className="section-label">Квалификации</div><CheckGroup items={qualifications.filter((item) => item.active)} value={form.qualification_ids} onChange={(qualification_ids) => setForm({ ...form, qualification_ids })} /></div><div className="form-actions"><Button type="button" kind="ghost" onClick={onClose}>Отмена</Button><Button disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</Button></div></form></Modal>
}

const weekdayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const localDate = (value) => { const [year, month, day] = String(value).split('-').map(Number); return new Date(year, month - 1, day) }
const monthBounds = (date) => ({ from: dateKey(new Date(date.getFullYear(), date.getMonth(), 1)), to: dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0)) })

function ScheduleEditor({ engineer, onClose, notify }) {
  const initialMonth = localDate(today())
  const [month, setMonth] = useState(new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1))
  const [schedule, setSchedule] = useState({})
  const [selected, setSelected] = useState(new Set())
  const [dirty, setDirty] = useState(new Set())
  const [shift, setShift] = useState({ start: '08:00', end: '19:00' })
  const initialBounds = monthBounds(initialMonth)
  const [bulk, setBulk] = useState({ from: initialBounds.from, to: initialBounds.to, weekdays: [1, 2, 3, 4, 5], start: '08:00', end: '19:00' })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    api(`/api/project/engineers/${engineer.id}`).then((value) => {
      if (!active) return
      const entries = {}
      safeArray(value?.schedule).forEach((item) => { entries[item.work_date] = { start: formatTime(item.shift_start), end: formatTime(item.shift_end) } })
      setSchedule(entries)
    }).catch((error) => notify(error.message, 'error')).finally(() => active && setLoading(false))
    return () => { active = false }
  }, [engineer.id])

  const calendarDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const offset = (first.getDay() + 6) % 7
    const cells = []
    for (let index = 0; index < 42; index += 1) {
      const date = new Date(month.getFullYear(), month.getMonth(), index - offset + 1)
      cells.push({ key: dateKey(date), number: date.getDate(), current: date.getMonth() === month.getMonth() })
    }
    return cells
  }, [month])

  function validShift(start, end) {
    if (!start || !end || start >= end) { notify('Начало смены должно быть раньше окончания. Смены через полночь не поддерживаются.', 'error'); return false }
    return true
  }
  function markDates(dates, value) {
    setSchedule((current) => { const next = { ...current }; dates.forEach((key) => { if (value) next[key] = value; else delete next[key] }); return next })
    setDirty((current) => new Set([...current, ...dates]))
  }
  function toggleDate(key) {
    setSelected((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })
  }
  function applySelected() {
    const dates = [...selected]
    if (!dates.length) { notify('Выберите один или несколько дней в календаре', 'error'); return }
    if (new Set([...dirty, ...dates]).size > 366) { notify('За одно сохранение можно изменить не более 366 дат', 'error'); return }
    if (!validShift(shift.start, shift.end)) return
    markDates(dates, { start: shift.start, end: shift.end })
  }
  function makeSelectedDaysOff() {
    const dates = [...selected]
    if (!dates.length) { notify('Выберите один или несколько дней в календаре', 'error'); return }
    if (new Set([...dirty, ...dates]).size > 366) { notify('За одно сохранение можно изменить не более 366 дат', 'error'); return }
    markDates(dates, null)
  }
  function applyBulk() {
    if (!bulk.from || !bulk.to || bulk.from > bulk.to) { notify('Укажите корректный период', 'error'); return }
    if (!bulk.weekdays.length) { notify('Выберите хотя бы один день недели', 'error'); return }
    if (!validShift(bulk.start, bulk.end)) return
    const dates = []
    const cursor = localDate(bulk.from), last = localDate(bulk.to)
    while (cursor <= last) {
      const weekday = cursor.getDay() || 7
      if (bulk.weekdays.includes(weekday)) dates.push(dateKey(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
    if (new Set([...dirty, ...dates]).size > 366) { notify('За одно сохранение можно изменить не более 366 дат', 'error'); return }
    markDates(dates, { start: bulk.start, end: bulk.end })
    setMonth(new Date(localDate(bulk.from).getFullYear(), localDate(bulk.from).getMonth(), 1))
    notify(`Заполнено рабочих дней: ${dates.length}`)
  }
  async function save() {
    if (!dirty.size) return
    setBusy(true)
    const entries = [...dirty].sort().map((work_date) => schedule[work_date]
      ? { work_date, working: true, shift_start: schedule[work_date].start, shift_end: schedule[work_date].end }
      : { work_date, working: false, shift_start: null, shift_end: null })
    try {
      await api(`/api/project/engineers/${engineer.id}/schedule`, { method: 'PUT', body: JSON.stringify({ entries }) })
      notify('График инженера сохранён'); onClose()
    } catch (error) { notify(error.message, 'error') } finally { setBusy(false) }
  }
  function close() {
    if (dirty.size && !window.confirm('Закрыть редактор без сохранения изменений?')) return
    onClose()
  }

  return <Modal wide title={`График · ${engineer.name}`} subtitle="Одна непрерывная смена на дату. Изменения учитываются при следующем расчёте." onClose={close}>
    {loading ? <div className="schedule-loading">Загружаем график…</div> : <div className="schedule-editor">
      <section className="schedule-bulk"><h3>Массовое заполнение</h3><div className="schedule-bulk-fields"><Field label="Период с"><input type="date" value={bulk.from} onChange={(event) => setBulk({ ...bulk, from: event.target.value })} /></Field><Field label="по"><input type="date" value={bulk.to} onChange={(event) => setBulk({ ...bulk, to: event.target.value })} /></Field><Field label="Начало"><input type="time" value={bulk.start} onChange={(event) => setBulk({ ...bulk, start: event.target.value })} /></Field><Field label="Окончание"><input type="time" value={bulk.end} onChange={(event) => setBulk({ ...bulk, end: event.target.value })} /></Field></div><div className="weekday-picker">{weekdayNames.map((name, index) => { const value = index + 1; return <button type="button" className={bulk.weekdays.includes(value) ? 'active' : ''} key={name} onClick={() => setBulk({ ...bulk, weekdays: bulk.weekdays.includes(value) ? bulk.weekdays.filter((day) => day !== value) : [...bulk.weekdays, value] })}>{name}</button> })}</div><Button type="button" kind="secondary" onClick={applyBulk}>Применить к периоду</Button></section>
      <section className="schedule-calendar"><header><button type="button" aria-label="Предыдущий месяц" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button><h3>{monthNames[month.getMonth()]} {month.getFullYear()}</h3><button type="button" aria-label="Следующий месяц" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button></header><div className="calendar-grid calendar-weekdays">{weekdayNames.map((name) => <span key={name}>{name}</span>)}</div><div className="calendar-grid">{calendarDays.map((day) => { const entry = schedule[day.key]; return <button type="button" key={day.key} className={`${day.current ? '' : 'outside'} ${entry ? 'working' : 'day-off'} ${selected.has(day.key) ? 'selected' : ''}`} onClick={() => toggleDate(day.key)}><b>{day.number}</b><small>{entry ? `${entry.start}–${entry.end}` : 'Выходной'}</small></button> })}</div><div className="calendar-legend"><span><i className="working" /> Рабочий день</span><span><i className="selected" /> Выбрано</span><span>{selected.size ? `Выбрано дат: ${selected.size}` : 'Нажмите на даты для выбора'}</span></div></section>
      <section className="schedule-selection"><div><h3>Выбранные даты</h3><p>Задайте общее время или сделайте выбранные даты выходными.</p></div><Field label="Начало"><input type="time" value={shift.start} onChange={(event) => setShift({ ...shift, start: event.target.value })} /></Field><Field label="Окончание"><input type="time" value={shift.end} onChange={(event) => setShift({ ...shift, end: event.target.value })} /></Field><Button type="button" kind="secondary" onClick={applySelected}>Задать смену</Button><Button type="button" kind="danger" onClick={makeSelectedDaysOff}>Сделать выходными</Button></section>
      <div className="form-actions"><span className="schedule-unsaved">{dirty.size ? `Изменено дат: ${dirty.size}` : 'Нет несохранённых изменений'}</span><Button type="button" kind="ghost" onClick={close}>Отмена</Button><Button type="button" disabled={busy || !dirty.size} onClick={save}>{busy ? 'Сохраняем…' : 'Сохранить график'}</Button></div>
    </div>}
  </Modal>
}

function EngineerAccess({ engineer, onClose, onChanged, notify }) {
  const [form, setForm] = useState({ login: '', password: '' }), [busy, setBusy] = useState(false)
  async function create(event) { event.preventDefault(); setBusy(true); try { await api(`/api/project/engineers/${engineer.id}/access`, { method: 'POST', body: JSON.stringify(form) }); notify('Доступ инженера создан'); onChanged(); onClose() } catch (error) { notify(error.message, 'error') } finally { setBusy(false) } }
  async function reset(event) { event.preventDefault(); setBusy(true); try { await api(`/api/project/engineers/${engineer.id}/reset-password`, { method: 'POST', body: JSON.stringify({ password: form.password }) }); notify('Пароль изменён'); onClose() } catch (error) { notify(error.message, 'error') } finally { setBusy(false) } }
  async function toggle() { try { await api(`/api/project/engineers/${engineer.id}/access/${engineer.access.status === 'ACTIVE' ? 'block' : 'unblock'}`, { method: 'POST' }); notify('Статус доступа обновлён'); onChanged(); onClose() } catch (error) { notify(error.message, 'error') } }
  return <Modal title={`Доступ · ${engineer.name}`} subtitle={engineer.access ? `Логин: ${engineer.access.login}` : 'Создайте учётную запись кабинета инженера'} onClose={onClose}><form className="stack-form" onSubmit={engineer.access ? reset : create}>{!engineer.access && <Field label="Логин"><input required value={form.login} onChange={(event) => setForm({ ...form, login: event.target.value })} /></Field>}<Field label={engineer.access ? 'Новый пароль' : 'Пароль'}><input type="password" required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></Field><div className="form-actions">{engineer.access && <Button type="button" kind={engineer.access.status === 'ACTIVE' ? 'danger' : 'secondary'} onClick={toggle}>{engineer.access.status === 'ACTIVE' ? 'Заблокировать' : 'Разблокировать'}</Button>}<Button disabled={busy}>{engineer.access ? 'Сменить пароль' : 'Создать доступ'}</Button></div></form></Modal>
}

function EngineersPage({ qualifications, notify }) {
  const [items, setItems] = useState([]), [search, setSearch] = useState(''), [editor, setEditor] = useState(false), [access, setAccess] = useState(null), [schedule, setSchedule] = useState(null)
  const load = () => api('/api/project/engineers').then((value) => setItems(Array.isArray(value) ? value : [])).catch((error) => notify(error.message, 'error'))
  useEffect(() => { void load() }, [])
  const visible = items.filter((item) => String(item.name || '').toLowerCase().includes(search.toLowerCase()))
  return <><PageHeader eyebrow="Команда проекта" title="Инженеры" subtitle="Квалификации, транспорт, графики и доступ в кабинет." actions={<Button icon="plus" onClick={() => setEditor(true)}>Новый инженер</Button>} /><div className="filters"><div className="search-field grow"><Icon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Имя инженера" /></div></div><div className="engineer-grid">{visible.map((item) => <article className="engineer-card" key={item.id}><header><span className="avatar large">{String(item.name || '?')[0].toUpperCase()}</span><Badge status={item.active ? 'ACTIVE' : 'BLOCKED'}>{item.active ? 'Активен' : 'Неактивен'}</Badge></header><h3>{item.name || `Инженер #${item.id}`}</h3><div className="tag-row">{(Array.isArray(item.qualification_ids) ? item.qualification_ids : []).map((id) => <span key={id}>{qualifications.find((q) => q.id === id)?.name || `Навык #${id}`}</span>)}</div><p><Icon name="map" /> {item.start_address || 'Адрес не указан'}</p><footer><span>{item.transport_type === 'CAR' ? '◆ Автомобиль' : '♙ Пешком'}</span><span>{item.access ? `● ${item.access.login}` : '○ Нет доступа'}</span></footer><div className="card-actions"><button onClick={() => setSchedule(item)}>График</button><button onClick={() => setEditor(item)}>Изменить</button><button onClick={() => setAccess(item)}>Доступ</button></div></article>)}{!visible.length && <Empty title="Инженеры не найдены" text="Создайте инженера или измените поисковый запрос." />}</div>{editor && <EngineerForm item={typeof editor === 'object' ? editor : null} qualifications={qualifications} notify={notify} onSaved={load} onClose={() => setEditor(false)} />}{schedule && <ScheduleEditor engineer={schedule} notify={notify} onClose={() => setSchedule(null)} />}{access && <EngineerAccess engineer={access} notify={notify} onChanged={load} onClose={() => setAccess(null)} />}</>
}

function CatalogsPage({ catalogs, reload, notify }) {
  const [tab, setTab] = useState('work-types'), [editing, setEditing] = useState(null)
  const meta = { 'work-types': { label: 'Типы работ', single: 'тип работ' }, qualifications: { label: 'Квалификации', single: 'квалификацию' }, 'equipment-types': { label: 'Оборудование', single: 'тип оборудования' } }
  const items = Array.isArray(catalogs[tab]) ? catalogs[tab] : []
  function empty() { return tab === 'work-types' ? { name: '', active: true, default_service_duration_min: 60, required_transport: '', qualification_ids: [], equipment_type_ids: [] } : tab === 'equipment-types' ? { name: '', active: true, available_units: 0 } : { name: '', active: true } }
  const [form, setForm] = useState(empty())
  useEffect(() => { setForm(empty()); setEditing(null) }, [tab])
  async function save(event) {
    event.preventDefault()
    const body = tab === 'work-types'
      ? { name: form.name, active: form.active, default_service_duration_min: Number(form.default_service_duration_min), required_transport: form.required_transport || null, qualification_ids: form.qualification_ids || [], equipment_type_ids: form.equipment_type_ids || [] }
      : tab === 'equipment-types'
        ? { name: form.name, active: form.active, available_units: Number(form.available_units) }
        : { name: form.name, active: form.active }
    try { await api(`/api/project/${tab}${editing ? `/${editing.id}` : ''}`, { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(body) }); notify(editing ? 'Изменения сохранены' : `Добавлена новая сущность`); setEditing(null); setForm(empty()); reload() }
    catch (error) { notify(error.message, 'error') }
  }
  function edit(item) { setEditing(item); setForm({ ...item }) }
  async function toggle(item) { try { await api(`/api/project/${tab}/${item.id}`, { method: 'PATCH', body: JSON.stringify({ active: !item.active }) }); notify('Статус обновлён'); reload() } catch (error) { notify(error.message, 'error') } }
  async function clear(item) { try { await api(`/api/project/equipment-types/${item.id}/clear-quantity`, { method: 'POST' }); notify('Количество обнулено'); reload() } catch (error) { notify(error.message, 'error') } }
  return <><PageHeader eyebrow="Настройка проекта" title="Справочники" subtitle="Свяжите типы работ с квалификациями, транспортом и оборудованием." /><div className="catalog-tabs">{Object.entries(meta).map(([id, item]) => <button className={tab === id ? 'active' : ''} key={id} onClick={() => setTab(id)}>{item.label}<span>{safeArray(catalogs[id]).length}</span></button>)}</div><div className="content-split catalog-layout"><div className="table-card"><table><thead><tr><th>Название</th>{tab === 'work-types' && <><th>Длительность</th><th>Транспорт</th><th>Требования</th></>}{tab === 'equipment-types' && <th>Количество</th>}<th>Статус</th><th /></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><b>{item.name}</b></td>{tab === 'work-types' && <><td>{item.default_service_duration_min} мин</td><td>{item.required_transport === 'CAR' ? 'Автомобиль' : 'Не требуется'}</td><td><div className="tag-row">{safeArray(item.qualification_ids).map((id) => <span key={`q${id}`}>{safeArray(catalogs.qualifications).find((x) => x.id === id)?.name || `Навык #${id}`}</span>)}{safeArray(item.equipment_type_ids).map((id) => <span className="purple" key={`e${id}`}>{safeArray(catalogs['equipment-types']).find((x) => x.id === id)?.name || `Оборудование #${id}`}</span>)}</div></td></>}{tab === 'equipment-types' && <td><span className="quantity">{item.available_units ?? 0}</span></td>}<td><Badge status={item.active ? 'ACTIVE' : 'BLOCKED'}>{item.active ? 'Активен' : 'Архив'}</Badge></td><td><div className="row-actions"><button onClick={() => edit(item)}>Изменить</button>{tab === 'equipment-types' && <button className="danger-link" onClick={() => clear(item)}>Обнулить</button>}<button onClick={() => toggle(item)}>{item.active ? 'В архив' : 'Включить'}</button></div></td></tr>)}</tbody></table>{!items.length && <Empty title="Справочник пуст" text={`Добавьте первый ${meta[tab].single}.`} />}</div><form className="side-form sticky" onSubmit={save}><span className="form-symbol">+</span><h3>{editing ? 'Редактирование' : `Новый ${meta[tab].single}`}</h3><Field label="Название"><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>{tab === 'equipment-types' && <Field label="Количество"><input min="0" type="number" value={form.available_units} onChange={(event) => setForm({ ...form, available_units: event.target.value })} /></Field>}{tab === 'work-types' && <><Field label="Длительность, мин"><input min="1" type="number" value={form.default_service_duration_min} onChange={(event) => setForm({ ...form, default_service_duration_min: event.target.value })} /></Field><Field label="Транспорт"><select value={form.required_transport || ''} onChange={(event) => setForm({ ...form, required_transport: event.target.value })}><option value="">Не требуется</option><option value="CAR">Автомобиль</option></select></Field><div><div className="section-label">Квалификации</div><CheckGroup items={safeArray(catalogs.qualifications).filter((x) => x.active)} value={form.qualification_ids} onChange={(qualification_ids) => setForm({ ...form, qualification_ids })} /></div><div><div className="section-label">Оборудование</div><CheckGroup items={safeArray(catalogs['equipment-types']).filter((x) => x.active)} value={form.equipment_type_ids} onChange={(equipment_type_ids) => setForm({ ...form, equipment_type_ids })} /></div></>}<label className="switch-row compact"><span><b>Активен</b></span><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /></label><Button className="wide">{editing ? 'Сохранить' : 'Добавить'}</Button>{editing && <Button type="button" kind="ghost" onClick={() => { setEditing(null); setForm(empty()) }}>Отмена</Button>}</form></div></>
}

function PlanningConfig({ notify }) {
  const [config, setConfig] = useState(null), [open, setOpen] = useState(false)
  useEffect(() => { api('/api/project/planning-config').then(setConfig).catch(() => setConfig(null)) }, [])
  async function save(event) { event.preventDefault(); const form = new FormData(event.currentTarget); const body = {}; for (const [key, value] of form) body[key] = Number(value); try { setConfig(await api('/api/project/planning-config', { method: 'PATCH', body: JSON.stringify(body) })); notify('Настройки расчёта сохранены'); setOpen(false) } catch (error) { notify(error.message, 'error') } }
  if (!config) return null
  const fields = [['solver_time_limit_sec', 'Лимит solver на день, сек'], ['batch_total_time_limit_sec', 'Лимит каскада, сек'], ['max_jobs_per_run', 'Заявок за дневной расчёт'], ['max_jobs_per_batch', 'Заявок в batch'], ['future_opportunity_critical', 'Бонус: одна возможность'], ['future_opportunity_high', 'Бонус: 2–3 возможности'], ['future_opportunity_limited', 'Бонус: 4–7 возможностей'], ['travel_cost_per_minute', 'Цена минуты пути'], ['sla_today', 'Штраф SLA сегодня'], ['sla_tomorrow', 'Штраф SLA завтра'], ['sla_overdue_base', 'Базовый штраф просрочки']]
  return <><Button kind="secondary" icon="settings" onClick={() => setOpen(true)}>Параметры</Button>{open && <Modal wide title="Параметры оптимизации" subtitle={`Версия конфигурации ${config.version}`} onClose={() => setOpen(false)}><form className="stack-form" onSubmit={save}><div className="form-grid">{fields.map(([name, label]) => <Field label={label} key={name}><input name={name} type="number" min="0" defaultValue={config[name]} /></Field>)}</div><div className="form-actions"><Button type="button" kind="ghost" onClick={() => setOpen(false)}>Отмена</Button><Button>Сохранить новую версию</Button></div></form></Modal>}</>
}

export function PlanningPage({ projectId, notify, ownerMode = false }) {
  const [planningContext, setPlanningContext] = useState(null)
  const [readiness, setReadiness] = useState(null)
  const [batches, setBatches] = useState([])
  const [batch, setBatch] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)
  const [view, setView] = useState('days')
  const [busy, setBusy] = useState(false)
  const projectToday = planningContext?.planning_date || null

  const loadHistory = () => api(`/api/projects/${projectId}/planning/batches?limit=50`).then((value) => setBatches(safeArray(value))).catch((error) => notify(error.message, 'error'))
  const openBatch = async (id, quiet = false) => {
    try {
      const value = await api(`/api/projects/${projectId}/planning/batches/${id}`)
      setBatch(value)
      setSelectedDate((current) => current && value.days?.some((day) => day.planning_date === current) ? current : value.days?.[0]?.planning_date || null)
      return value
    } catch (error) { if (!quiet) notify(error.message, 'error'); return null }
  }

  useEffect(() => {
    setPlanningContext(null)
    setReadiness(null)
    setBatch(null)
    setSelectedDate(null)
    loadHistory()
    api(`/api/projects/${projectId}/planning/context`).then((value) => {
      setPlanningContext(value)
      if (ownerMode) setReadiness({ ready: true, problems: [] })
      else api(`/api/project/planning/readiness?planning_date=${value.planning_date}`).then(setReadiness).catch((error) => notify(error.message, 'error'))
    }).catch((error) => notify(error.message, 'error'))
  }, [projectId, ownerMode])

  useEffect(() => {
    if (!batch || !activeBatchStatuses.has(batch.status)) return undefined
    const timer = window.setInterval(async () => {
      const value = await openBatch(batch.id, true)
      if (value && !activeBatchStatuses.has(value.status)) { loadHistory(); notify('Многодневный расчёт завершён') }
    }, 2000)
    return () => window.clearInterval(timer)
  }, [batch?.id, batch?.status])

  async function calculate() {
    if (!projectToday) return
    setBusy(true)
    try {
      const started = await api(`/api/projects/${projectId}/planning/batches`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ requested_start_date: projectToday }) })
      await openBatch(started.planning_batch_id)
      loadHistory()
      notify(started.reuse ? 'Показан актуальный расчёт с теми же исходными данными' : 'Многодневный расчёт запущен')
    } catch (error) { notify(error.message, 'error') } finally { setBusy(false) }
  }

  async function stop() {
    if (!batch) return
    try { setBatch(await api(`/api/projects/${projectId}/planning/batches/${batch.id}/stop`, { method: 'POST' })); notify('Остановка запрошена') }
    catch (error) { notify(error.message, 'error') }
  }

  async function publish(day) {
    if (!day?.planning_run_id || day.planning_date !== projectToday) return
    if (batch.status === 'PARTIAL' && !window.confirm('Многодневный расчёт завершён частично. Опубликовать валидный план текущего дня?')) return
    try {
      const validation = await api(`/api/projects/${projectId}/planning/batches/${batch.id}/validate-current-day`, { method: 'POST' })
      if (!validation.valid_for_publication) { notify('Исходные данные изменились. Запустите новый расчёт.', 'error'); await openBatch(batch.id); return }
      const hasUnassigned = day.unassigned_jobs?.length > 0
      if (hasUnassigned && !window.confirm(`В текущем дне останется неназначенных заявок: ${day.unassigned_jobs.length}. Опубликовать?`)) return
      await api(`/api/projects/${projectId}/planning/runs/${day.planning_run_id}/publish`, { method: 'POST', body: JSON.stringify({ confirm_unassigned: hasUnassigned, confirm_partial_batch: batch.status === 'PARTIAL' }) })
      notify('План текущего дня опубликован')
    } catch (error) { notify(error.message, 'error') }
  }

  const selectedDay = batch?.days?.find((day) => day.planning_date === selectedDate)
  const currentDay = batch?.days?.find((day) => day.planning_date === projectToday)
  const metrics = batch?.metrics || {}
  return <>
    <PageHeader eyebrow="Управляемый каскад" title="Планирование" subtitle="Единый черновой план на 7 дней с автоматическим расширением до 30 дней." actions={<>{!ownerMode && <PlanningConfig notify={notify} />}{batch && activeBatchStatuses.has(batch.status) ? <Button kind="danger" onClick={stop}>Остановить расчёт</Button> : <Button icon="refresh" disabled={busy || !projectToday || readiness?.ready === false} onClick={calculate}>{busy ? 'Запускаем…' : 'Рассчитать планы на следующие дни'}</Button>}</>} />
    <section className="cascade-intro"><div><small>Дата запуска</small><b>{formatDate(projectToday)}</b><span>Дата определяется timezone проекта и недоступна для изменения.</span></div><div><small>Начальный горизонт</small><b>7 календарных дней</b><span>Расширяется блоками только при наличии остатка.</span></div><div><small>Максимальный горизонт</small><b>30 календарных дней</b><span>Будущие планы остаются черновиками.</span></div><div className={`readiness ${readiness?.ready ? 'ready' : 'not-ready'}`}><span>{readiness?.ready ? '✓' : '!'}</span><div><b>{readiness?.ready ? 'Данные готовы' : 'Нужно подготовить данные'}</b>{readiness?.problems?.map((item) => <small key={item.code}>{item.message}</small>)}</div></div></section>
    <div className="planning-grid cascade-grid"><section className="table-card run-list"><header><h2>История запусков</h2><span>{batches.length}</span></header>{batches.length ? batches.map((item) => <button key={item.id} className={batch?.id === item.id ? 'active' : ''} onClick={() => openBatch(item.id)}><span><b>{formatDate(item.requested_start_date)}</b><small>{formatDateTime(item.created_at)}</small></span><span><Badge status={item.status}>{item.status}</Badge><small>{completionLabels[item.completion_reason] || 'Расчёт выполняется'}</small></span></button>) : <Empty title="Запусков пока нет" text="Рассчитайте единый черновой план на следующие дни." />}</section>
      <section className="cascade-result">{batch ? <><div className="result-head"><div><span className="eyebrow">Текущий результат</span><h2>{formatDate(batch.effective_start_date)} — {formatDate(batch.maximum_horizon_end)}</h2><p>{completionLabels[batch.completion_reason] || 'Расчёт выполняется'}</p></div><Badge status={batch.status}>{batch.status}</Badge></div>{batch.stale_for_publication && <div className="stale-warning">Исходные данные изменились. Публикация заблокирована — запустите новый расчёт.</div>}<div className="mini-stats"><div><small>Назначено</small><b>{batch.progress?.assigned ?? metrics.assigned ?? 0}</b></div><div><small>Осталось</small><b>{batch.progress?.remaining ?? metrics.remaining ?? 0}</b></div><div><small>Обработано дней</small><b>{batch.progress?.processed_days ?? metrics.processed_days ?? 0}</b></div><div><small>Постоянные проблемы</small><b>{metrics.permanent_issues ?? batch.backlog?.filter((job) => job.processing_status === 'PERMANENT_ISSUE').length ?? 0}</b></div></div><div className="cascade-tabs"><button className={view === 'days' ? 'active' : ''} onClick={() => setView('days')}>По дням</button><button className={view === 'backlog' ? 'active' : ''} onClick={() => setView('backlog')}>Остаток и проблемы</button><button className={view === 'summary' ? 'active' : ''} onClick={() => setView('summary')}>Итоги</button></div>{view === 'days' && <><div className="day-strip">{safeArray(batch.days).map((day) => <button key={day.planning_date} className={selectedDate === day.planning_date ? 'active' : ''} onClick={() => setSelectedDate(day.planning_date)}><b>{formatDate(day.planning_date)}</b><Badge status={day.status}>{day.status === 'SKIPPED_NO_SHIFT' ? 'Нет смен' : day.status}</Badge><small>{day.assigned_count || 0} назначено</small></button>)}</div>{selectedDay ? <div className="routes-summary day-detail"><h3>{formatDate(selectedDay.planning_date)} <small>{selectedDay.planning_date === projectToday ? 'Текущий день' : 'Черновик будущего дня'}</small></h3>{safeArray(selectedDay.routes).map((route) => <article key={route.engineer_id}><header><b>{route.engineer_name}</b><span>{route.total_travel_min} мин в пути · {route.total_service_min} мин работ</span></header>{safeArray(route.jobs).map((job) => <div key={job.job_id}><span className="sequence">{job.sequence}</span><b>{job.address}</b><small>{formatTime(job.planned_start)}–{formatTime(job.planned_finish)}</small></div>)}</article>)}{selectedDay.status === 'SKIPPED_NO_SHIFT' && <Empty title="Нет валидных смен" text="Дата учитывается в горизонте, остаток перенесён на следующий день." />}{selectedDay.status === 'PENDING' && <Empty title="Ожидает расчёта" text="День будет рассчитан после сохранения предыдущего." />}{!selectedDay.routes?.length && selectedDay.status === 'SUCCESS' && <Empty title="Назначений нет" text="Solver не нашёл допустимых назначений; заявки перенесены дальше." />}</div> : <Empty title="Дни ещё не открыты" text="Первый семидневный блок появится после подготовки snapshot." />}</>}{view === 'backlog' && <div className="batch-backlog">{safeArray(batch.backlog).length ? safeArray(batch.backlog).map((job) => <article key={job.job_id}><div><b>{job.address}</b><small>SLA: {formatDate(job.snapshot_sla_date)} · последняя попытка: {job.last_considered_date ? formatDate(job.last_considered_date) : 'не было'}</small></div><Badge status={job.processing_status}>{job.processing_status === 'PERMANENT_ISSUE' ? 'Постоянная проблема' : 'Остаток'}</Badge><p>{reasonLabels[job.primary_reason_code] || 'Ожидает следующего дня'}</p><span>Будущих возможностей: {job.future_opportunity_count ?? '—'}</span></article>) : <Empty title="Остатка нет" text="Все подходящие заявки получили черновое назначение." />}</div>}{view === 'summary' && <div className="batch-summary"><div><small>Фактический старт</small><b>{formatDate(batch.effective_start_date)}</b></div><div><small>Последняя обработанная дата</small><b>{batch.processed_through_date ? formatDate(batch.processed_through_date) : '—'}</b></div><div><small>Успешные дни</small><b>{metrics.successful_days ?? 0}</b></div><div><small>Пропущенные дни без смен</small><b>{metrics.skipped_days ?? 0}</b></div><div><small>Время расчёта</small><b>{metrics.duration_ms ? `${Math.round(metrics.duration_ms / 1000)} сек` : '—'}</b></div><div><small>Версия конфигурации</small><b>{batch.configuration_version}</b></div></div>}{currentDay?.status === 'SUCCESS' && !activeBatchStatuses.has(batch.status) && <Button className="wide publish" onClick={() => publish(currentDay)}>Проверить и опубликовать текущий день</Button>}</> : <Empty title="Выберите запуск" text="Здесь отображаются рассчитанные дни, остаток и подтверждённые причины." />}</section></div>
  </>
}

export default function DispatcherApp({ user, onLogout }) {
  const [section, setSection] = useState('jobs'), [toast, setToast] = useState(null), [catalogs, setCatalogs] = useState({ qualifications: [], 'equipment-types': [], 'work-types': [] })
  const notify = (message, type = 'info') => setToast({ message, type, key: Date.now() })
  const loadCatalogs = () => Promise.all([api('/api/project/qualifications'), api('/api/project/equipment-types'), api('/api/project/work-types')]).then(([qualifications, equipment, workTypes]) => setCatalogs({ qualifications: Array.isArray(qualifications) ? qualifications : [], 'equipment-types': Array.isArray(equipment) ? equipment : [], 'work-types': Array.isArray(workTypes) ? workTypes : [] })).catch((error) => notify(error.message, 'error'))
  useEffect(() => { void loadCatalogs() }, [])
  return <Shell user={user} roleLabel="Диспетчер" contextLabel="Проект" contextValue={`Проект #${user.project_id}`} nav={nav} active={section} onNavigate={setSection} onLogout={onLogout}><div className="page-wrap">{section === 'jobs' && <JobsPage workTypes={catalogs['work-types']} notify={notify} />}{section === 'engineers' && <EngineersPage qualifications={catalogs.qualifications} notify={notify} />}{section === 'catalogs' && <CatalogsPage catalogs={catalogs} reload={loadCatalogs} notify={notify} />}{section === 'planning' && <PlanningPage projectId={user.project_id} notify={notify} />}</div><Toast toast={toast} onClose={() => setToast(null)} /></Shell>
}
