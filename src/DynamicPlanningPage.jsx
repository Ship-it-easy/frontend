import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api.js'
import { baselineHighlights } from './baselineComparisonView.js'
import PlanningConfig from './PlanningConfig.jsx'
import { buildPlanComparison, matchesPlanningFilters, planChangeExplanation, planChangeTitle, planComparisonCause, planningDaySummary, readinessTarget, selectPlanningDate, unassignedChangeExplanation } from './planningView.js'
import { Badge, Button, Empty, PageHeader, formatDate, formatDateTime, formatPriority, formatTime, priorityLabels } from './ui.jsx'

const RoutesMap = React.lazy(() => import('./RoutesMap.jsx'))
const safeArray = (value) => Array.isArray(value) ? value : []
const activeStates = new Set(['PENDING', 'RUNNING'])
const baselineComparisonEnabled = import.meta.env.VITE_BASELINE_COMPARISON_ENABLED !== 'false'
const statusLabels = { NEW: 'Новая', IN_PROGRESS: 'В работе', COMPLETED: 'Выполнена', CANCELLED: 'Отменена' }
const triggerLabels = { MANUAL: 'Вручную', NIGHTLY: 'Ночью', JOB_CREATED: 'Новая заявка', IMPORT: 'Импорт заявок', JOBS_IMPORTED: 'Импорт заявок', JOB_CANCELLED: 'Отмена заявки', WORK_TYPE_PRIORITY_CHANGED: 'Изменение приоритета типа работ', ENGINEER_AVAILABILITY_LOST: 'Изменение доступности инженера', ENGINEER_AVAILABILITY_RESTORED: 'Изменение доступности инженера', COALESCED: 'Несколько изменений' }
const resultLabels = { SUCCESS: 'Успешный результат', PARTIAL: 'Частичный результат', FEASIBLE_TIME_LIMIT: 'Допустимый план по лимиту времени' }

function emitPlanningEvent(name, detail = {}) {
  window.dispatchEvent(new CustomEvent('route-app:planning-event', { detail: { name, ...detail } }))
}
function dayDate(value) { return new Date(`${value}T00:00:00`) }
function weekday(value) { return new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(dayDate(value)).replace('.', '') }
function dayMonth(value) { return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(dayDate(value)).replace('.', '') }
function pluralJobs(value) { return `${value} ${value % 10 === 1 && value % 100 !== 11 ? 'заявка' : value % 10 >= 2 && value % 10 <= 4 && (value % 100 < 10 || value % 100 >= 20) ? 'заявки' : 'заявок'}` }
function isSingular(value) { return value % 10 === 1 && value % 100 !== 11 }
function isFew(value) { return value % 10 >= 2 && value % 10 <= 4 && (value % 100 < 10 || value % 100 >= 20) }
function unchangedAssignmentsLabel(value) { return `Почему ${value} ${isSingular(value) ? 'назначение не изменилось' : `${isFew(value) ? 'назначения' : 'назначений'} не изменились`}` }
function unchangedUnassignedLabel(value) { return `Почему ${value} ${isSingular(value) ? 'неназначенная заявка не изменилась' : `${isFew(value) ? 'неназначенные заявки' : 'неназначенных заявок'} не изменились`}` }

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

function signedMetric(value, formatter = (item) => String(item)) {
  if (value == null) return '—'
  const number = Number(value)
  if (Number.isNaN(number)) return '—'
  if (number === 0) return formatter(0)
  return `${number > 0 ? '+' : '−'}${formatter(Math.abs(number))}`
}

