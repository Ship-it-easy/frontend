import React, { useEffect, useMemo, useState } from 'react'
import { api } from './api.js'
import RoutesMap from './RoutesMap.jsx'
import { Badge, Button, Empty, Field, Modal, PageHeader, formatDate, formatDateTime, formatTime } from './ui.jsx'

const activeEventStates = new Set(['PENDING', 'RUNNING'])
const eventStateLabels = { PENDING: 'Ожидает', RUNNING: 'Выполняется', PUBLISHED: 'Опубликован', FAILED: 'Ошибка' }
const triggerLabels = { JOB_CREATED: 'Новая заявка', JOB_CANCELLED: 'Отмена заявки', ENGINEER_AVAILABILITY_LOST: 'Инженер недоступен', ENGINEER_AVAILABILITY_RESTORED: 'Доступность инженера восстановлена', COALESCED: 'Несколько изменений', MANUAL: 'Ручной запуск', NIGHTLY: 'Ночной запуск', RECOVERY: 'Восстановление' }
const changeLabels = { ASSIGNED: 'Назначена', CHANGED: 'Перепланирована', DISPLACED: 'Вытеснена', CANCELLED: 'Отменена' }
const changeReasonLabels = { NEW_ASSIGNMENT: 'Новое назначение', REPLANNED: 'Маршрут изменён', JOB_CANCELLED: 'Заявка отменена', ENGINEER_UNAVAILABLE: 'Инженер недоступен', CANCELLED_EN_ROUTE_ASSUMPTION: 'Маршрут продолжен от адреса отменённой заявки', DISPLACED_TO_FUTURE: 'Перенесена на будущую дату', NOT_ASSIGNED_IN_NEW_HORIZON: 'Не назначена в новой версии' }
const reasonLabels = {
  NO_AVAILABLE_ENGINEER: 'На дату нет доступного инженера',
  NO_COMPATIBLE_ENGINEER: 'Нет совместимого инженера',
  NOT_SELECTED_BY_OPTIMIZER: 'Допустима, но не выбрана оптимизатором',
  NO_COMPATIBLE_ENGINEER_IN_HORIZON: 'Нет совместимого инженера в горизонте',
  NO_SHIFT_IN_HORIZON: 'Нет смен в горизонте',
  DURATION_EXCEEDS_ALL_SHIFTS: 'Работа не помещается ни в одну смену',
  EQUIPMENT_UNAVAILABLE_IN_HORIZON: 'Оборудование недоступно',
  INVALID_TIME_WINDOW_FOR_HORIZON: 'Временное окно недоступно в горизонте',
  DAILY_TIME_WINDOW_CONFLICT: 'Временное окно не помещается в смену',
  NOT_ASSIGNED_WITHIN_HORIZON: 'Не назначена в пределах горизонта',
  SLA_OUTSIDE_MAXIMUM_HORIZON: 'SLA находится за пределами максимального горизонта',
  ENGINEER_UNAVAILABLE: 'Инженер недоступен',
  JOB_CANCELLED: 'Заявка отменена',
  DISTANCE_DATA_NOT_READY: 'Данные о расстояниях не готовы',
  TRAVEL_PROVIDER_UNAVAILABLE: 'Дорожный сервис недоступен',
  INVALID_PENALTY_BANDS: 'Некорректны диапазоны приоритетов SLA',
  OBJECTIVE_RANGE_OVERFLOW: 'Целевая функция не помещается в допустимый диапазон',
  FAILED_VALIDATION: 'Результат не прошёл проверку ограничений',
  STALE_SNAPSHOT: 'Исходные данные изменились во время расчёта',
}
const eventErrorText = (event) => reasonLabels[event?.error_code] || event?.error_message || event?.error_code || 'Неизвестная ошибка'
const planningImpactText = 'Изменение параметров не перестраивает уже опубликованный план. Новые настройки применятся при следующем ручном, ночном или автоматическом расчёте.'
const safeArray = (value) => Array.isArray(value) ? value : []

