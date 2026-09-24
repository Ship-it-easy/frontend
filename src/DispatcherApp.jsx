import React, { useEffect, useMemo, useRef, useState } from 'react'
import { api, qs } from './api.js'
import DynamicPlanningPage from './DynamicPlanningPage.jsx'
import JobImports from './JobImports.jsx'
import { dispatcherPlanningBase, dispatcherWorkspaceBase, selectDispatcherProject } from './districtAccess.js'
import { AddressField, Badge, Button, CheckGroup, Empty, Field, Icon, Modal, PageHeader, Shell, StatCard, Toast, formatDate, formatDateTime, formatPriority, formatTime, priorityLabels, today } from './ui.jsx'

const nav = [
  { id: 'jobs', label: 'Заявки', icon: 'jobs' },
  { id: 'imports', label: 'Импорт CSV', icon: 'jobs' },
  { id: 'planning', label: 'Планирование', icon: 'planning' },
  { id: 'engineers', label: 'Инженеры', icon: 'engineers' },
  { id: 'catalogs', label: 'Справочники', icon: 'catalogs' },
]
const statusLabels = { NEW: 'Новая', IN_PROGRESS: 'В работе', COMPLETED: 'Выполнена', CANCELLED: 'Отменена' }
const planningImpactText = 'Изменение не запускает автоматическое перепланирование. Оно попадёт в следующий ручной или ночной расчёт.'
const safeArray = (value) => Array.isArray(value) ? value : []