function hitRate(value) {
  if (value == null) return '—'
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(Number(value))}%`
}

function BaselineLoading({ text }) {
  return <section className="baseline-comparison loading" aria-live="polite"><div className="baseline-loading-copy"><span className="spinner" /><span>{text}</span></div><div className="baseline-skeleton" aria-hidden="true"><i /><i /><i /><i /></div></section>
}

function BaselineComparison({ value, loading, error, onRetry, onExpand, previousPlan }) {
  if (loading) return <BaselineLoading text="Считаем сравнение с FIFO…" />
  if (error) return <section className="baseline-comparison state error"><div><span>Сравнение с базовым планом</span><b>Не удалось загрузить сравнение</b><small>{error}</small></div><Button kind="secondary" onClick={onRetry}>Повторить</Button></section>
  if (!value) return null
  if (value.status === 'NO_DAILY_RESULT') return <section className="baseline-comparison state"><div><span>Сравнение с базовым планом</span><b>Для выбранной даты нет рассчитанного плана</b><small>Выберите день с опубликованным результатом или запустите планирование.</small></div></section>
  if (activeStates.has(value.status)) return <BaselineLoading text="Сравнение рассчитывается…" />
  if (value.status === 'NOT_AVAILABLE_LEGACY_PLAN') return <section className="baseline-comparison state"><div><span>Сравнение с базовым планом</span><b>Для этой версии сравнение не рассчитывалось</b><small>Оно появится после следующего расчёта маршрутов.</small></div></section>
  if (value.status === 'NOT_APPLICABLE_SHIFT_STARTED') return <section className="baseline-comparison state"><div><span>Сравнение с базовым планом</span><b>Базовый план не показан: рабочая смена уже началась</b><small>Сравнение создаётся только при расчёте до начала первой смены. Этот план рассчитан позже, поэтому корректно сравнить его с базовым вариантом нельзя.</small></div></section>
  if (value.status === 'FAILED') {
    const noRoad = value.failure_code === 'BASELINE_ROUTE_UNAVAILABLE'
    return <section className="baseline-comparison state error"><div><span>Сравнение с базовым планом</span><b>{noRoad ? 'Для базового маршрута не найдена дорога' : 'Сравнение временно недоступно'}</b><small>{value.failure_message || (noRoad ? 'Нужный участок отсутствует в сохранённом дорожном снимке.' : 'Дорожные данные для базового маршрута пока недоступны.')}{noRoad ? ' Проверьте адрес заявки и покрытие дорожной карты.' : value.attempt_count ? ` · попытка ${value.attempt_count} из 3` : ''}</small></div>{!noRoad && (Number(value.attempt_count || 0) < 3 ? <Button kind="secondary" onClick={() => onRetry(value.planning_run_id)}>Повторить</Button> : <small>Лимит повторов исчерпан</small>)}</section>
  }
  if (value.status !== 'READY' || !value.baseline || !value.optimized) return null

  const comparable = value.coverage_comparable === true
  const baseline = value.baseline
  const optimized = value.optimized
  const delta = value.delta || {}
  const wins = baselineHighlights(value, (meters) => formatKilometers(meters, 1))
  const rows = [
    { key: 'assigned', title: 'Назначено заявок', baseline: `${baseline.assigned_jobs_count} из ${baseline.input_jobs_count}`, optimized: `${optimized.assigned_jobs_count} из ${optimized.input_jobs_count}`, delta: signedMetric(delta.assigned_jobs_count) },
    { key: 'windows', title: 'Попали во временное окно', baseline: `${baseline.window_hit_count} из ${baseline.assigned_jobs_count} · ${hitRate(baseline.window_hit_rate)}`, optimized: `${optimized.window_hit_count} из ${optimized.assigned_jobs_count} · ${hitRate(optimized.window_hit_rate)}`, delta: `${signedMetric(delta.window_hit_count)} заявок · ${signedMetric(delta.window_hit_rate, (item) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(item)} п.п.`)}` },
    { key: 'engineers', title: 'Задействовано инженеров', baseline: baseline.active_engineer_count, optimized: optimized.active_engineer_count, delta: signedMetric(delta.active_engineer_count) },
    { key: 'distance', title: 'Общий пробег', baseline: formatKilometers(baseline.total_distance_meters, 1), optimized: formatKilometers(optimized.total_distance_meters, 1), delta: signedMetric(delta.total_distance_meters, (meters) => formatKilometers(meters, 1)) },
  ]
  return <section className="baseline-comparison" aria-labelledby="baseline-comparison-title">
    <header><div><span>Контрольный сценарий</span><h2 id="baseline-comparison-title">Сравнение с базовым планом</h2><p>Заявки по порядку поступления назначаются первому подходящему инженеру. На каждую заявку учитывается норматив и 20 минут дороги.</p></div><div className="baseline-result-note"><details className="baseline-method"><summary>Как считается базовый план</summary><p>{value.methodology}</p><small>Оба варианта используют один снимок данных. Сравнение сохранено вместе с версией плана и не пересчитывается по изменившимся данным.</small></details>{previousPlan && <small>Показано сравнение предыдущей опубликованной версии</small>}{comparable && wins.length > 0 && <strong>Оптимизатор: {wins.join(' · ')}</strong>}{value.calculated_at && <small>Рассчитано {formatDateTime(value.calculated_at, value.timezone)}</small>}</div></header>
    {!comparable && <div className="baseline-comparison-warning"><b>Покрытие различается</b><span>Планы назначили разные наборы заявок. Количество инженеров и пробег показаны справочно и не являются прямой оценкой экономии.</span></div>}
    <div className="baseline-comparison-table" role="table" aria-label="Метрики FIFO и оптимального плана">
      <div className="head" role="row"><span>Метрика</span><span>Базовый план (FIFO)</span><span>Оптимальный план</span><span>Разница</span></div>
      {rows.map((row) => <div key={row.key} role="row" className={!comparable && row.key === 'assigned' ? 'coverage-difference' : ''}><b>{row.title}</b><span>{row.baseline}</span><strong>{row.optimized}</strong><em className={comparable ? 'comparable' : ''}>{row.delta}</em></div>)}
    </div>
    <details className="baseline-engineers" onToggle={(event) => event.currentTarget.open && onExpand(value)}><summary>Пробег по инженерам · Развернуть</summary><div><div className="baseline-engineers-head"><span>Инженер</span><span>Базовый план</span><span>Оптимальный план</span><span>Разница</span></div>{safeArray(value.engineers).map((engineer, index) => <article key={`${engineer.engineer_name}-${index}`}><b>{engineer.engineer_name || `Инженер ${index + 1}`}</b><span>{pluralJobs(engineer.baseline_jobs_count)} · {formatKilometers(engineer.baseline_distance_meters)}</span><span>{pluralJobs(engineer.optimized_jobs_count)} · {formatKilometers(engineer.optimized_distance_meters)}</span><strong>{signedMetric(engineer.delta_distance_meters, formatKilometers)}</strong></article>)}</div></details>
  </section>
}

