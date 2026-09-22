import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api.js'
import PlanningConfig from './PlanningConfig.jsx'
import { matchesPlanningFilters, planningDaySummary, readinessTarget, selectPlanningDate } from './planningView.js'
import { Badge, Button, Empty, PageHeader, formatDate, formatDateTime, formatTime } from './ui.jsx'

const RoutesMap = React.lazy(() => import('./RoutesMap.jsx'))
const safeArray = (value) => Array.isArray(value) ? value : []
const activeStates = new Set(['PENDING', 'RUNNING'])
const statusLabels = { NEW: 'Новая', IN_PROGRESS: 'В работе', COMPLETED: 'Выполнена', CANCELLED: 'Отменена' }
const triggerLabels = { MANUAL: 'Вручную', NIGHTLY: 'Ночью', JOB_CREATED: 'Новая заявка', IMPORT: 'Импорт заявок', JOB_CANCELLED: 'Отмена заявки', ENGINEER_AVAILABILITY_LOST: 'Изменение доступности инженера', ENGINEER_AVAILABILITY_RESTORED: 'Изменение доступности инженера', COALESCED: 'Несколько изменений' }
const resultLabels = { SUCCESS: 'Успешный результат', PARTIAL: 'Частичный результат', FEASIBLE_TIME_LIMIT: 'Допустимый план по лимиту времени' }

function emitPlanningEvent(name, detail = {}) {
  window.dispatchEvent(new CustomEvent('route-app:planning-event', { detail: { name, ...detail } }))
}
function dayDate(value) { return new Date(`${value}T00:00:00`) }
function weekday(value) { return new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(dayDate(value)).replace('.', '') }
function dayMonth(value) { return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(dayDate(value)).replace('.', '') }
function pluralJobs(value) { return `${value} ${value % 10 === 1 && value % 100 !== 11 ? 'заявка' : value % 10 >= 2 && value % 10 <= 4 && (value % 100 < 10 || value % 100 >= 20) ? 'заявки' : 'заявок'}` }

function Readiness({ value, onNavigate }) {
  const [open, setOpen] = useState(false)
  if (!value) return <div className="board-readiness-wrap"><button disabled className="board-readiness pending"><span>…</span>Проверяем данные</button></div>
  const ready = value?.ready !== false
  return <div className="board-readiness-wrap">
    <button className={`board-readiness ${ready ? 'ready' : 'not-ready'}`} aria-expanded={open} onClick={() => setOpen(!open)}><span>{ready ? '✓' : '!'}</span>{ready ? 'Данные готовы' : 'Данные не готовы'}</button>
    {open && <div className="readiness-popover">{ready ? <p>Все обязательные данные доступны для расчёта.</p> : <><b>Что нужно исправить</b>{safeArray(value?.problems).map((item) => <button type="button" key={item.code} onClick={() => { setOpen(false); const settings = item.section === 'parameters' ? document.getElementById('planning-parameters') : null; if (settings) settings.click(); else onNavigate?.(item.section) }}>{item.message}<span>→</span></button>)}</>}</div>}
  </div>
}

function RunBanner({ run, hasPlan, onRetry, timeZone }) {
  if (!run) return null
  if (run.state === 'FAILED') return <section className="board-alert error"><div><b>Расчёт завершился ошибкой</b><span>{run.error_message || 'Не удалось завершить расчёт'} · {formatDateTime(run.finished_at || run.started_at, timeZone)}</span></div><Button kind="secondary" onClick={onRetry}>Повторить</Button></section>
  if (!activeStates.has(run.state)) return null
  return <section className="board-run-progress"><div><span className="spinner" /><div><b>{run.phase || 'Подготовка данных'}</b><span>Запущено {formatDateTime(run.started_at, timeZone)}{hasPlan ? ' · Показан предыдущий план до завершения расчёта' : ''}</span></div></div><i /></section>
}