export function JobForm({ item, workTypes, onClose, onSaved, notify, apiBase = '/api/project' }) {
  const [form, setForm] = useState({ address: item?.address || '', latitude: item?.latitude ?? null, longitude: item?.longitude ?? null, sla_date: item?.sla_date || today(), time_window_start: formatTime(item?.time_window_start) === '—' ? '' : formatTime(item?.time_window_start), time_window_end: formatTime(item?.time_window_end) === '—' ? '' : formatTime(item?.time_window_end), work_type_id: item?.work_type_id || workTypes[0]?.id || '' })
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault()
    if (item && !window.confirm(`${planningImpactText}\n\nСохранить изменения заявки?`)) return
    setBusy(true)
    const payload = { ...form, work_type_id: Number(form.work_type_id), time_window_start: form.time_window_start || null, time_window_end: form.time_window_end || null }
    try {
      const result = await api(item ? `${apiBase}/jobs/${item.id}` : `${apiBase}/jobs`, { method: item ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
      if (result?.planning_event_id) {
        window.sessionStorage.setItem('route-app:last-planning-event', String(result.planning_event_id))
        notify(`Заявка создана. Перепланирование #${result.planning_event_id} поставлено в обработку`)
      } else notify(item ? 'Заявка обновлена' : 'Заявка создана')
      onSaved(); onClose()
    }
    catch (error) { notify(error.message, 'error') } finally { setBusy(false) }
  }
  return <Modal wide title={item ? `Заявка #${item.id}` : 'Новая заявка'} subtitle="Адрес, срок, доступное время и тип работы" onClose={onClose}><form className="stack-form" onSubmit={submit}>
    <AddressField suggestionsUrl={`${apiBase}/address-suggestions`} value={form.address} onChange={(address) => setForm({ ...form, address, latitude: null, longitude: null })} onSelect={(choice) => setForm({ ...form, address: choice.display_name, latitude: choice.latitude, longitude: choice.longitude })} />
    <div className="form-grid"><Field label="Крайний срок"><input type="date" required value={form.sla_date} onChange={(event) => setForm({ ...form, sla_date: event.target.value })} /></Field><Field label="Тип работ"><select required value={form.work_type_id} onChange={(event) => setForm({ ...form, work_type_id: event.target.value })}><option value="">Выберите тип</option>{workTypes.filter((type) => type.active || type.id === item?.work_type_id).map((type) => <option key={type.id} value={type.id}>{type.name} · {formatPriority(type.priority)} · {type.default_service_duration_min} мин</option>)}</select></Field><Field label="Окно с"><input type="time" value={form.time_window_start} onChange={(event) => setForm({ ...form, time_window_start: event.target.value })} /></Field><Field label="Окно до"><input type="time" value={form.time_window_end} onChange={(event) => setForm({ ...form, time_window_end: event.target.value })} /></Field></div>
    <div className="form-note">Длительность и приоритет подставятся из выбранного типа работ. Если время не указано, заявка доступна в течение смены.</div>{item && <div className="planning-impact-warning">{planningImpactText}</div>}<div className="form-actions"><Button type="button" kind="ghost" onClick={onClose}>Отмена</Button><Button disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</Button></div>
  </form></Modal>
}

function JobDetails({ job, workTypes, onClose, onEdit, onChanged, notify, apiBase = '/api/project' }) {
  const type = workTypes.find((item) => item.id === job.work_type_id)
  async function cancel() {
    const warning = job.status === 'IN_PROGRESS' ? '\n\nИнженер уже в пути или выполняет работу. Текущая точка будет использована как начало пересчитанного маршрута.' : ''
    if (!window.confirm(`Отменить заявку #${job.id}?${warning}`)) return
    try {
      const result = await api(`${apiBase}/jobs/${job.id}/cancel`, { method: 'POST' })
      if (result?.planning_event_id) window.sessionStorage.setItem('route-app:last-planning-event', String(result.planning_event_id))
      notify(result?.planning_event_id ? `Заявка отменена. Перепланирование #${result.planning_event_id} запущено` : 'Заявка уже была отменена')
      onChanged(); onClose()
    }
    catch (error) { notify(error.message, 'error') }
  }
  return <Modal wide title={`Заявка #${job.id}`} subtitle={job.address} onClose={onClose}><div className="detail-grid"><div><small>Статус</small><Badge status={job.status}>{statusLabels[job.status]}</Badge></div><div><small>Приоритет типа работ</small><Badge status={job.priority}>{formatPriority(job.priority)}</Badge></div><div><small>Тип работ</small><b>{type?.name || `#${job.work_type_id}`}</b></div><div><small>Крайний срок</small><b>{formatDate(job.sla_date)}</b></div><div><small>Временное окно</small><b>{job.time_window_start ? `${formatTime(job.time_window_start)}–${formatTime(job.time_window_end)}` : 'В течение смены'}</b></div><div><small>Длительность</small><b>{job.service_duration_min || type?.default_service_duration_min || '—'} мин</b></div><div><small>Координаты</small><b>{job.latitude ? `${Number(job.latitude).toFixed(5)}, ${Number(job.longitude).toFixed(5)}` : 'Определятся при расчёте'}</b></div><div><small>Создана</small><b>{formatDateTime(job.created_at)}</b></div><div><small>Назначение</small><b>{job.assignment ? `Инженер #${job.assignment.engineer_id}, ${formatDateTime(job.assignment.planned_start)}` : 'Не назначена'}</b></div></div>
    {!!job.status_history?.length && <div className="history"><h3>История статусов</h3>{job.status_history.map((item) => <div key={item.id}><span /><b>{statusLabels[item.new_status] || item.new_status}</b><small>{formatDateTime(item.created_at)}{item.reason ? ` · ${item.reason}` : ''}</small></div>)}</div>}
    <div className="form-actions">{['NEW', 'IN_PROGRESS'].includes(job.status) && <Button kind="danger" onClick={cancel}>Отменить заявку</Button>}{job.status === 'NEW' && <Button onClick={onEdit}>Изменить</Button>}</div></Modal>
}

function JobsPage({ workTypes, notify, importBatchId, onClearImportFilter, apiBase = '/api/project' }) {
  const [data, setData] = useState({ items: [], total: 0 }), [filters, setFilters] = useState({ search: '', status: '', work_type_id: '' }), [editor, setEditor] = useState(false), [selected, setSelected] = useState(null)
  const load = () => api(`${apiBase}/jobs${qs({ ...filters, import_batch_id: importBatchId, limit: 200 })}`).then((value) => setData({ ...(value || {}), items: Array.isArray(value?.items) ? value.items : [], total: Number(value?.total || 0) })).catch((error) => notify(error.message, 'error'))
  useEffect(() => { const timer = setTimeout(load, 180); return () => clearTimeout(timer) }, [filters.search, filters.status, filters.work_type_id, importBatchId])
  const counts = useMemo(() => ['NEW', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((status) => data.items.filter((item) => item.status === status).length), [data])
  return <><PageHeader eyebrow="Операционная работа" title="Заявки" subtitle="Контролируйте сроки, статусы и назначения." actions={<Button icon="plus" onClick={() => setEditor(true)}>Новая заявка</Button>} />
    {importBatchId && <div className="planning-impact-warning">Показаны заявки из пакета импорта #{importBatchId}. <button className="text-action" onClick={onClearImportFilter}>Показать все заявки</button></div>}
    <div className="stats-grid"><StatCard label="Новые" value={counts[0]} /><StatCard label="В работе" value={counts[1]} tone="amber" /><StatCard label="Выполнены" value={counts[2]} tone="green" /><StatCard label="Отменены" value={counts[3]} tone="gray" /></div>
    <div className="table-card"><div className="filters embedded"><div className="search-field"><Icon name="search" /><input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Адрес" /></div><select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Все статусы</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={filters.work_type_id} onChange={(event) => setFilters({ ...filters, work_type_id: event.target.value })}><option value="">Все типы работ</option>{workTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></div>
      {data.items.length ? <table><thead><tr><th>Создана</th><th>Адрес</th><th>Тип работ</th><th>Приоритет</th><th>Крайний срок</th><th>Статус</th><th /></tr></thead><tbody>{data.items.map((item) => <tr key={item.id}><td><b>{formatDate(item.created_at)}</b><small>{new Date(item.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small></td><td className="address-cell">{item.address}</td><td>{workTypes.find((type) => type.id === item.work_type_id)?.name || `#${item.work_type_id}`}</td><td><Badge status={item.priority}>{formatPriority(item.priority)}</Badge></td><td>{formatDate(item.sla_date)}{item.time_window_start && <small>{formatTime(item.time_window_start)}–{formatTime(item.time_window_end)}</small>}</td><td><Badge status={item.status}>{statusLabels[item.status]}</Badge></td><td><button className="text-action" onClick={() => setSelected(item)}>Открыть <Icon name="chevron" /></button></td></tr>)}</tbody></table> : <Empty title="Заявок пока нет" text="Создайте первую заявку — она сразу появится в списке." action={<Button icon="plus" onClick={() => setEditor(true)}>Создать заявку</Button>} />}</div>
    {editor && <JobForm apiBase={apiBase} item={typeof editor === 'object' ? editor : null} workTypes={workTypes} notify={notify} onSaved={load} onClose={() => setEditor(false)} />}{selected && <JobDetails apiBase={apiBase} job={selected} workTypes={workTypes} notify={notify} onClose={() => setSelected(null)} onChanged={load} onEdit={() => { setEditor(selected); setSelected(null) }} />}
  </>
}

function EngineerForm({ item, qualifications, onClose, onSaved, notify, apiBase = '/api/project' }) {
  const [form, setForm] = useState({ name: item?.name || '', active: item?.active ?? true, transport_type: item?.transport_type || 'NONE', start_address: item?.start_address || '', start_latitude: item?.start_latitude ?? null, start_longitude: item?.start_longitude ?? null, qualification_ids: item?.qualification_ids || [] })
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault()
    const availabilityChanged = item && form.active !== item.active
    const impact = availabilityChanged ? 'Изменение доступности может автоматически перестроить опубликованный план.' : planningImpactText
    if (item && !window.confirm(`${impact}\n\nСохранить изменения инженера?`)) return
    setBusy(true)
    const engineer = { name: form.name, active: form.active, transport_type: form.transport_type, start_address: form.start_address, start_latitude: form.start_latitude, start_longitude: form.start_longitude, qualification_ids: form.qualification_ids }
    try {
      const result = await api(item ? `${apiBase}/engineers/${item.id}` : `${apiBase}/engineers`, { method: item ? 'PATCH' : 'POST', body: JSON.stringify(engineer) })
      if (result?.planning_event_id) {
        window.sessionStorage.setItem('route-app:last-planning-event', String(result.planning_event_id))
        notify(`Инженер обновлён. Перепланирование #${result.planning_event_id} запущено`)
      } else notify(item ? 'Инженер обновлён' : 'Инженер создан')
      onSaved(); onClose()
    } catch (error) { notify(error.message, 'error') } finally { setBusy(false) }
  }
  return <Modal wide title={item ? item.name : 'Новый инженер'} subtitle="Профиль, транспорт и квалификации" onClose={onClose}><form className="stack-form" onSubmit={submit}><Field label="Имя"><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field><label className="switch-row"><span><b>Участвует в расчётах</b><small>Неактивному инженеру новые заявки не назначаются</small></span><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /></label><Field label="Транспорт"><select value={form.transport_type} onChange={(event) => setForm({ ...form, transport_type: event.target.value })}><option value="NONE">Без автомобиля · пешком</option><option value="CAR">Автомобиль</option></select></Field><AddressField suggestionsUrl={`${apiBase}/address-suggestions`} label="Стартовый адрес" value={form.start_address} onChange={(start_address) => setForm({ ...form, start_address, start_latitude: null, start_longitude: null })} onSelect={(choice) => setForm({ ...form, start_address: choice.display_name, start_latitude: choice.latitude, start_longitude: choice.longitude })} /><div><div className="section-label">Квалификации</div><CheckGroup items={qualifications.filter((item) => item.active)} value={form.qualification_ids} onChange={(qualification_ids) => setForm({ ...form, qualification_ids })} /></div>{item && <div className="planning-impact-warning">{form.active !== item.active ? 'Изменение доступности может автоматически перестроить опубликованный план.' : planningImpactText}</div>}<div className="form-actions"><Button type="button" kind="ghost" onClick={onClose}>Отмена</Button><Button disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</Button></div></form></Modal>
}

const weekdayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const localDate = (value) => { const [year, month, day] = String(value).split('-').map(Number); return new Date(year, month - 1, day) }
const monthBounds = (date) => ({ from: dateKey(new Date(date.getFullYear(), date.getMonth(), 1)), to: dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0)) })
const timeInZone = (value, timeZone) => {
  if (!value) return null
  const parts = new Intl.DateTimeFormat('ru-RU', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value))
  const hour = parts.find((item) => item.type === 'hour')?.value
  const minute = parts.find((item) => item.type === 'minute')?.value
  return hour && minute ? `${hour}:${minute}` : null
}

export function ScheduleEditor({ engineer, onClose, notify, apiBase = '/api/project', planningApiBase = apiBase }) {
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
    api(`${apiBase}/engineers/${engineer.id}`).then((value) => {
      if (!active) return
      const entries = {}
      safeArray(value?.schedule).forEach((item) => { entries[item.work_date] = { start: formatTime(item.shift_start), end: formatTime(item.shift_end) } })
      setSchedule(entries)
    }).catch((error) => notify(error.message, 'error')).finally(() => active && setLoading(false))
    return () => { active = false }
  }, [apiBase, engineer.id])

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
    const affectedDates = [...dirty].sort()
    let affectedAssignments = 0
    try {
      const currentPlan = await api(`${planningApiBase}/planning/current`)
      affectedAssignments = safeArray(currentPlan?.assignments).filter((assignment) => {
        if (!['NEW', 'IN_PROGRESS'].includes(assignment.status) || Number(assignment.engineer_id) !== Number(engineer.id) || !dirty.has(assignment.planning_date)) return false
        const nextShift = schedule[assignment.planning_date]
        if (!nextShift) return true
        const start = timeInZone(assignment.planned_start, currentPlan.timezone)
        const finish = timeInZone(assignment.planned_finish, currentPlan.timezone)
        return !start || !finish || start < nextShift.start || finish > nextShift.end
      }).length
    } catch (error) { notify(`Не удалось проверить влияние графика: ${error.message}`, 'error'); return }
    const datePreview = affectedDates.length <= 8 ? affectedDates.map(formatDate).join(', ') : `${affectedDates.slice(0, 8).map(formatDate).join(', ')} и ещё ${affectedDates.length - 8}`
    if (!window.confirm(`Затрагиваемые даты: ${datePreview}\nАктивных назначений за новой границей: ${affectedAssignments}.\n\nСохранить график? При материальном влиянии план будет пересчитан автоматически.`)) return
    setBusy(true)
    const entries = affectedDates.map((work_date) => schedule[work_date]
      ? { work_date, working: true, shift_start: schedule[work_date].start, shift_end: schedule[work_date].end }
      : { work_date, working: false, shift_start: null, shift_end: null })
    try {
      const result = await api(`${apiBase}/engineers/${engineer.id}/availability`, { method: 'PATCH', body: JSON.stringify({ entries }) })
      if (result?.planning_event_id) {
        window.sessionStorage.setItem('route-app:last-planning-event', String(result.planning_event_id))
        notify(`График сохранён. Перепланирование #${result.planning_event_id} запущено`)
      } else notify('График инженера сохранён — назначенный план не затронут')
      onClose()
    } catch (error) { notify(error.message, 'error') } finally { setBusy(false) }
  }
  function close() {
    if (dirty.size && !window.confirm('Закрыть редактор без сохранения изменений?')) return
    onClose()
  }

  return <Modal wide title={`График · ${engineer.name}`} subtitle="Одна непрерывная смена на дату. Значимые изменения автоматически пересчитывают опубликованный план." onClose={close}>
    {loading ? <div className="schedule-loading">Загружаем график…</div> : <div className="schedule-editor">
      <div className="planning-impact-warning">Если инженер становится недоступен или снова доступен внутри опубликованного горизонта, перепланирование запускается автоматически.</div>
      <section className="schedule-bulk"><h3>Массовое заполнение</h3><div className="schedule-bulk-fields"><Field label="Период с"><input type="date" value={bulk.from} onChange={(event) => setBulk({ ...bulk, from: event.target.value })} /></Field><Field label="по"><input type="date" value={bulk.to} onChange={(event) => setBulk({ ...bulk, to: event.target.value })} /></Field><Field label="Начало"><input type="time" value={bulk.start} onChange={(event) => setBulk({ ...bulk, start: event.target.value })} /></Field><Field label="Окончание"><input type="time" value={bulk.end} onChange={(event) => setBulk({ ...bulk, end: event.target.value })} /></Field></div><div className="weekday-picker">{weekdayNames.map((name, index) => { const value = index + 1; return <button type="button" className={bulk.weekdays.includes(value) ? 'active' : ''} key={name} onClick={() => setBulk({ ...bulk, weekdays: bulk.weekdays.includes(value) ? bulk.weekdays.filter((day) => day !== value) : [...bulk.weekdays, value] })}>{name}</button> })}</div><Button type="button" kind="secondary" onClick={applyBulk}>Применить к периоду</Button></section>
      <section className="schedule-calendar"><header><button type="button" aria-label="Предыдущий месяц" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button><h3>{monthNames[month.getMonth()]} {month.getFullYear()}</h3><button type="button" aria-label="Следующий месяц" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button></header><div className="calendar-grid calendar-weekdays">{weekdayNames.map((name) => <span key={name}>{name}</span>)}</div><div className="calendar-grid">{calendarDays.map((day) => { const entry = schedule[day.key]; return <button type="button" key={day.key} className={`${day.current ? '' : 'outside'} ${entry ? 'working' : 'day-off'} ${selected.has(day.key) ? 'selected' : ''}`} onClick={() => toggleDate(day.key)}><b>{day.number}</b><small>{entry ? `${entry.start}–${entry.end}` : 'Выходной'}</small></button> })}</div><div className="calendar-legend"><span><i className="working" /> Рабочий день</span><span><i className="selected" /> Выбрано</span><span>{selected.size ? `Выбрано дат: ${selected.size}` : 'Нажмите на даты для выбора'}</span></div></section>
      <section className="schedule-selection"><div><h3>Выбранные даты</h3><p>Задайте общее время или сделайте выбранные даты выходными.</p></div><Field label="Начало"><input type="time" value={shift.start} onChange={(event) => setShift({ ...shift, start: event.target.value })} /></Field><Field label="Окончание"><input type="time" value={shift.end} onChange={(event) => setShift({ ...shift, end: event.target.value })} /></Field><Button type="button" kind="secondary" onClick={applySelected}>Задать смену</Button><Button type="button" kind="danger" onClick={makeSelectedDaysOff}>Сделать выходными</Button></section>
      <div className="form-actions"><span className="schedule-unsaved">{dirty.size ? `Изменено дат: ${dirty.size}` : 'Нет несохранённых изменений'}</span><Button type="button" kind="ghost" onClick={close}>Отмена</Button><Button type="button" disabled={busy || !dirty.size} onClick={save}>{busy ? 'Сохраняем…' : 'Сохранить график'}</Button></div>
    </div>}
  </Modal>
}