function JobCard({ job, onOpen, cancelled = false, timeZone }) {
  const action = job.outcome === 'UNASSIGNED_TODAY' ? job.later_assignment_date ? 'Почему перенесена' : 'Почему не назначена' : cancelled ? 'Подробнее' : 'Почему назначена'
  return <button type="button" className={`route-job-card ${cancelled ? 'cancelled' : ''} ${job.overdue ? 'overdue' : ''}`} onClick={(event) => onOpen(job, event.currentTarget)}>
    <header>{job.route_position && <span className="route-position">{job.route_position}</span>}<Badge status={job.status}>{statusLabels[job.status] || job.status}</Badge><Badge status={job.priority}>{formatPriority(job.priority)}</Badge></header>
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
  const outcomeReasons = safeArray(value?.outcome_reasons).length ? value.outcome_reasons : job?.primary_reason ? [job.primary_reason] : []
  const title = job?.outcome === 'UNASSIGNED_TODAY' ? job?.later_assignment_date ? 'Почему перенесена' : 'Почему не назначена' : job?.outcome === 'CANCELLED' ? 'Сведения об отмене' : 'Почему назначена'
  return <div className="explanation-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside ref={drawerRef} className="explanation-drawer" role="dialog" aria-modal="true" aria-labelledby="explanation-title"><header><div><span>Объяснение решения</span><h2 id="explanation-title">{title}</h2></div><button ref={closeRef} aria-label="Закрыть" onClick={onClose}>×</button></header>{updated && <div className="drawer-updated">План обновлён</div>}{loading ? <div className="drawer-loading">Загружаем сохранённое объяснение…</div> : value && job ? <div className="drawer-content">
    {job.current_data_changed && <div className="drawer-updated">Текущие данные заявки отличаются от данных, использованных в этом расчёте.</div>}
    <section className="drawer-job"><Badge status={job.status}>{statusLabels[job.status] || job.status}</Badge><h3>{job.address || 'Адрес не сохранён'}</h3><p>{job.work_type || 'Тип работ не сохранён'} · {job.duration_min ?? '—'} мин · SLA {formatDate(job.sla_date)}</p></section>
    {value.assignment && <section><h3>Назначение</h3><dl><div><dt>Инженер</dt><dd>{value.assignment.engineer_name}</dd></div><div><dt>Дата и позиция</dt><dd>{formatDate(value.planning_date)} · №{value.assignment.position}</dd></div><div><dt>Плановое время</dt><dd>{formatTime(value.assignment.planned_start, timeZone)}–{formatTime(value.assignment.planned_end, timeZone)}</dd></div></dl></section>}
    {!!safeArray(value.eligibility).length && <section><h3>Допустимость</h3><ul className="check-list">{value.eligibility.map((item) => <li key={item.code}><span>✓</span>{item.text}</li>)}</ul></section>}
    {!!safeArray(value.priority_factors).length && <section><h3>Факторы приоритета</h3>{value.priority_factors.map((item) => <p className="explanation-factor" key={item.code}>{item.text}</p>)}</section>}
    {(Number(value.route_factors?.travel_from_previous_min) > 0 || Number(value.route_factors?.distance_from_previous_meters) > 0) && <section><h3>Маршрутные факторы</h3><p className="explanation-factor">{Number(value.route_factors?.travel_from_previous_min) > 0 ? `Добавлено ${value.route_factors.travel_from_previous_min} мин пути` : 'Сохранено расстояние от предыдущей точки'}{Number(value.route_factors?.distance_from_previous_meters) > 0 ? ` · ${value.route_factors.distance_from_previous_meters} м` : ''}</p></section>}
    <section><h3>Результат оптимизации</h3>{outcomeReasons.map((item) => <p className="outcome-reason" key={item.code}>{item.text}</p>)}</section>
    <details className="technical-details"><summary>Технические компоненты objective</summary><dl><div><dt>Допустимых инженеров</dt><dd>{value.eligible_engineers_count ?? '—'}</dd></div><div><dt>Статус solver</dt><dd>{value.technical?.solver_status || '—'}</dd></div><div><dt>Objective</dt><dd>{value.technical?.objective ?? '—'}</dd></div><div><dt>Drop cost</dt><dd>{value.technical?.drop_cost ?? '—'}</dd></div><div><dt>Travel cost</dt><dd>{value.technical?.travel_cost ?? '—'}</dd></div>{Object.entries(value.technical?.objective_components || {}).map(([key, component]) => <div key={key}><dt>{key}</dt><dd>{String(component ?? '—')}</dd></div>)}</dl></details>
  </div> : <Empty title="Объяснение недоступно" text="Для старой версии плана не сохранились необходимые данные." />}</aside></div>
}