function DateStrip({ days, selected, selectedDay, today, onSelect }) {
  return <div className="planning-date-strip" role="tablist" aria-label="Дни планирования">{safeArray(days).map((item) => {
    const counts = planningDaySummary(item, selected, selectedDay)
    return <button key={item.date} role="tab" aria-selected={selected === item.date} className={selected === item.date ? 'selected' : ''} onClick={() => onSelect(item.date)}>
      <span>{weekday(item.date)}{item.date === today && <em>Сегодня</em>}</span><strong>{dayMonth(item.date)}</strong>
      {counts.moved == null
        ? <small><b>{counts.assigned}</b> назначено · <b>{counts.unassignedToday}</b> не на этот день</small>
        : <><small><b>{counts.assigned}</b> назначено · <b>{counts.moved}</b> перенесено</small><small><b>{counts.horizon}</b> без назначения в горизонте</small></>}
      {item.cancelled_count > 0 && <small className="cancel-count">{item.cancelled_count} отменено</small>}
    </button>
  })}</div>
}

function ResultContext({ version, timeZone }) {
  if (!version) return null
  const publicationStatus = version.status === 'FEASIBLE_TIME_LIMIT' ? 'SUCCESS' : version.status
  const optimizationLimited = version.optimization_limited || version.status === 'FEASIBLE_TIME_LIMIT'
  return <section className="plan-context"><div><span>Последняя публикация</span><b>{formatDateTime(version.published_at, timeZone)}</b></div><div><span>Причина запуска</span><b>{triggerLabels[version.trigger] || version.trigger}</b></div>{version.initiator && <div><span>Инициатор</span><b>{version.initiator}</b></div>}<div><span>Версия плана</span><b>Версия {version.number}</b></div><div><span>Статус</span><b>{resultLabels[publicationStatus] || publicationStatus}</b></div>{optimizationLimited && <div><span>Оптимизация</span><b>Допустимый план, оптимальность не доказана</b></div>}</section>
}

function JobCard({ job, onOpen, cancelled = false, timeZone }) {
  const action = job.outcome === 'UNASSIGNED_TODAY' ? job.later_assignment_date ? 'Почему перенесена' : 'Почему не назначена' : cancelled ? 'Подробнее' : 'Почему назначена'
  return <button type="button" className={`route-job-card ${cancelled ? 'cancelled' : ''} ${job.overdue ? 'overdue' : ''}`} onClick={(event) => onOpen(job, event.currentTarget)}>
    <header>{job.route_position && <span className="route-position">{job.route_position}</span>}<Badge status={job.status}>{statusLabels[job.status] || job.status}</Badge>{job.priority_type === 'EMERGENCY' && <span className="emergency-label">Авария</span>}</header>
    {!cancelled && job.planned_start && <div className="job-time">{formatTime(job.planned_start, timeZone)}–{formatTime(job.planned_end, timeZone)}</div>}
    <div className="job-address" title={job.address}>{job.address || 'Адрес не сохранён'}</div>
    <div className="job-type">{job.work_type || 'Тип работ не указан'} · {job.duration_min || '—'} мин</div>
    <div className="job-sla"><span>SLA {formatDate(job.sla_date)}</span>{job.overdue && <b>Просрочена</b>}</div>
    {!!safeArray(job.required_equipment).length && <div className="job-equipment">{job.required_equipment.map((item) => item.name).join(', ')}</div>}
    {job.later_assignment_date && <div className="moved-label">Перенесена на {formatDate(job.later_assignment_date)}</div>}
    {job.final_horizon_outcome && <div className="horizon-label">Не назначена в горизонте</div>}
    {cancelled && job.cancelled_at && <div className="cancelled-meta">Отменена {formatDateTime(job.cancelled_at, timeZone)}{job.cancelled_by ? ` · ${job.cancelled_by}` : ''}</div>}
    <p className="job-reason">{job.primary_reason?.text || 'Подробная причина недоступна'}</p>
    <span className="job-action">{action} <i>→</i></span>
  </button>
}