function PlanningConfig({ notify }) {
  const [config, setConfig] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => { api('/api/project/planning-config').then(setConfig).catch(() => setConfig(null)) }, [])

  async function save(event) {
    event.preventDefault()
    if (!window.confirm(`${planningImpactText}\n\nСохранить новую версию настроек?`)) return
    const form = new FormData(event.currentTarget)
    const body = {}
    numericFields.forEach(([name]) => { body[name] = Number(form.get(name)) })
    body.nightly_planning_enabled = form.get('nightly_planning_enabled') === 'on'
    body.nightly_planning_time = form.get('nightly_planning_time')
    body.travel_provider = form.get('travel_provider')
    try {
      setConfig(await api('/api/project/planning-config', { method: 'PATCH', body: JSON.stringify(body) }))
      notify('Настройки расчёта сохранены')
      setOpen(false)
    } catch (error) { notify(error.message, 'error') }
  }

  if (!config) return null
  return <>
    <Button kind="secondary" icon="settings" onClick={() => setOpen(true)}>Параметры</Button>
    {open && <Modal wide title="Параметры динамического планирования" subtitle={`Версия конфигурации ${config.version}`} onClose={() => setOpen(false)}>
      <form className="stack-form" onSubmit={save}>
        <div className="planning-impact-warning">{planningImpactText}</div>
        <div className="form-grid">{numericFields.map(([name, label, min, fallback]) => <Field label={label} key={name}><input required name={name} type="number" min={min} defaultValue={config[name] ?? fallback} /></Field>)}</div>
        <Field label="Провайдер дорожной матрицы"><select name="travel_provider" defaultValue={config.travel_provider}><option value="VALHALLA_LOCAL">Локальная Valhalla</option></select></Field>
        <label className="switch-row"><span><b>Ночной пересчёт</b><small>Полностью перестраивает и автоматически публикует план один раз в сутки.</small></span><input name="nightly_planning_enabled" type="checkbox" defaultChecked={config.nightly_planning_enabled} /></label>
        <Field label="Время ночного пересчёта"><input required name="nightly_planning_time" type="time" defaultValue={formatTime(config.nightly_planning_time)} /></Field>
        <div className="form-actions"><Button type="button" kind="ghost" onClick={() => setOpen(false)}>Отмена</Button><Button>Сохранить новую версию</Button></div>
      </form>
    </Modal>}
  </>
}

const numericFields = [
  ['candidate_solver_time_limit_sec', 'Один кандидат, сек', 1],
  ['single_cascade_time_limit_sec', 'Один каскад, сек', 1],
  ['event_time_limit_sec', 'Одно событие, сек', 1],
  ['event_coalesce_window_sec', 'Окно объединения заявок, сек', 0],
  ['event_coalesce_max_wait_sec', 'Максимальное ожидание объединения, сек', 1],
  ['max_parallel_candidate_models', 'Параллельных кандидатов', 1],
  ['solver_time_limit_sec', 'Solver на один день, сек', 1],
  ['batch_total_time_limit_sec', 'Общий лимит каскада, сек', 1],
  ['max_jobs_per_run', 'Заявок в дневном расчёте', 1],
  ['max_jobs_per_batch', 'Заявок в событии', 1],
  ['distance_unit_meters', 'Единица пробега, метры', 1],
  ['time_unit_seconds', 'Единица времени пути, секунды', 1],
  ['travel_cache_ttl_days', 'TTL дорожной матрицы, дней', 0, 7],
  ['future_opportunity_critical', 'Бонус: одна возможность', 0],
  ['future_opportunity_high', 'Бонус: 2–3 возможности', 0],
  ['future_opportunity_limited', 'Бонус: 4–7 возможностей', 0],
  ['travel_cost_per_minute', 'Цена минуты пути', 0],
  ['solver_seed', 'Seed оптимизатора', 0],
  ['sla_overdue_per_day', 'Штраф за день просрочки', 0],
  ['sla_today', 'Штраф SLA сегодня', 0],
  ['sla_tomorrow', 'Штраф SLA завтра', 0],
  ['sla_2_3_days', 'Штраф SLA через 2–3 дня', 0],
  ['sla_later', 'Штраф позднего SLA', 0],
  ['sla_overdue_base', 'Базовый штраф просрочки', 0],
  ['skill_one_engineer', 'Штраф: навык только у одного', 0],
  ['skill_two_engineers', 'Штраф: навык у двух', 0],
  ['equipment_one_unit', 'Штраф: одна единица оборудования', 0],
  ['equipment_two_units', 'Штраф: две единицы оборудования', 0],
  ['window_30', 'Штраф окна 30 минут', 0],
  ['window_60', 'Штраф окна 60 минут', 0],
  ['window_120', 'Штраф окна 120 минут', 0],
]