function assignmentSnapshot(value, timeZone) {
  if (!value) return 'Не назначена'
  const engineer = value.engineer_name || `Инженер #${value.engineer_id}`
  const start = formatTime(value.planned_start, timeZone)
  const finish = formatTime(value.planned_finish, timeZone)
  const time = start === '—' ? '' : ` · ${start}${finish === '—' ? '' : `–${finish}`}`
  const previousPoint = value.sequence == null ? '' : Number(value.sequence) === 1 ? ' · после старта инженера' : value.previous_job_id != null ? ` · после заявки №${value.previous_job_id}` : ' · после предыдущей заявки'
  const sequence = value.sequence == null ? '' : ` · позиция ${value.sequence}${previousPoint}`
  return `${formatDate(value.planning_date)} · ${engineer}${time}${sequence}`
}

function formatKilometers(meters, minimumFractionDigits = 0) {
  return `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits, maximumFractionDigits: 1 }).format(Number(meters || 0) / 1000)} км`
}

function metricTransition(before, after, formatter, hasPrevious = true) {
  if (!hasPrevious) return formatter(after)
  return `${formatter(before)} → ${formatter(after)}`
}

function metricDelta(value, formatter) {
  const number = Number(value || 0)
  if (!number) return 'без изменений'
  return `${number > 0 ? '+' : '−'}${formatter(Math.abs(number))}`
}

function PlanningMetricsComparison({ comparison }) {
  const metrics = comparison.metrics
  if (!metrics?.days?.length) return null
  return <section className="comparison-metrics" aria-labelledby="comparison-metrics-title">
    <header><div><span>Метрики каждой версии</span><h3 id="comparison-metrics-title">Персонал и пробег по дням</h3><p>Персонал — число инженеров с назначениями в этот день. Пробег — сумма сохранённых участков маршрута до заявок.</p></div></header>
    <div className="comparison-metric-overview"><div><span>Инженеров в горизонте</span><b>{metricTransition(metrics.totals.before.personnel_count, metrics.totals.after.personnel_count, Number, metrics.hasPrevious)}</b><small>{metrics.hasPrevious ? metricDelta(metrics.totals.personnelDelta, Number) : 'текущая версия'}</small></div><div><span>Назначено заявок</span><b>{metricTransition(metrics.totals.before.assigned_jobs_count, metrics.totals.after.assigned_jobs_count, Number, metrics.hasPrevious)}</b><small>{metrics.hasPrevious ? metricDelta(metrics.totals.assignmentsDelta, Number) : 'текущая версия'}</small></div><div><span>Пробег по горизонту</span><b>{metricTransition(metrics.totals.before.distance_meters, metrics.totals.after.distance_meters, formatKilometers, metrics.hasPrevious)}</b><small>{metrics.hasPrevious ? metricDelta(metrics.totals.distanceDeltaMeters, formatKilometers) : 'текущая версия'}</small></div></div>
    <div className="comparison-metric-days">{metrics.days.map((day) => <article key={day.planningDate} className="comparison-metric-day">
      <header><div><span>День планирования</span><h4>{formatDate(day.planningDate)}</h4></div><div className="comparison-day-totals"><div><span>Инженеров</span><b>{metricTransition(day.before.personnel_count, day.after.personnel_count, Number, metrics.hasPrevious)}</b><small>{metrics.hasPrevious ? metricDelta(day.personnelDelta, Number) : `${day.after.assigned_jobs_count} заявок`}</small></div><div><span>Пробег</span><b>{metricTransition(day.before.distance_meters, day.after.distance_meters, formatKilometers, metrics.hasPrevious)}</b><small>{metrics.hasPrevious ? metricDelta(day.distanceDeltaMeters, formatKilometers) : `${day.after.assigned_jobs_count} заявок`}</small></div></div></header>
      <div className="comparison-engineer-metrics"><div className="comparison-engineer-heading"><span>Инженер</span><span>Заявки</span><span>Пробег</span><span>Изменение</span></div>{day.engineers.length ? day.engineers.map((engineer) => <div key={engineer.engineerId} className="comparison-engineer-row"><b>{engineer.engineerName}</b><span>{metricTransition(engineer.previousJobs, engineer.currentJobs, Number, metrics.hasPrevious)}</span><span>{metricTransition(engineer.previousDistanceMeters, engineer.currentDistanceMeters, formatKilometers, metrics.hasPrevious)}</span><small>{metrics.hasPrevious ? metricDelta(engineer.distanceDeltaMeters, formatKilometers) : 'текущая версия'}</small></div>) : <div className="comparison-engineer-empty">В этот день назначений и задействованных инженеров нет.</div>}</div>
    </article>)}</div>
  </section>
}