function EngineerAccess({ engineer, onClose, onChanged, notify, apiBase = '/api/project' }) {
  const [form, setForm] = useState({ login: '', password: '' }), [busy, setBusy] = useState(false)
  async function create(event) { event.preventDefault(); setBusy(true); try { await api(`${apiBase}/engineers/${engineer.id}/access`, { method: 'POST', body: JSON.stringify(form) }); notify('Доступ инженера создан'); onChanged(); onClose() } catch (error) { notify(error.message, 'error') } finally { setBusy(false) } }
  async function reset(event) { event.preventDefault(); setBusy(true); try { await api(`${apiBase}/engineers/${engineer.id}/reset-password`, { method: 'POST', body: JSON.stringify({ password: form.password }) }); notify('Пароль изменён'); onClose() } catch (error) { notify(error.message, 'error') } finally { setBusy(false) } }
  async function toggle() { try { const result = await api(`${apiBase}/engineers/${engineer.id}/access/${engineer.access.status === 'ACTIVE' ? 'block' : 'unblock'}`, { method: 'POST' }); if (result?.planning_event_id) window.sessionStorage.setItem('route-app:last-planning-event', String(result.planning_event_id)); notify(result?.planning_event_id ? `Статус доступа обновлён. Перепланирование #${result.planning_event_id} запущено` : 'Статус доступа обновлён'); onChanged(); onClose() } catch (error) { notify(error.message, 'error') } }
  return <Modal title={`Доступ · ${engineer.name}`} subtitle={engineer.access ? `Логин: ${engineer.access.login}` : 'Создайте учётную запись кабинета инженера'} onClose={onClose}><form className="stack-form" onSubmit={engineer.access ? reset : create}>{!engineer.access && <Field label="Логин"><input required value={form.login} onChange={(event) => setForm({ ...form, login: event.target.value })} /></Field>}<Field label={engineer.access ? 'Новый пароль' : 'Пароль'}><input type="password" required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></Field><div className="form-actions">{engineer.access && <Button type="button" kind={engineer.access.status === 'ACTIVE' ? 'danger' : 'secondary'} onClick={toggle}>{engineer.access.status === 'ACTIVE' ? 'Заблокировать' : 'Разблокировать'}</Button>}<Button disabled={busy}>{engineer.access ? 'Сменить пароль' : 'Создать доступ'}</Button></div></form></Modal>
}