function EventProgress({ event }) {
  if (!event) return null
  const progress = event.progress || {}
  const completed = Number(progress.candidate_evaluations_completed || 0)
  const total = Number(progress.candidate_evaluations_total || 0)
  const percent = total ? Math.round((completed / total) * 100) : event.state === 'PUBLISHED' ? 100 : 0
  return <section className={`planning-event planning-event-${String(event.state).toLowerCase()}`}>
    <div className="planning-event-head"><div><span className="eyebrow">Событие планирования #{event.id}</span><h3>{triggerLabels[event.event_type] || event.event_type}</h3></div><Badge status={event.state}>{eventStateLabels[event.state] || event.state}</Badge></div>
    <div className="progress-track"><i style={{ width: `${percent}%` }} /></div>
    <div className="planning-event-meta"><span>Кандидаты: {completed}/{total || '—'}</span><span>Ожидают обработки: {progress.queued_events ?? 0}</span>{progress.current_candidate_engineer_id && <span>Инженер-кандидат #{progress.current_candidate_engineer_id}</span>}{progress.current_day?.planning_date && <span>Дата: {formatDate(progress.current_day.planning_date)}</span>}</div>
    {(event.error_message || event.error_code) && <div className="stale-warning">{eventErrorText(event)}</div>}
  </section>
}

function assignmentText(value) {
  if (!value) return 'нет назначения'
  return `${formatDate(value.planning_date)}, инженер #${value.engineer_id}, позиция ${value.sequence}, ${formatTime(value.planned_start)}–${formatTime(value.planned_finish)}`
}

function changedAssignmentFields(before, after) {
  if (!before || !after) return []
  const fields = [
    ['planning_date', 'Дата', formatDate],
    ['engineer_id', 'Инженер', (value) => `#${value}`],
    ['sequence', 'Порядок', (value) => `№${value}`],
    ['planned_start', 'Начало', formatTime],
    ['planned_finish', 'Окончание', formatTime],
  ]
  return fields
    .filter(([key]) => before[key] !== after[key])
    .map(([key, label, format]) => `${label}: ${format(before[key])} → ${format(after[key])}`)
}

function VersionDay({ date, engineers, projectToday }) {
  const mapResult = useMemo(() => ({
    routes: [...engineers.entries()].map(([engineerId, assignments]) => {
      const first = assignments[0] || {}
      return {
        engineer_id: engineerId,
        engineer_name: first.engineer_name || `Инженер #${engineerId}`,
        transport_type: first.transport_type,
        start_coordinate: first.start_latitude != null && first.start_longitude != null
          ? { latitude: first.start_latitude, longitude: first.start_longitude }
          : null,
        jobs: assignments.map((item) => ({
          job_id: item.job_id,
          address: item.address,
          planned_start: item.planned_start,
          coordinate: item.latitude != null && item.longitude != null
            ? { latitude: item.latitude, longitude: item.longitude }
            : null,
        })),
      }
    }),
  }), [engineers])

  return <section className="version-day">
    <h3>{formatDate(date)}{date === projectToday && <small>Сегодня</small>}</h3>
    <div className="routes-summary">{[...engineers.entries()].map(([engineerId, assignments]) => <article key={engineerId}>
      <header><b>{assignments[0]?.engineer_name || `Инженер #${engineerId}`}</b><span>{assignments.length} заявок · {(assignments.reduce((sum, item) => sum + Number(item.distance_from_previous_meters || 0), 0) / 1000).toFixed(1)} км</span></header>
      {assignments.map((item) => <div key={item.id}><span className="sequence">{item.sequence}</span><b>#{item.job_id} · {item.address}{item.priority_type === 'EMERGENCY' ? ' · Аварийная' : ''}</b><small>{formatTime(item.planned_start)}–{formatTime(item.planned_finish)}</small></div>)}
    </article>)}</div>
    <RoutesMap result={mapResult} />
  </section>
}

export default function DynamicPlanningPage({ projectId, notify, ownerMode = false }) {
  const [planningContext, setPlanningContext] = useState(null)
  const [readiness, setReadiness] = useState(null)
  const [versions, setVersions] = useState([])
  const [plan, setPlan] = useState({ version: null, assignments: [], changes: [] })
  const [selectedVersionId, setSelectedVersionId] = useState(null)
  const [event, setEvent] = useState(null)
  const [view, setView] = useState('routes')
  const [busy, setBusy] = useState(false)
  const base = ownerMode ? `/api/projects/${projectId}/planning` : '/api/project/planning'
  const projectToday = planningContext?.planning_date || null

  const loadVersions = async (quiet = false) => {
    try {
      const value = await api(`${base}/versions?limit=50`)
      setVersions(safeArray(value?.items))
    } catch (error) { if (!quiet) notify(error.message, 'error') }
  }
  const loadCurrent = async (quiet = false) => {
    try {
      const value = await api(`${base}/current`)
      if (selectedVersionId === null) setPlan(value || { version: null, assignments: [], changes: [] })
      return value
    } catch (error) { if (!quiet) notify(error.message, 'error'); return null }
  }
  const openVersion = async (id) => {
    try { setPlan(await api(`${base}/versions/${id}`)); setSelectedVersionId(id) }
    catch (error) { notify(error.message, 'error') }
  }
  const openCurrent = async () => { setSelectedVersionId(null); const value = await api(`${base}/current`); setPlan(value || { version: null, assignments: [], changes: [] }) }
  const loadEvent = async (id, quiet = false) => {
    try { const value = await api(`${base}/events/${id}`); setEvent(value); return value }
    catch (error) { if (!quiet) notify(error.message, 'error'); return null }
  }

  useEffect(() => {
    setPlan({ version: null, assignments: [], changes: [] }); setSelectedVersionId(null); setEvent(null); setPlanningContext(null); setReadiness(null)
    void loadVersions(); void loadCurrent()
    api(`/api/projects/${projectId}/planning/context`).then((value) => {
      setPlanningContext(value)
      if (ownerMode) setReadiness({ ready: true, problems: [] })
      else api(`/api/project/planning/readiness?planning_date=${value.planning_date}`).then(setReadiness).catch((error) => notify(error.message, 'error'))
    }).catch((error) => notify(error.message, 'error'))
    const storedEventId = window.sessionStorage.getItem('route-app:last-planning-event')
    if (storedEventId) void loadEvent(storedEventId, true).then((value) => { if (!value) window.sessionStorage.removeItem('route-app:last-planning-event') })
  }, [projectId, ownerMode])

  useEffect(() => {
    const timer = window.setInterval(() => { void loadVersions(true); void loadCurrent(true) }, 15000)
    return () => window.clearInterval(timer)
  }, [base, selectedVersionId])

  useEffect(() => {
    if (!event || !activeEventStates.has(event.state)) return undefined
    const timer = window.setInterval(async () => {
      const value = await loadEvent(event.id, true)
      if (value && !activeEventStates.has(value.state)) {
        window.clearInterval(timer); void loadVersions(true); setSelectedVersionId(null)
        const current = await api(`${base}/current`); setPlan(current || { version: null, assignments: [], changes: [] })
        notify(value.state === 'PUBLISHED' ? `Опубликована новая версия плана #${current?.version?.version_number || ''}` : `Планирование завершилось ошибкой: ${eventErrorText(value)}`, value.state === 'FAILED' ? 'error' : 'info')
      }
    }, 2000)
    return () => window.clearInterval(timer)
  }, [event?.id, event?.state, base])

  async function calculate() {
    setBusy(true)
    try {
      const started = await api(`${base}/events/manual`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() } })
      window.sessionStorage.setItem('route-app:last-planning-event', String(started.planning_event_id))
      await loadEvent(started.planning_event_id)
      notify(`Перепланирование #${started.planning_event_id} поставлено в обработку`)
    } catch (error) { notify(error.message, 'error') } finally { setBusy(false) }
  }

  const groupedAssignments = useMemo(() => {
    const days = new Map()
    safeArray(plan.assignments).forEach((item) => {
      if (!days.has(item.planning_date)) days.set(item.planning_date, new Map())
      const engineers = days.get(item.planning_date)
      if (!engineers.has(item.engineer_id)) engineers.set(item.engineer_id, [])
      engineers.get(item.engineer_id).push(item)
    })
    return [...days.entries()]
  }, [plan.assignments])
  const unassigned = safeArray(plan.version?.unassigned_jobs)
  const metrics = plan.version?.metrics || {}
  const routeMetrics = plan.route_metrics || {}
  const currentVersionId = versions.find((item) => item.is_current)?.id

  return <>
    <PageHeader eyebrow="Динамическое планирование" title="Планирование" subtitle="Новые заявки автоматически перестраивают допустимую часть маршрутов; весь многодневный план публикуется одной версией." actions={<>{!ownerMode && <PlanningConfig notify={notify} />}<Button icon="refresh" disabled={busy || readiness?.ready === false || activeEventStates.has(event?.state)} onClick={calculate}>{busy ? 'Запускаем…' : activeEventStates.has(event?.state) ? 'Планирование выполняется…' : 'Пересчитать и опубликовать'}</Button></>} />
    <section className="cascade-intro"><div><small>Текущая дата проекта</small><b>{formatDate(projectToday)}</b><span>Определяется часовым поясом проекта.</span></div><div><small>Публикация</small><b>Весь горизонт одной версией</b><span>Ручного подтверждения отдельных дней больше нет.</span></div><div><small>Актуальная версия</small><b>{plan.version ? `Версия ${plan.version.version_number}` : 'Ещё не опубликована'}</b><span>{plan.version ? formatDateTime(plan.version.published_at) : 'Запустите первый расчёт.'}</span></div><div className={`readiness ${readiness?.ready ? 'ready' : 'not-ready'}`}><span>{readiness?.ready ? '✓' : '!'}</span><div><b>{readiness?.ready ? 'Данные готовы' : 'Нужно подготовить данные'}</b>{readiness?.problems?.map((item) => <small key={item.code}>{item.message}</small>)}</div></div></section>
    <EventProgress event={event} />
    <div className="planning-grid cascade-grid"><section className="table-card run-list"><header><h2>Версии плана</h2><span>{versions.length}</span></header>{versions.length ? <><button className={selectedVersionId === null ? 'active' : ''} onClick={openCurrent}><span><b>Текущая версия</b><small>Автоматически обновляется</small></span>{plan.version && selectedVersionId === null && <Badge status="PUBLISHED">#{plan.version.version_number}</Badge>}</button>{versions.map((item) => <button key={item.id} className={selectedVersionId === item.id ? 'active' : ''} onClick={() => openVersion(item.id)}><span><b>Версия {item.version_number}</b><small>{formatDateTime(item.published_at)}</small></span><span><Badge status={item.is_current ? 'PUBLISHED' : 'SUPERSEDED'}>{item.is_current ? 'Текущая' : 'Архив'}</Badge><small>{triggerLabels[item.trigger_source] || item.trigger_source}</small></span></button>)}</> : <Empty title="Версий пока нет" text="Запустите первый расчёт или создайте новую заявку." />}</section>
      <section className="cascade-result">{plan.version ? <><div className="result-head"><div><span className="eyebrow">{plan.version.id === currentVersionId ? 'Опубликованный план' : 'Архивная версия'}</span><h2>Версия {plan.version.version_number}</h2><p>{triggerLabels[plan.version.trigger_source] || plan.version.trigger_source} · {formatDateTime(plan.version.published_at)}</p>{metrics.feasible_time_limit && <Badge status="PENDING">Допустимый план, оптимальность не доказана</Badge>}</div><Badge status={plan.version.is_current ? 'PUBLISHED' : 'SUPERSEDED'}>{plan.version.is_current ? 'Текущая' : 'Архив'}</Badge></div><div className="mini-stats"><div><small>Назначено</small><b>{safeArray(plan.assignments).length}</b></div><div><small>Инженеров</small><b>{routeMetrics.active_engineers ?? '—'}</b></div><div><small>Общий пробег</small><b>{routeMetrics.total_distance_meters != null ? `${(routeMetrics.total_distance_meters / 1000).toFixed(1)} км` : '—'}</b></div><div><small>Макс. маршрут</small><b>{routeMetrics.maximum_route_distance_meters != null ? `${(routeMetrics.maximum_route_distance_meters / 1000).toFixed(1)} км` : '—'}</b></div><div><small>Не назначено</small><b>{unassigned.length}</b></div><div><small>Изменений</small><b>{safeArray(plan.changes).length}</b></div><div><small>Обработано дней</small><b>{metrics.processed_days ?? '—'}</b></div></div><div className="cascade-tabs"><button className={view === 'routes' ? 'active' : ''} onClick={() => setView('routes')}>Маршруты и карта</button><button className={view === 'changes' ? 'active' : ''} onClick={() => setView('changes')}>Изменения</button><button className={view === 'unassigned' ? 'active' : ''} onClick={() => setView('unassigned')}>Не назначено</button></div>{view === 'routes' && <div className="version-routes">{groupedAssignments.length ? groupedAssignments.map(([date, engineers]) => <VersionDay key={date} date={date} engineers={engineers} projectToday={projectToday} />) : <Empty title="Назначений нет" text="В этой версии нет опубликованных маршрутов." />}</div>}{view === 'changes' && <div className="plan-change-list">{safeArray(plan.changes).length ? plan.changes.map((item) => { const changedFields = changedAssignmentFields(item.old_assignment, item.new_assignment); return <article key={item.id}><div><b>Заявка #{item.job_id}</b><small>{changeReasonLabels[item.reason] || item.reason}</small></div><Badge status={item.change_type}>{changeLabels[item.change_type] || item.change_type}</Badge><p>{assignmentText(item.old_assignment)} → {assignmentText(item.new_assignment)}</p>{changedFields.length > 0 && <ul className="assignment-diff">{changedFields.map((field) => <li key={field}>{field}</li>)}</ul>}</article> }) : <Empty title="Изменений нет" text="Это первая версия либо назначения совпали с предыдущей версией." />}</div>}{view === 'unassigned' && <div className="batch-backlog">{unassigned.length ? unassigned.map((item) => <article key={item.job_id}><div><b>Заявка #{item.job_id}</b><small>SLA: {formatDate(item.sla_date)}</small></div><Badge status="PENDING">Не назначена</Badge><p>{reasonLabels[item.primary_reason_code] || item.primary_reason_code || 'Нет допустимого назначения'}</p>{item.sla_risk && <span>Есть риск нарушения SLA</span>}</article>) : <Empty title="Все заявки назначены" text="В опубликованной версии нет неназначенных заявок." />}</div>}</> : <Empty title="Опубликованного плана пока нет" text="Создайте заявку или запустите ручной расчёт. После завершения весь горизонт опубликуется автоматически." />}</section></div>
  </>
}