function PlanComparison({ plan, loading, error, timeZone, versions = [], selectedVersionId, onVersionChange }) {
  if (loading) return <section className="replanning-comparison"><div className="comparison-loading"><span className="spinner" /> Сравниваем версии плана…</div></section>
  if (error) return <section className="replanning-comparison"><header><div><span>История планирования</span><h2>Что изменилось после перепланирования</h2></div></header><p className="comparison-error">Не удалось загрузить сравнение: {error}</p></section>
  if (!plan?.version) return null
  const comparison = buildPlanComparison(plan)
  return <section className="replanning-comparison" aria-labelledby="comparison-title">
    <header><div><span>История планирования</span><h2 id="comparison-title">Что изменилось после перепланирования</h2><p>{comparison.hasPreviousVersion ? `Версия ${comparison.currentVersionNumber} сопоставлена с версией ${comparison.previousVersionNumber}. Сравнение охватывает весь опубликованный горизонт.` : 'Это первая опубликованная версия плана — предыдущего снимка для сравнения ещё нет.'}</p></div><div className="comparison-version-control">{versions.length > 1 && <label><span>Версия для анализа</span><select value={selectedVersionId || plan.version.id} onChange={(event) => onVersionChange(Number(event.target.value))}>{versions.map((version) => <option key={version.id} value={version.id}>v{version.version_number}{version.is_current ? ' · текущая' : ''} · {formatDate(version.published_at)}</option>)}</select></label>}{comparison.hasPreviousVersion && <b>v{comparison.previousVersionNumber} → v{comparison.currentVersionNumber}</b>}</div></header>
    {comparison.hasPreviousVersion && <>
      <div className="comparison-stats"><div><span>Изменились</span><b>{comparison.counts.changed}</b></div><div><span>Новые назначения</span><b>{comparison.counts.assigned}</b></div><div><span>Перестроены</span><b>{comparison.counts.replanned}</b></div><div><span>Без изменений</span><b>{comparison.counts.unchanged}</b></div></div>
      <div className="comparison-cause-summary"><span>{comparison.counts.changed ? 'Почему план отличается' : 'Почему появилась новая версия'}</span><b>{planComparisonCause(comparison)}</b></div>
      {comparison.counts.changed ? <div className="comparison-change-list">
        {comparison.changes.map((change) => { const explanation = planChangeExplanation(change, comparison); return <article key={`${change.job_id}-${change.change_type}`} className={`comparison-change ${String(change.change_type || '').toLowerCase()}`}><header><div><span>Заявка #{change.job_id}</span><h3>{change.job?.address || plan.assignments?.find((item) => Number(item.job_id) === Number(change.job_id))?.address || planChangeTitle(change)}</h3>{change.job?.work_type && <small>{change.job.work_type}</small>}</div><b>{planChangeTitle(change)}</b></header><div className="comparison-explanation"><div><span>Почему</span><p>{explanation.cause}</p></div><div><span>Что изменилось</span><p>{explanation.effect}</p></div><div><span>Зачем</span><p>{explanation.purpose}</p></div><small className="comparison-basis">Основание: {explanation.basis}</small></div><div className="comparison-route-diff"><div><span>Было</span><b>{assignmentSnapshot(change.old_assignment, timeZone)}</b></div><i>→</i><div><span>Стало</span><b>{assignmentSnapshot(change.new_assignment, timeZone)}</b></div></div></article> })}
        {comparison.unassignedChanges.map((change) => { const explanation = unassignedChangeExplanation(change, comparison); return <article key={`unassigned-${change.job_id}`} className="comparison-change unassigned"><header><div><span>Заявка #{change.job_id}</span><h3>{change.job?.address || 'Неназначенная заявка'}</h3>{change.job?.work_type && <small>{change.job.work_type}</small>}</div><b>{change.change_type === 'NEW_UNASSIGNED' ? 'Новая неназначенная заявка' : change.change_type === 'UNASSIGNED_REMOVED' ? 'Больше не числится неназначенной' : 'Изменилась причина неназначения'}</b></header><div className="comparison-explanation"><div><span>Почему</span><p>{explanation.cause}</p></div><div><span>Что изменилось</span><p>{explanation.effect}</p></div><div><span>Зачем</span><p>{explanation.purpose}</p></div><small className="comparison-basis">Основание: {explanation.basis}</small></div><div className="comparison-route-diff"><div><span>Было</span><b>{change.previous_reason?.text || 'Не была в списке неназначенных'}</b></div><i>→</i><div><span>Стало</span><b>{change.current_reason?.text || (change.change_type === 'UNASSIGNED_REMOVED' ? 'Не числится неназначенной' : 'Причина не сохранена')}</b></div></div></article> })}
      </div> : <div className="comparison-no-changes"><b>Результаты планирования не изменились</b><span>Новая версия сохранила назначения и причины неназначения.</span></div>}
      {comparison.unchanged.length > 0 && <details className="comparison-unchanged"><summary>{unchangedAssignmentsLabel(comparison.unchanged.length)}</summary><p>Для этих заявок дата, инженер, время, позиция и параметры переезда совпадают с прошлой версией. Актуальные данные и ограничения по-прежнему допускают выбранное назначение.</p><div>{comparison.unchanged.map((assignment) => <article key={assignment.job_id}><span>Заявка #{assignment.job_id}</span><b>{assignment.address || assignment.work_type || 'Назначение сохранено'}</b><small>{assignmentSnapshot(assignment, timeZone)}</small></article>)}</div></details>}
      {comparison.unchangedUnassigned.length > 0 && <details className="comparison-unchanged"><summary>{unchangedUnassignedLabel(comparison.unchangedUnassigned.length)}</summary><p>Эти заявки остались без назначения по той же основной причине, что и в предыдущей версии.</p><div>{comparison.unchangedUnassigned.map((item) => <article key={item.job_id}><span>Заявка #{item.job_id}</span><b>{item.job?.address || item.job?.work_type || 'Неназначенная заявка'}</b><small>{item.reason?.text || 'Причина не сохранена'}</small></article>)}</div></details>}
    </>}
    <PlanningMetricsComparison comparison={comparison} />
  </section>
}

export default function DynamicPlanningPage({ projectId, notify, ownerMode = false, onNavigate }) {
  const base = projectId ? `/api/projects/${projectId}/planning` : '/api/project/planning'
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
  const [comparisonPlan, setComparisonPlan] = useState(null)
  const [comparisonLoading, setComparisonLoading] = useState(false)
  const [comparisonError, setComparisonError] = useState('')
  const [comparisonVersions, setComparisonVersions] = useState([])
  const [selectedComparisonVersionId, setSelectedComparisonVersionId] = useState(null)
  const [baselineComparison, setBaselineComparison] = useState(null)
  const [baselineLoading, setBaselineLoading] = useState(false)
  const [baselineError, setBaselineError] = useState('')
  const [baselineReload, setBaselineReload] = useState(0)
  const comparisonRequest = useRef('')
  const comparisonVersionsRequest = useRef('')
  const selectedComparisonVersion = useRef(null)
  const boardRequest = useRef(0)
  const dayRequest = useRef(0)
  const dayInFlight = useRef('')
  const selectedDateRef = useRef('')
  const boardRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    if (!baselineComparisonEnabled || !selectedDate || !board?.plan_version?.id) {
      setBaselineComparison(null)
      setBaselineError('')
      setBaselineLoading(false)
      return () => { cancelled = true }
    }
    setBaselineLoading(true)
    setBaselineError('')
    api(`${base}/current/days/${selectedDate}/comparison?plan_version_id=${board.plan_version.id}`)
      .then((value) => { if (!cancelled) setBaselineComparison(value) })
      .catch((error) => { if (!cancelled) { setBaselineComparison(null); if (error.code === 'BASELINE_VERSION_CHANGED') { void loadBoard(true, selectedDate).then((value) => { if (!value && !cancelled) setBaselineError('Не удалось обновить версию плана') }) } else { setBaselineError(error.message) } } })
      .finally(() => { if (!cancelled) setBaselineLoading(false) })
    return () => { cancelled = true }
  }, [base, selectedDate, board?.plan_version?.id, baselineReload])

  useEffect(() => {
    if (!activeStates.has(baselineComparison?.status)) return undefined
    const timer = window.setTimeout(
      () => setBaselineReload((value) => value + 1),
      2000,
    )
    return () => window.clearTimeout(timer)
  }, [baselineComparison?.status, baselineReload])

  async function retryBaseline(planningRunId) {
    if (!planningRunId) {
      setBaselineReload((value) => value + 1)
      return
    }
    setBaselineLoading(true)
    setBaselineError('')
    try {
      const result = await api(`${base}/runs/${planningRunId}/baseline/retry`, { method: 'POST' })
      emitPlanningEvent('planning_baseline_retry_completed', { project_id: projectId, planning_run_id: planningRunId, status: result.status })
      notify(result.status === 'READY' ? 'Сравнение с FIFO рассчитано' : 'Повтор запущен')
      setBaselineReload((value) => value + 1)
    } catch (error) {
      setBaselineError(error.message)
      notify(error.message, 'error')
    } finally {
      setBaselineLoading(false)
    }
  }

  function recordBaselineExpansion(value) {
    emitPlanningEvent('planning_comparison_engineers_expanded', { planning_run_id: value.planning_run_id, plan_version_id: value.plan_version_id })
    void api(`${base}/current/days/${value.date}/comparison/engineers-expanded?planning_run_id=${value.planning_run_id}&plan_version_id=${value.plan_version_id}`, { method: 'POST' }).catch(() => {})
  }

  async function loadComparisonVersions(currentVersionId) {
    if (!currentVersionId) { setComparisonVersions([]); return }
    const requestKey = `${base}:versions:${currentVersionId}`
    if (comparisonVersionsRequest.current === requestKey) return
    comparisonVersionsRequest.current = requestKey
    try {
      const value = await api(`${base}/versions?limit=50&offset=0`)
      if (comparisonVersionsRequest.current === requestKey) setComparisonVersions(Array.isArray(value?.items) ? value.items : [])
    } catch {
      if (comparisonVersionsRequest.current === requestKey) comparisonVersionsRequest.current = ''
    }
  }

  async function loadComparison(versionId) {
    if (!versionId) { setComparisonPlan(null); return }
    const requestKey = `${base}:${versionId}`
    if (comparisonRequest.current === requestKey) return
    comparisonRequest.current = requestKey
    setComparisonLoading(true)
    setComparisonError('')
    try {
      const value = await api(`${base}/versions/${versionId}`)
      if (comparisonRequest.current === requestKey && Number(value?.version?.id) === Number(versionId)) setComparisonPlan(value)
    } catch (error) {
      if (comparisonRequest.current === requestKey) {
        setComparisonPlan(null)
        setComparisonError(error.message)
        setComparisonLoading(false)
        comparisonRequest.current = ''
      }
    } finally {
      if (comparisonRequest.current === requestKey) setComparisonLoading(false)
    }
  }

  function selectComparisonVersion(versionId) {
    selectedComparisonVersion.current = versionId
    setSelectedComparisonVersionId(versionId)
    void loadComparison(versionId)
  }

  async function loadDay(date, versionId, quiet = false) {
    const requestId = ++dayRequest.current
    const requestKey = `${date}:${versionId || ''}`
    dayInFlight.current = requestKey
    try {
      const value = await api(`${base}/board/${date}${versionId ? `?plan_version_id=${versionId}` : ''}`)
      if (requestId !== dayRequest.current || selectedDateRef.current !== date || Number(boardRef.current?.plan_version?.id || 0) !== Number(versionId || 0)) return null
      setDay(value)
      return value
    } catch (error) {
      if (requestId !== dayRequest.current || selectedDateRef.current !== date) return null
      if (error.code === 'VERSION_CHANGED') {
        const value = await loadBoard(true, date)
        if (value) emitPlanningEvent('planning_version_changed', { plan_version_id: value.plan_version?.id })
        return value
      }
      if (!quiet) notify(error.message, 'error')
      return null
    } finally {
      if (requestId === dayRequest.current && dayInFlight.current === requestKey) dayInFlight.current = ''
    }
  }

  async function loadBoard(quiet = false, preferredDate = selectedDate) {
    const requestId = ++boardRequest.current
    try {
      const value = await api(`${base}/board?days=7`)
      if (requestId !== boardRequest.current) return null
      const nextDate = selectPlanningDate(value.days, selectedDateRef.current || preferredDate, value.project_date)
      const previousVersion = boardRef.current?.plan_version?.id
      const sameView = selectedDateRef.current === nextDate && Number(previousVersion || 0) === Number(value.plan_version?.id || 0)
      const reusePendingDay = sameView && nextDate !== value.project_date && dayInFlight.current === `${nextDate}:${value.plan_version?.id || ''}`
      boardRef.current = value
      selectedDateRef.current = nextDate
      if (!reusePendingDay) {
        ++dayRequest.current
        dayInFlight.current = ''
      }
      setBoard(value)
      if (value.plan_version?.id) {
        const followsCurrent = !selectedComparisonVersion.current || !previousVersion || Number(selectedComparisonVersion.current) === Number(previousVersion)
        const targetVersionId = followsCurrent ? value.plan_version.id : selectedComparisonVersion.current
        selectedComparisonVersion.current = targetVersionId
        setSelectedComparisonVersionId(targetVersionId)
        void loadComparison(targetVersionId)
        void loadComparisonVersions(value.plan_version.id)
      } else {
        comparisonRequest.current = ''
        comparisonVersionsRequest.current = ''
        selectedComparisonVersion.current = null
        setSelectedComparisonVersionId(null)
        setComparisonVersions([])
        setComparisonPlan(null)
        setComparisonError('')
        setComparisonLoading(false)
      }
      if (!quiet) emitPlanningEvent('planning_board_opened', { project_id: projectId, plan_version_id: value.plan_version?.id })
      setSelectedDate(nextDate)
      if (reusePendingDay) return value
      if (nextDate !== value.project_date && !sameView) setDay(null)
      const nextDay = nextDate === value.project_date ? value.selected_day : await loadDay(nextDate, value.plan_version?.id, true)
      if (requestId !== boardRequest.current || selectedDateRef.current !== nextDate) return null
      if (nextDate === value.project_date) setDay(nextDay)
      if (drawer && previousVersion && value.plan_version?.id !== previousVersion) {
        setDrawerUpdated(true)
        void openExplanation(drawer.job, returnFocus, nextDay?.day_result_id)
      }
      return value
    } catch (error) {
      if (!quiet && requestId === boardRequest.current) notify(error.message, 'error')
      return null
    } finally { if (!quiet && requestId === boardRequest.current) setLoading(false) }
  }

  useEffect(() => {
    ++boardRequest.current
    ++dayRequest.current
    dayInFlight.current = ''
    selectedDateRef.current = ''
    boardRef.current = null
    comparisonRequest.current = ''
    comparisonVersionsRequest.current = ''
    selectedComparisonVersion.current = null
    setBoard(null); setDay(null); setSelectedDate(''); setLoading(true); setDrawer(null); setComparisonPlan(null); setComparisonVersions([]); setSelectedComparisonVersionId(null); setComparisonLoading(false); setComparisonError(''); setBaselineComparison(null); setBaselineError(''); setBaselineLoading(false)
    void loadBoard(false, '')
  }, [projectId, ownerMode])

  useEffect(() => {
    const active = activeStates.has(board?.active_run?.state)
    const timer = window.setInterval(() => void loadBoard(true), active ? 10000 : 15000)
    return () => window.clearInterval(timer)
  }, [base, selectedDate, board?.active_run?.state, board?.plan_version?.id])

  async function selectDate(value) {
    selectedDateRef.current = value
    ++dayRequest.current
    dayInFlight.current = ''
    setSelectedDate(value)
    const currentBoard = boardRef.current
    if (value === currentBoard?.project_date) setDay(currentBoard.selected_day)
    else { setDay(null); await loadDay(value, currentBoard?.plan_version?.id) }
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
    <PageHeader eyebrow="Маршруты на семь дней" title="Планирование" subtitle="Актуальный опубликованный план и объяснение каждого результата." actions={<><PlanningConfig notify={notify} endpoint={projectId ? `/api/projects/${projectId}/planning-config` : '/api/project/planning-config'} /><Button icon="refresh" disabled={loading || !board || busy || calculating || board?.readiness?.ready === false} onClick={calculate}>{calculating ? 'Расчёт выполняется' : 'Рассчитать маршруты'}</Button><Readiness value={board?.readiness} onNavigate={(section) => onNavigate?.(readinessTarget(section, ownerMode))} /></>} />
    <RunBanner run={activeRun} hasPlan={!!board?.plan_version} onRetry={calculate} timeZone={board?.timezone} />
    {board?.plan_version?.status === 'PARTIAL' && <section className="board-alert warning"><div><b>{permanentlyUnassigned ? `${pluralJobs(permanentlyUnassigned)} не удалось назначить в горизонте` : 'Часть заявок не назначена'}</b><span>Валидная часть плана опубликована; конкретные причины указаны в последней колонке.</span></div></section>}
    {loading ? <div className="board-loading"><span className="spinner" /> Загружаем актуальный план…</div> : <>
      <DateStrip days={board?.days} selected={selectedDate} selectedDay={day} today={board?.project_date} onSelect={selectDate} />
      <ResultContext version={board?.plan_version} timeZone={board?.timezone} />
      {!board?.plan_version ? <Empty title="План ещё не рассчитан" text={board?.readiness?.ready === false ? 'Подготовьте обязательные данные, затем запустите расчёт.' : 'Нажмите «Рассчитать маршруты», чтобы опубликовать первый план.'} action={board?.readiness?.ready !== false && <Button onClick={calculate}>Рассчитать маршруты</Button>} /> : <>
        {baselineComparisonEnabled && <BaselineComparison value={baselineComparison} loading={baselineLoading || (!!baselineComparison && (baselineComparison.date !== selectedDate || Number(baselineComparison.plan_version_id) !== Number(board?.plan_version?.id)))} error={baselineError} onRetry={retryBaseline} onExpand={recordBaselineExpansion} previousPlan={activeStates.has(board?.active_run?.state)} />}
        <section className="board-filters"><label className="board-search"><span>⌕</span><input aria-label="Поиск по адресу и типу работ" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Адрес или тип работ" /></label><select aria-label="Приоритет" value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value })}><option value="">Все приоритеты</option>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="Статус заявки" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Все статусы</option>{safeArray(day?.available_filters?.statuses).map((status) => <option key={status} value={status}>{statusLabels[status] || status}</option>)}</select><select aria-label="Результат" value={filters.outcome} onChange={(event) => setFilters({ ...filters, outcome: event.target.value })}><option value="ALL">Все</option><option value="ASSIGNED">Назначенные</option><option value="UNASSIGNED_TODAY">Перенесённые и неназначенные</option></select>{filtered && <span className="shown-count">Показано {visibleCount} из {allCards.length}</span>}</section>
        {!day ? <div className="board-loading"><span className="spinner" /> Загружаем день…</div> : !day.result_available ? <Empty title="Для этой даты нет результата расчёта" text="Дата не рассчитывалась в актуальной версии плана." /> : <><Suspense fallback={<div className="map-loading"><span className="spinner" /> Загружаем карту…</div>}><RoutesMap day={day} planningDate={selectedDate} timeZone={board?.timezone} projectId={projectId} /></Suspense><div className="route-board"><div className="route-board-scroll">{safeArray(day.engineer_columns).map((column) => <EngineerColumn key={column.engineer_id} column={column} filterJob={filterJob} onOpen={openExplanation} timeZone={board?.timezone} />)}<UnassignedColumn value={day.unassigned} filterJob={filterJob} onOpen={openExplanation} timeZone={board?.timezone} /></div></div></>}
        <PlanComparison plan={comparisonPlan} loading={comparisonLoading} error={comparisonError} timeZone={board?.timezone} versions={comparisonVersions} selectedVersionId={selectedComparisonVersionId} onVersionChange={selectComparisonVersion} />
      </>}
    </>}
    {drawer && <ExplanationDrawer value={drawer} loading={drawerLoading} updated={drawerUpdated} onClose={() => { setDrawer(null); setDrawerUpdated(false) }} returnFocus={returnFocus} timeZone={board?.timezone} />}
  </>
}

export { BaselineComparison }