function EngineersPage({ qualifications, notify, apiBase = '/api/project', planningApiBase = apiBase }) {
  const [items, setItems] = useState([]), [search, setSearch] = useState(''), [editor, setEditor] = useState(false), [access, setAccess] = useState(null), [schedule, setSchedule] = useState(null)
  const load = () => api(`${apiBase}/engineers`).then((value) => setItems(Array.isArray(value) ? value : [])).catch((error) => notify(error.message, 'error'))
  useEffect(() => { void load() }, [apiBase])
  const visible = items.filter((item) => String(item.name || '').toLowerCase().includes(search.toLowerCase()))
  return <><PageHeader eyebrow="Команда участка" title="Инженеры" subtitle="Квалификации, транспорт, графики и доступ в кабинет." actions={<Button icon="plus" onClick={() => setEditor(true)}>Новый инженер</Button>} /><div className="filters"><div className="search-field grow"><Icon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Имя инженера" /></div></div><div className="engineer-grid">{visible.map((item) => <article className="engineer-card" key={item.id}><header><span className="avatar large">{String(item.name || '?')[0].toUpperCase()}</span><Badge status={item.active ? 'ACTIVE' : 'BLOCKED'}>{item.active ? 'Активен' : 'Неактивен'}</Badge></header><h3>{item.name || `Инженер #${item.id}`}</h3><div className="tag-row">{(Array.isArray(item.qualification_ids) ? item.qualification_ids : []).map((id) => <span key={id}>{qualifications.find((q) => q.id === id)?.name || `Навык #${id}`}</span>)}</div><p><Icon name="map" /> {item.start_address || 'Адрес не указан'}</p><footer><span>{item.transport_type === 'CAR' ? '◆ Автомобиль' : '♙ Пешком'}</span><span>{item.access ? `● ${item.access.login}` : '○ Нет доступа'}</span></footer><div className="card-actions"><button onClick={() => setSchedule(item)}>График</button><button onClick={() => setEditor(item)}>Изменить</button><button onClick={() => setAccess(item)}>Доступ</button></div></article>)}{!visible.length && <Empty title="Инженеры не найдены" text="Создайте инженера или измените поисковый запрос." />}</div>{editor && <EngineerForm apiBase={apiBase} item={typeof editor === 'object' ? editor : null} qualifications={qualifications} notify={notify} onSaved={load} onClose={() => setEditor(false)} />}{schedule && <ScheduleEditor apiBase={apiBase} planningApiBase={planningApiBase} engineer={schedule} notify={notify} onClose={() => setSchedule(null)} />}{access && <EngineerAccess apiBase={apiBase} engineer={access} notify={notify} onChanged={load} onClose={() => setAccess(null)} />}</>
}