function TravelLeg({ job }) {
  const travel = Number(job.travel_from_previous_min) > 0 ? Number(job.travel_from_previous_min) : null
  const meters = Number(job.distance_from_previous_meters) > 0 ? Number(job.distance_from_previous_meters) : null
  if (travel == null && meters == null) return null
  const distance = meters == null ? null : meters >= 1000 ? `${(meters / 1000).toFixed(1)} км` : `${meters} м`
  return <div className="travel-leg"><i /><span>{travel != null ? `${travel} мин` : ''}{distance ? `${travel != null ? ' · ' : ''}${distance}` : ''}</span></div>
}

function EngineerColumn({ column, filterJob, onOpen, timeZone }) {
  const jobs = safeArray(column.jobs).filter(filterJob)
  const cancelled = safeArray(column.cancelled_jobs).filter(filterJob)
  const hours = column.shift_start ? `${formatTime(column.shift_start)}–${formatTime(column.shift_end)}` : 'Смена не задана'
  return <section className="route-column" aria-labelledby={`engineer-${column.engineer_id}`}>
    <header className="route-column-head"><div><h2 id={`engineer-${column.engineer_id}`} title={column.name}>{column.name}</h2>{column.unavailable && <Badge status="CANCELLED">Недоступен</Badge>}</div><span>{hours}</span><small>{pluralJobs(column.active_count)} · {column.route_duration_min || 0} мин{column.distance_meters ? ` · ${(column.distance_meters / 1000).toFixed(1)} км` : ''}</small></header>
    <div className="route-column-body">{jobs.length ? jobs.map((job, index) => <React.Fragment key={job.job_id}>{index > 0 && <TravelLeg job={job} />}<JobCard job={job} onOpen={onOpen} timeZone={timeZone} /></React.Fragment>) : <div className="column-empty">Нет назначенных заявок</div>}{cancelled.length > 0 && <div className="cancelled-group"><h3>Отменённые</h3>{cancelled.map((job) => <JobCard key={job.job_id} job={job} onOpen={onOpen} cancelled timeZone={timeZone} />)}</div>}</div>
  </section>
}

function UnassignedColumn({ value, filterJob, onOpen, timeZone }) {
  const moved = safeArray(value?.moved).filter(filterJob)
  const horizon = safeArray(value?.horizon).filter(filterJob)
  return <section className="route-column unassigned-column" aria-labelledby="unassigned-title"><header className="route-column-head"><div><h2 id="unassigned-title">Перенесённые и неназначенные</h2></div><span>Результат выбранного дня</span><small>{pluralJobs(moved.length + horizon.length)}</small></header><div className="route-column-body">
    <div className="unassigned-group"><h3>Перенесены <span>{moved.length}</span></h3>{moved.length ? moved.map((job) => <JobCard key={job.job_id} job={job} onOpen={onOpen} timeZone={timeZone} />) : <p>Нет перенесённых заявок</p>}</div>
    <div className="unassigned-group"><h3>Не назначены в горизонте <span>{horizon.length}</span></h3>{horizon.length ? horizon.map((job) => <JobCard key={job.job_id} job={job} onOpen={onOpen} timeZone={timeZone} />) : <p>Нет неназначенных заявок</p>}</div>
  </div></section>
}