function CatalogsPage({ catalogs, reload, notify, apiBase = '/api/project' }) {
  const [tab, setTab] = useState('work-types'), [editing, setEditing] = useState(null)
  const meta = { 'work-types': { label: 'Типы работ', single: 'тип работ' }, qualifications: { label: 'Квалификации', single: 'квалификацию' }, 'equipment-types': { label: 'Оборудование', single: 'тип оборудования' } }
  const items = Array.isArray(catalogs[tab]) ? catalogs[tab] : []
  function empty() { return tab === 'work-types' ? { name: '', active: true, priority: 'LOW', default_service_duration_min: 60, required_transport: '', qualification_ids: [], equipment_type_ids: [] } : tab === 'equipment-types' ? { name: '', active: true, available_units: 0 } : { name: '', active: true } }
  const [form, setForm] = useState(empty())
  useEffect(() => { setForm(empty()); setEditing(null) }, [tab])
  async function save(event) {
    event.preventDefault()
    if (editing && !window.confirm(`${planningImpactText}\n\nСохранить изменения справочника?`)) return
    const body = tab === 'work-types'
      ? { name: form.name, active: form.active, priority: form.priority, default_service_duration_min: Number(form.default_service_duration_min), required_transport: form.required_transport || null, qualification_ids: form.qualification_ids || [], equipment_type_ids: form.equipment_type_ids || [] }
      : tab === 'equipment-types'
        ? { name: form.name, active: form.active, available_units: Number(form.available_units) }
        : { name: form.name, active: form.active }
    try { await api(`${apiBase}/${tab}${editing ? `/${editing.id}` : ''}`, { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(body) }); notify(editing ? 'Изменения сохранены' : `Добавлена новая сущность`); setEditing(null); setForm(empty()); reload() }
    catch (error) { notify(error.message, 'error') }
  }
  function edit(item) { setEditing(item); setForm({ ...item }) }
  async function toggle(item) { if (!window.confirm(`${planningImpactText}\n\nИзменить статус?`)) return; try { await api(`${apiBase}/${tab}/${item.id}`, { method: 'PATCH', body: JSON.stringify({ active: !item.active }) }); notify('Статус обновлён'); reload() } catch (error) { notify(error.message, 'error') } }
  async function clear(item) { if (!window.confirm(`${planningImpactText}\n\nОбнулить количество?`)) return; try { await api(`${apiBase}/equipment-types/${item.id}/clear-quantity`, { method: 'POST' }); notify('Количество обнулено'); reload() } catch (error) { notify(error.message, 'error') } }
  return <><PageHeader eyebrow="Настройка участка" title="Справочники" subtitle="Свяжите типы работ с приоритетами, квалификациями, транспортом и оборудованием." /><div className="catalog-tabs">{Object.entries(meta).map(([id, item]) => <button className={tab === id ? 'active' : ''} key={id} onClick={() => setTab(id)}>{item.label}<span>{safeArray(catalogs[id]).length}</span></button>)}</div><div className="content-split catalog-layout"><div className="table-card"><table><thead><tr><th>Название</th>{tab === 'work-types' && <><th>Приоритет</th><th>Длительность</th><th>Транспорт</th><th>Требования</th></>}{tab === 'equipment-types' && <th>Количество</th>}<th>Статус</th><th /></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><b>{item.name}</b></td>{tab === 'work-types' && <><td><Badge status={item.priority}>{formatPriority(item.priority)}</Badge></td><td>{item.default_service_duration_min} мин</td><td>{item.required_transport === 'CAR' ? 'Автомобиль' : 'Не требуется'}</td><td><div className="tag-row">{safeArray(item.qualification_ids).map((id) => <span key={`q${id}`}>{safeArray(catalogs.qualifications).find((x) => x.id === id)?.name || `Навык #${id}`}</span>)}{safeArray(item.equipment_type_ids).map((id) => <span className="purple" key={`e${id}`}>{safeArray(catalogs['equipment-types']).find((x) => x.id === id)?.name || `Оборудование #${id}`}</span>)}</div></td></>}{tab === 'equipment-types' && <td><span className="quantity">{item.available_units ?? 0}</span></td>}<td><Badge status={item.active ? 'ACTIVE' : 'BLOCKED'}>{item.active ? 'Активен' : 'Архив'}</Badge></td><td><div className="row-actions"><button onClick={() => edit(item)}>Изменить</button>{tab === 'equipment-types' && <button className="danger-link" onClick={() => clear(item)}>Обнулить</button>}<button onClick={() => toggle(item)}>{item.active ? 'В архив' : 'Включить'}</button></div></td></tr>)}</tbody></table>{!items.length && <Empty title="Справочник пуст" text={`Добавьте первый ${meta[tab].single}.`} />}</div><form className="side-form sticky" onSubmit={save}><span className="form-symbol">+</span><h3>{editing ? 'Редактирование' : `Новый ${meta[tab].single}`}</h3><Field label="Название"><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>{tab === 'equipment-types' && <Field label="Количество"><input min="0" type="number" value={form.available_units} onChange={(event) => setForm({ ...form, available_units: event.target.value })} /></Field>}{tab === 'work-types' && <><Field label="Приоритет"><select value={form.priority || 'LOW'} onChange={(event) => setForm({ ...form, priority: event.target.value })}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Длительность, мин"><input min="1" type="number" value={form.default_service_duration_min} onChange={(event) => setForm({ ...form, default_service_duration_min: event.target.value })} /></Field><Field label="Транспорт"><select value={form.required_transport || ''} onChange={(event) => setForm({ ...form, required_transport: event.target.value })}><option value="">Не требуется</option><option value="CAR">Автомобиль</option></select></Field><div><div className="section-label">Квалификации</div><CheckGroup items={safeArray(catalogs.qualifications).filter((x) => x.active)} value={form.qualification_ids} onChange={(qualification_ids) => setForm({ ...form, qualification_ids })} /></div><div><div className="section-label">Оборудование</div><CheckGroup items={safeArray(catalogs['equipment-types']).filter((x) => x.active)} value={form.equipment_type_ids} onChange={(equipment_type_ids) => setForm({ ...form, equipment_type_ids })} /></div></>}<label className="switch-row compact"><span><b>Активен</b></span><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /></label><Button className="wide">{editing ? 'Сохранить' : 'Добавить'}</Button>{editing && <Button type="button" kind="ghost" onClick={() => { setEditing(null); setForm(empty()) }}>Отмена</Button>}</form></div></>
}