function ExplanationDrawer({ value, loading, updated, onClose, returnFocus, timeZone }) {
  const closeRef = useRef(null)
  const drawerRef = useRef(null)
  useEffect(() => {
    closeRef.current?.focus()
    const keydown = (event) => {
      if (event.key === 'Escape') { onClose(); return }
      if (event.key !== 'Tab') return
      const focusable = [...(drawerRef.current?.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') || [])].filter((item) => !item.disabled)
      if (!focusable.length) return
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', keydown)
    return () => { window.removeEventListener('keydown', keydown); returnFocus?.focus() }
  }, [onClose, returnFocus])
  const job = value?.job
  const title = job?.outcome === 'UNASSIGNED_TODAY' ? job?.later_assignment_date ? 'Почему перенесена' : 'Почему не назначена' : job?.outcome === 'CANCELLED' ? 'Сведения об отмене' : 'Почему назначена'
  return <div className="explanation-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside ref={drawerRef} className="explanation-drawer" role="dialog" aria-modal="true" aria-labelledby="explanation-title"><header><div><span>Объяснение решения</span><h2 id="explanation-title">{title}</h2></div><button ref={closeRef} aria-label="Закрыть" onClick={onClose}>×</button></header>{updated && <div className="drawer-updated">План обновлён</div>}{loading ? <div className="drawer-loading">Загружаем сохранённое объяснение…</div> : value && job ? <div className="drawer-content">
    {job.current_data_changed && <div className="drawer-updated">Текущие данные заявки отличаются от данных, использованных в этом расчёте.</div>}
    <section className="drawer-job"><Badge status={job.status}>{statusLabels[job.status] || job.status}</Badge><h3>{job.address || 'Адрес не сохранён'}</h3><p>{job.work_type || 'Тип работ не сохранён'} · {job.duration_min ?? '—'} мин · SLA {formatDate(job.sla_date)}</p></section>
    {value.assignment && <section><h3>Назначение</h3><dl><div><dt>Инженер</dt><dd>{value.assignment.engineer_name}</dd></div><div><dt>Дата и позиция</dt><dd>{formatDate(value.planning_date)} · №{value.assignment.position}</dd></div><div><dt>Плановое время</dt><dd>{formatTime(value.assignment.planned_start, timeZone)}–{formatTime(value.assignment.planned_end, timeZone)}</dd></div></dl></section>}
    {!!safeArray(value.eligibility).length && <section><h3>Допустимость</h3><ul className="check-list">{value.eligibility.map((item) => <li key={item.code}><span>✓</span>{item.text}</li>)}</ul></section>}
    {!!safeArray(value.priority_factors).length && <section><h3>Факторы приоритета</h3>{value.priority_factors.map((item) => <p className="explanation-factor" key={item.code}>{item.text}</p>)}</section>}
    {(Number(value.route_factors?.travel_from_previous_min) > 0 || Number(value.route_factors?.distance_from_previous_meters) > 0) && <section><h3>Маршрутные факторы</h3><p className="explanation-factor">{Number(value.route_factors?.travel_from_previous_min) > 0 ? `Добавлено ${value.route_factors.travel_from_previous_min} мин пути` : 'Сохранено расстояние от предыдущей точки'}{Number(value.route_factors?.distance_from_previous_meters) > 0 ? ` · ${value.route_factors.distance_from_previous_meters} м` : ''}</p></section>}
    <section><h3>Результат оптимизации</h3>{safeArray(value.outcome_reasons).map((item) => <p className="outcome-reason" key={item.code}>{item.text}</p>)}</section>
    <details className="technical-details"><summary>Технические компоненты objective</summary><dl><div><dt>Допустимых инженеров</dt><dd>{value.eligible_engineers_count ?? '—'}</dd></div><div><dt>Статус solver</dt><dd>{value.technical?.solver_status || '—'}</dd></div><div><dt>Objective</dt><dd>{value.technical?.objective ?? '—'}</dd></div><div><dt>Drop cost</dt><dd>{value.technical?.drop_cost ?? '—'}</dd></div><div><dt>Travel cost</dt><dd>{value.technical?.travel_cost ?? '—'}</dd></div>{Object.entries(value.technical?.objective_components || {}).map(([key, component]) => <div key={key}><dt>{key}</dt><dd>{String(component ?? '—')}</dd></div>)}</dl></details>
  </div> : <Empty title="Объяснение недоступно" text="Для старой версии плана не сохранились необходимые данные." />}</aside></div>
}

export default function DynamicPlanningPage({ projectId, notify, ownerMode = false, onNavigate }) {
  const base = ownerMode ? `/api/projects/${projectId}/planning` : '/api/project/planning'
  const [board, setBoard] = useState(null)
  const [day, setDay] = useState(null)
  const [selectedDate, setSelectedDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [filters, setFilters] = useState({ search: '', priority: '', status: '', outcome: 'ALL' })
  const [drawer, setDrawer] = useState(null)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [drawerUpdated, setDrawerUpdated] = useState(false)
  const [returnFocus, setReturnFocus] = useState(null)

  async function loadDay(date, versionId, quiet = false) {
    try {
      const value = await api(`${base}/board/${date}${versionId ? `?plan_version_id=${versionId}` : ''}`)
      setDay(value)
      return value
    } catch (error) {
      if (error.code === 'VERSION_CHANGED') {
        const value = await loadBoard(true, date)
        if (value) emitPlanningEvent('planning_version_changed', { plan_version_id: value.plan_version?.id })
        return value
      }
      if (!quiet) notify(error.message, 'error')
      return null
    }
  }

  async function loadBoard(quiet = false, preferredDate = selectedDate) {
    try {
      const value = await api(`${base}/board?days=7`)
      const nextDate = selectPlanningDate(value.days, preferredDate, value.project_date)
      const previousVersion = board?.plan_version?.id
      setBoard(value)
      if (!quiet) emitPlanningEvent('planning_board_opened', { project_id: projectId, plan_version_id: value.plan_version?.id })
      setSelectedDate(nextDate)
      const nextDay = nextDate === value.project_date ? value.selected_day : await loadDay(nextDate, value.plan_version?.id, true)
      if (nextDate === value.project_date) setDay(nextDay)
      if (drawer && previousVersion && value.plan_version?.id !== previousVersion) {
        setDrawerUpdated(true)
        void openExplanation(drawer.job, returnFocus, nextDay?.day_result_id)
      }
      return value
    } catch (error) {
      if (!quiet) notify(error.message, 'error')
      return null
    } finally { if (!quiet) setLoading(false) }
  }

  useEffect(() => {
    setBoard(null); setDay(null); setSelectedDate(''); setLoading(true); setDrawer(null)
    void loadBoard(false, '')
  }, [projectId, ownerMode])

  useEffect(() => {
    const active = activeStates.has(board?.active_run?.state)
    const timer = window.setInterval(() => void loadBoard(true), active ? 2000 : 15000)
    return () => window.clearInterval(timer)
  }, [base, selectedDate, board?.active_run?.state, board?.plan_version?.id])

  async function selectDate(value) {
    setSelectedDate(value)
    if (value === board?.project_date) setDay(board.selected_day)
    else { setDay(null); await loadDay(value, board?.plan_version?.id) }
    emitPlanningEvent('planning_day_selected', { project_id: projectId, planning_date: value, plan_version_id: board?.plan_version?.id })
  }

  async function calculate() {
    setBusy(true)
    try {
      const started = await api(`${base}/events/manual`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() } })
      setBoard((current) => ({ ...current, active_run: { id: started.planning_event_id, state: started.state, phase: 'Подготовка данных', started_at: new Date().toISOString() } }))
      emitPlanningEvent('planning_run_started', { project_id: projectId, event_id: started.planning_event_id, reused: !!started.reuse })
      notify(started.reuse ? 'Уже выполняющийся расчёт открыт' : 'Расчёт маршрутов запущен')
    } catch (error) { notify(error.message, 'error') } finally { setBusy(false) }
  }

  async function openExplanation(job, trigger, explicitResultId = null) {
    setReturnFocus(trigger || returnFocus)
    setDrawer({ job })
    setDrawerLoading(true)
    const resultId = explicitResultId || day?.day_result_id
    emitPlanningEvent('planning_job_details_opened', { project_id: projectId, day_result_id: resultId, job_id: job.job_id })
    if (!resultId) { setDrawer({ job }); setDrawerLoading(false); return }
    try { setDrawer(await api(`${base}/day-results/${resultId}/jobs/${job.job_id}/explanation`)) }
    catch (error) { notify(error.message, 'error'); setDrawer({ job }) }
    finally { setDrawerLoading(false) }
  }

  const allCards = useMemo(() => [
    ...safeArray(day?.engineer_columns).flatMap((column) => [...safeArray(column.jobs), ...safeArray(column.cancelled_jobs)]),
    ...safeArray(day?.unassigned?.moved), ...safeArray(day?.unassigned?.horizon),
  ], [day])
  const filterJob = (job) => matchesPlanningFilters(job, filters)
  const visibleCount = allCards.filter(filterJob).length
  const filtered = filters.search || filters.priority || filters.status || filters.outcome !== 'ALL'
  const activeRun = board?.active_run
  const calculating = activeStates.has(activeRun?.state)
  const permanentlyUnassigned = Number(board?.plan_version?.unassigned_count || 0)

  return <>
    <PageHeader eyebrow="Маршруты на семь дней" title="Планирование" subtitle="Актуальный опубликованный план и объяснение каждого результата." actions={<><PlanningConfig notify={notify} endpoint={ownerMode ? `/api/projects/${projectId}/planning-config` : '/api/project/planning-config'} /><Button icon="refresh" disabled={loading || !board || busy || calculating || board?.readiness?.ready === false} onClick={calculate}>{calculating ? 'Расчёт выполняется' : 'Рассчитать маршруты'}</Button><Readiness value={board?.readiness} onNavigate={(section) => onNavigate?.(readinessTarget(section, ownerMode))} /></>} />
    <RunBanner run={activeRun} hasPlan={!!board?.plan_version} onRetry={calculate} timeZone={board?.timezone} />
    {board?.plan_version?.status === 'PARTIAL' && <section className="board-alert warning"><div><b>{permanentlyUnassigned ? `${pluralJobs(permanentlyUnassigned)} не удалось назначить в горизонте` : 'Часть заявок не назначена'}</b><span>Валидная часть плана опубликована; конкретные причины указаны в последней колонке.</span></div></section>}
    {loading ? <div className="board-loading"><span className="spinner" /> Загружаем актуальный план…</div> : <>
      <DateStrip days={board?.days} selected={selectedDate} selectedDay={day} today={board?.project_date} onSelect={selectDate} />
      <ResultContext version={board?.plan_version} timeZone={board?.timezone} />
      {!board?.plan_version ? <Empty title="План ещё не рассчитан" text={board?.readiness?.ready === false ? 'Подготовьте обязательные данные, затем запустите расчёт.' : 'Нажмите «Рассчитать маршруты», чтобы опубликовать первый план.'} action={board?.readiness?.ready !== false && <Button onClick={calculate}>Рассчитать маршруты</Button>} /> : <>
        <section className="board-filters"><label className="board-search"><span>⌕</span><input aria-label="Поиск по адресу и типу работ" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Адрес или тип работ" /></label><select aria-label="Приоритет" value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value })}><option value="">Обычная / Авария</option><option value="NORMAL">Обычная</option><option value="EMERGENCY">Авария</option></select><select aria-label="Статус заявки" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Все статусы</option>{safeArray(day?.available_filters?.statuses).map((status) => <option key={status} value={status}>{statusLabels[status] || status}</option>)}</select><select aria-label="Результат" value={filters.outcome} onChange={(event) => setFilters({ ...filters, outcome: event.target.value })}><option value="ALL">Все</option><option value="ASSIGNED">Назначенные</option><option value="UNASSIGNED_TODAY">Перенесённые и неназначенные</option></select>{filtered && <span className="shown-count">Показано {visibleCount} из {allCards.length}</span>}</section>
        {!day ? <div className="board-loading"><span className="spinner" /> Загружаем день…</div> : !day.result_available ? <Empty title="Для этой даты нет результата расчёта" text="Дата не рассчитывалась в актуальной версии плана." /> : <><Suspense fallback={<div className="map-loading"><span className="spinner" /> Загружаем карту…</div>}><RoutesMap day={day} planningDate={selectedDate} timeZone={board?.timezone} /></Suspense><div className="route-board"><div className="route-board-scroll">{safeArray(day.engineer_columns).map((column) => <EngineerColumn key={column.engineer_id} column={column} filterJob={filterJob} onOpen={openExplanation} timeZone={board?.timezone} />)}<UnassignedColumn value={day.unassigned} filterJob={filterJob} onOpen={openExplanation} timeZone={board?.timezone} /></div></div></>}
      </>}
    </>}
    {drawer && <ExplanationDrawer value={drawer} loading={drawerLoading} updated={drawerUpdated} onClose={() => { setDrawer(null); setDrawerUpdated(false) }} returnFocus={returnFocus} timeZone={board?.timezone} />}
  </>
}