export function PlanningPage({ projectId, ownerMode = false, ...props }) {
  return <DynamicPlanningPage projectId={projectId} ownerMode={ownerMode} {...props} />
}

export default function DispatcherApp({ user, onLogout }) {
  const [section, setSection] = useState('jobs'), [toast, setToast] = useState(null), [catalogs, setCatalogs] = useState({ qualifications: [], 'equipment-types': [], 'work-types': [] }), [importBatchId, setImportBatchId] = useState(null)
  const [projects, setProjects] = useState([]), [projectId, setProjectId] = useState(''), [loadingProjects, setLoadingProjects] = useState(true)
  const notify = (message, type = 'info') => setToast({ message, type, key: Date.now() })
  const storageKey = `route-app:dispatcher-project:${user.id}`
  const apiBase = dispatcherWorkspaceBase(projectId)
  const planningApiBase = dispatcherPlanningBase(projectId)
  const catalogRequestId = useRef(0)
  const catalogScope = useRef(apiBase)
  catalogScope.current = apiBase
  useEffect(() => {
    let active = true
    api('/api/project/available-projects').then((value) => {
      if (!active) return
      const items = safeArray(value)
      const remembered = window.localStorage.getItem(storageKey)
      const selected = selectDispatcherProject(items, remembered)
      setProjects(items)
      setProjectId(selected)
    }).catch((error) => notify(error.message, 'error')).finally(() => active && setLoadingProjects(false))
    return () => { active = false }
  }, [storageKey])
  const loadCatalogs = () => {
    if (!apiBase) return Promise.resolve()
    const requestedScope = apiBase
    const requestId = ++catalogRequestId.current
    return Promise.all([api(`${requestedScope}/qualifications`), api(`${requestedScope}/equipment-types`), api(`${requestedScope}/work-types`)]).then(([qualifications, equipment, workTypes]) => {
      if (catalogScope.current !== requestedScope || catalogRequestId.current !== requestId) return
      setCatalogs({ qualifications: safeArray(qualifications), 'equipment-types': safeArray(equipment), 'work-types': safeArray(workTypes) })
    }).catch((error) => {
      if (catalogScope.current === requestedScope && catalogRequestId.current === requestId) notify(error.message, 'error')
    })
  }
  useEffect(() => {
    catalogRequestId.current += 1
    setImportBatchId(null)
    setCatalogs({ qualifications: [], 'equipment-types': [], 'work-types': [] })
    if (projectId) {
      window.localStorage.setItem(storageKey, String(projectId))
      void loadCatalogs()
    }
    return () => { catalogRequestId.current += 1 }
  }, [projectId, storageKey])
  const projectSelector = loadingProjects
    ? <span className="sidebar-context-loading">Загрузка…</span>
    : projects.length
      ? <select className="sidebar-context-select" aria-label="Выбранный участок" value={projectId} onChange={(event) => setProjectId(event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
      : 'Нет доступных участков'
  return <Shell user={user} roleLabel="Диспетчер" contextLabel="Участок" contextValue={projectSelector} nav={nav} active={section} onNavigate={setSection} onLogout={onLogout}><div className="page-wrap">{!loadingProjects && !projectId ? <Empty title="Нет доступных участков" text="Попросите владельца назначить вам хотя бы один активный участок." /> : projectId && <div key={projectId}>{section === 'jobs' && <JobsPage apiBase={apiBase} workTypes={catalogs['work-types']} notify={notify} importBatchId={importBatchId} onClearImportFilter={() => setImportBatchId(null)} />}{section === 'imports' && <JobImports projectId={Number(projectId)} notify={notify} onOpenJobs={(batchId) => { setImportBatchId(batchId); setSection('jobs') }} />}{section === 'engineers' && <EngineersPage apiBase={apiBase} planningApiBase={planningApiBase} qualifications={catalogs.qualifications} notify={notify} />}{section === 'catalogs' && <CatalogsPage apiBase={apiBase} catalogs={catalogs} reload={loadCatalogs} notify={notify} />}{section === 'planning' && <PlanningPage user={user} projectId={Number(projectId)} notify={notify} onNavigate={setSection} />}</div>}</div><Toast toast={toast} onClose={() => setToast(null)} /></Shell>
}
