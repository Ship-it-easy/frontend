import React, { useEffect, useMemo, useState } from 'react'
import { api, qs } from './api.js'
import { Badge, Button, Empty, PageHeader } from './ui.jsx'
import {
  ACTIVE_PLANNING_EVENT_STATES,
  buildApplyRequest,
  canApplyBatch,
  planningEventStatusText,
  POLLING_STATUSES,
} from './jobImportsModel.js'
import './imports.css'
import './imports-extra.css'

const STATUS_TEXT = {
  UPLOADED: 'Ожидает проверки',
  VALIDATING: 'Проверяется',
  HAS_ERRORS: 'Есть ошибки',
  READY_TO_APPLY: 'Готов к созданию',
  APPLYING: 'Создаются заявки',
  APPLIED: 'Импорт завершён',
  TECHNICAL_ERROR: 'Техническая ошибка',
  STALE_VALIDATION: 'Проверка устарела',
  EXPIRED: 'Файл удалён',
}

const STAGE_TEXT = {
  PARSING: 'Чтение структуры CSV',
  VALIDATING_ROWS: 'Проверка строк и адресов',
  DONE: 'Проверка завершена',
}

const ISSUE_HELP = {
  INVALID_FILE_TYPE: 'Выберите файл с расширением CSV.',
  FILE_TOO_LARGE: 'Уменьшите файл до 10 МБ.',
  FILE_ALREADY_APPLIED: 'Этот файл уже был успешно применён.',
  PROJECT_BLOCKED: 'Разблокируйте проект перед повторной проверкой.',
  UNSUPPORTED_ENCODING: 'Сохраните файл в UTF-8 или Windows-1251.',
  UNDETERMINED_DELIMITER: 'Используйте единый разделитель: точку с запятой или запятую.',
  MALFORMED_CSV: 'Проверьте кавычки и одинаковое количество колонок.',
  MISSING_HEADER: 'Добавьте обязательную колонку.',
  DUPLICATE_HEADER: 'Оставьте обязательную колонку только один раз.',
  ROW_LIMIT_EXCEEDED: 'Разделите файл на пакеты не более 1000 строк.',
  NO_DATA_ROWS: 'Добавьте хотя бы одну информационную строку.',
  REQUIRED_VALUE_MISSING: 'Заполните обязательное поле.',
  INVALID_DATETIME: 'Используйте DD.MM.YYYY ЧЧ:ММ или YYYY-MM-DD ЧЧ:ММ.',
  DATE_MISMATCH: 'Начало и окончание должны быть в одной календарной дате.',
  INVALID_TIME_WINDOW: 'Окончание должно быть позже начала.',
  UNKNOWN_WORK_TYPE: 'Добавьте тип работ в справочник проекта или исправьте название.',
  AMBIGUOUS_WORK_TYPE: 'Устраните дубли названия в справочнике типов работ.',
  INACTIVE_WORK_TYPE: 'Активируйте тип работ или укажите другой.',
  ADDRESS_NOT_FOUND: 'Уточните населённый пункт, улицу и дом.',
  ADDRESS_INCOMPLETE: 'Укажите полный адрес до дома.',
  ADDRESS_AMBIGUOUS: 'Уточните адрес так, чтобы находился один дом.',
  ADDRESS_OUTSIDE_RUSSIA: 'Укажите адрес на территории России.',
  ADDRESS_SERVICE_UNAVAILABLE: 'Адресный сервис недоступен. Повторите проверку позже.',
  DUPLICATE_IN_FILE: 'Удалите повторяющиеся строки из файла.',
  POSSIBLE_EXISTING_DUPLICATE: 'Проверьте существующую заявку и подтвердите создание новой.',
  STALE_VALIDATION: 'Справочники изменились. Запустите проверку повторно.',
  VALIDATION_FAILED: 'Повторите проверку. Если ошибка повторится, обратитесь к администратору.',
}

const REVALIDATABLE_STATUSES = new Set(['TECHNICAL_ERROR', 'STALE_VALIDATION'])

function dateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
}

function dateOnly(value) {
  if (!value) return '—'
  const [year, month, day] = String(value).slice(0, 10).split('-')
  return `${day}.${month}.${year}`
}

export default function JobImports({ projectId, projectLabel, notify, onOpenJobs }) {
  const [file, setFile] = useState(null)
  const [drag, setDrag] = useState(false)
  const [batch, setBatch] = useState(null)
  const [issues, setIssues] = useState({ items: [], total: 0, page: 1 })
  const [history, setHistory] = useState([])
  const [historyOpen, setHistoryOpen] = useState(true)
  const [busy, setBusy] = useState(false)
  const [planningEvent, setPlanningEvent] = useState(null)
  const [warningAcknowledged, setWarningAcknowledged] = useState(false)
  const [issueFilters, setIssueFilters] = useState({ severity: '', query: '', page: 1 })

  async function historyLoad() {
    if (!projectId) return
    try {
      const value = await api(`/api/projects/${projectId}/job-imports`)
      setHistory(Array.isArray(value) ? value : value?.items || [])
    } catch (error) {
      notify(error.message, 'error')
    }
  }

  async function issuesLoad(batchId, filters = issueFilters) {
    const value = await api(`/api/projects/${projectId}/job-imports/${batchId}/issues${qs(filters)}`)
    setIssues({ items: value?.items || [], total: Number(value?.total || 0), page: Number(value?.page || 1) })
  }

  async function open(item) {
    setBusy(true)
    setWarningAcknowledged(false)
    setIssueFilters({ severity: '', query: '', page: 1 })
    try {
      const detail = await api(`/api/projects/${projectId}/job-imports/${item.id}`)
      setBatch(detail)
      await issuesLoad(item.id, { severity: '', query: '', page: 1 })
    } catch (error) {
      notify(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    setBatch(null)
    setIssues({ items: [], total: 0, page: 1 })
    setFile(null)
    void historyLoad()
  }, [projectId])

  useEffect(() => {
    if (!batch?.id) return
    const timer = setTimeout(() => {
      issuesLoad(batch.id).catch((error) => notify(error.message, 'error'))
    }, 250)
    return () => clearTimeout(timer)
  }, [batch?.id, issueFilters.severity, issueFilters.query, issueFilters.page])

  async function upload(event) {
    event.preventDefault()
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      notify('Для заявок принимается только CSV', 'error')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      notify('Файл больше 10 МБ', 'error')
      return
    }
    setBusy(true)
    const body = new FormData()
    body.append('file', file)
    try {
      const created = await api(`/api/projects/${projectId}/job-imports`, { method: 'POST', body })
      setBatch(created)
      setIssues({ items: [], total: 0, page: 1 })
      setIssueFilters({ severity: '', query: '', page: 1 })
      setWarningAcknowledged(false)
      notify('Файл принят, проверка выполняется в фоне')
      await historyLoad()
    } catch (error) {
      const existingBatchId = Number(error.payload?.batch_id || 0)
      if (error.code === 'FILE_ALREADY_APPLIED' && existingBatchId) {
        notify(`Этот файл уже применён в пакете #${existingBatchId}. Открыт сохранённый результат.`, 'error')
        await open({ id: existingBatchId })
        return
      }
      notify(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function refresh() {
    if (!batch?.id) return
    try {
      const detail = await api(`/api/projects/${projectId}/job-imports/${batch.id}`)
      setBatch(detail)
      await issuesLoad(batch.id)
      if (!POLLING_STATUSES.has(detail.status)) await historyLoad()
    } catch (error) {
      notify(error.message, 'error')
    }
  }

  useEffect(() => {
    if (!batch?.id || !POLLING_STATUSES.has(batch.status)) return
    const timer = setInterval(refresh, 1500)
    return () => clearInterval(timer)
  }, [batch?.id, batch?.status, issueFilters.severity, issueFilters.query, issueFilters.page])

  useEffect(() => {
    setPlanningEvent(null)
    if (batch?.status !== 'APPLIED' || !batch.planning_event_id) return
    let active = true
    let timer = null
    async function loadPlanningEvent() {
      try {
        const value = await api(`/api/projects/${projectId}/planning/events/${batch.planning_event_id}`)
        if (!active) return
        setPlanningEvent(value)
        if (ACTIVE_PLANNING_EVENT_STATES.has(value?.state)) {
          timer = window.setTimeout(loadPlanningEvent, 2000)
        }
      } catch (error) {
        if (active) notify(error.message, 'error')
      }
    }
    void loadPlanningEvent()
    return () => {
      active = false
      if (timer) window.clearTimeout(timer)
    }
  }, [projectId, batch?.id, batch?.status, batch?.planning_event_id])

  async function apply() {
    setBusy(true)
    try {
      const result = await api(`/api/projects/${projectId}/job-imports/${batch.id}/apply`, {
        ...buildApplyRequest(warningAcknowledged),
      })
      setBatch(result)
      if (result?.planning_event_id) window.sessionStorage.setItem('route-app:last-planning-event', String(result.planning_event_id))
      notify(`Импорт завершён. Создано заявок: ${result.created_count || 0}`)
      await historyLoad()
    } catch (error) {
      notify(error.message, 'error')
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function revalidate() {
    setBusy(true)
    try {
      const result = await api(`/api/projects/${projectId}/job-imports/${batch.id}/revalidate`, { method: 'POST' })
      setBatch(result)
      setWarningAcknowledged(false)
      notify('Повторная проверка запущена')
    } catch (error) {
      notify(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const choose = (files) => setFile(files?.[0] || null)
  const pageCount = Math.max(1, Math.ceil(issues.total / 50))
  const progress = batch?.total_rows ? Math.min(100, Math.round((batch.processed_rows / batch.total_rows) * 100)) : 0
  const canApply = canApplyBatch(batch, warningAcknowledged)
  const summary = batch?.summary || {}
  const dateRange = useMemo(() => {
    if (!summary.sla_date_from) return '—'
    if (summary.sla_date_from === summary.sla_date_to) return dateOnly(summary.sla_date_from)
    return `${dateOnly(summary.sla_date_from)} — ${dateOnly(summary.sla_date_to)}`
  }, [summary.sla_date_from, summary.sla_date_to])

  return <div className="imports-page">
    <PageHeader eyebrow="Центр данных" title="Импорт заявок из CSV" subtitle="Проверка выполняется в фоне, а заявки создаются только после отдельного подтверждения." />

    {batch && <section className="import-detail-card import-detail-top">
      <div className="import-detail-head">
        <div>
          <span className="eyebrow">Пакет #{batch.id}</span>
          <h2>{batch.original_filename || 'CSV-файл'}</h2>
          <p>{batch.project_name || projectLabel || `Проект #${projectId}`} · {batch.created_by_name || batch.created_by || '—'} · {dateTime(batch.created_at)}</p>
        </div>
        <div className="import-detail-actions">
          {REVALIDATABLE_STATUSES.has(batch.status) && <Button kind="secondary" disabled={busy} onClick={revalidate}>Повторить проверку</Button>}
          {batch.status === 'READY_TO_APPLY' && <Button disabled={busy || !canApply} onClick={apply}>{busy ? 'Создаём…' : 'Создать заявки'}</Button>}
          {batch.status === 'APPLIED' && onOpenJobs && <Button kind="secondary" onClick={() => onOpenJobs(batch.id)}>Открыть заявки</Button>}
        </div>
      </div>

      <div className="import-status-line"><Badge status={batch.status}>{STATUS_TEXT[batch.status] || batch.status}</Badge><span>{STAGE_TEXT[batch.stage] || batch.stage || '—'}</span>{POLLING_STATUSES.has(batch.status) && <span>{batch.processed_rows || 0} из {batch.total_rows || '…'} строк</span>}</div>
      {POLLING_STATUSES.has(batch.status) && <div className="import-progress"><i style={{ width: `${progress || 8}%` }} /></div>}

      <div className="import-metrics"><div><small>Строки</small><b>{batch.total_rows || 0}</b></div><div><small>Ошибки</small><b className={batch.error_count ? 'metric-danger' : ''}>{batch.error_count || 0}</b></div><div><small>Предупреждения</small><b className={batch.warning_count ? 'metric-warning' : ''}>{batch.warning_count || 0}</b></div><div><small>Создано</small><b className="metric-success">{batch.created_count || 0}</b></div></div>

      {batch.status === 'READY_TO_APPLY' && <div className="import-summary"><div><small>Диапазон SLA</small><b>{dateRange}</b></div><div><small>Типов работ</small><b>{summary.work_type_count || 0}</b></div><div><small>Адресов</small><b>{summary.address_count || 0}</b></div><div><small>К созданию</small><b>{batch.total_rows || 0}</b></div></div>}

      {!!batch.warning_count && batch.status === 'READY_TO_APPLY' && <label className="warning-ack"><input type="checkbox" checked={warningAcknowledged} onChange={(event) => setWarningAcknowledged(event.target.checked)} /><span><b>Я проверил возможные дубли</b><small>Подтверждаю создание новых самостоятельных заявок.</small></span></label>}

      {batch.status === 'HAS_ERRORS' && <p className="import-callout error">Исправьте исходный CSV и загрузите его заново. При наличии хотя бы одной ошибки заявки не создаются.</p>}
      {batch.status === 'TECHNICAL_ERROR' && <p className="import-callout error">Проверка не завершилась по технической причине. Исходный файл сохранён — запустите проверку повторно.</p>}
      {batch.status === 'STALE_VALIDATION' && <p className="import-callout warning">Справочники или результаты нормализации изменились. Выполните повторную проверку.</p>}
      {batch.status === 'EXPIRED' && <p className="import-callout error">Срок хранения исходного файла истёк. Загрузите CSV заново.</p>}
      {batch.status === 'APPLIED' && <p className="import-callout success">Импорт завершён {dateTime(batch.applied_at)}. Событие динамического пересчёта: #{batch.planning_event_id || '—'} · {planningEventStatusText(planningEvent?.state)}.</p>}

      {(issues.total > 0 || issueFilters.severity || issueFilters.query) && <div className="import-issues">
        <div className="import-issues-title"><b>Ошибки и предупреждения</b><span>{issues.total} найдено</span></div>
        <div className="issue-filters"><select value={issueFilters.severity} onChange={(event) => setIssueFilters({ ...issueFilters, severity: event.target.value, page: 1 })}><option value="">Все уровни</option><option value="ERROR">Ошибки</option><option value="WARNING">Предупреждения</option></select><input value={issueFilters.query} onChange={(event) => setIssueFilters({ ...issueFilters, query: event.target.value, page: 1 })} placeholder="Номер строки или код" /></div>
        {issues.items.length ? <table><thead><tr><th>Строка</th><th>Уровень</th><th>Колонка</th><th>Значение</th><th>Код и действие</th></tr></thead><tbody>{issues.items.map((item, index) => <tr key={`${item.row_number}-${item.code}-${index}`}><td>{item.row_number || '—'}</td><td><Badge status={item.severity}>{item.severity === 'WARNING' ? 'Предупреждение' : 'Ошибка'}</Badge></td><td>{item.column || 'Файл'}</td><td>{item.value || '—'}</td><td><b>{item.code}</b><small>{ISSUE_HELP[item.code] || 'Исправьте данные и повторите проверку.'}</small></td></tr>)}</tbody></table> : <Empty title="Проблемы не найдены" text="Измените фильтр или поисковый запрос." />}
        {pageCount > 1 && <div className="issue-pagination"><Button kind="secondary" disabled={issueFilters.page <= 1} onClick={() => setIssueFilters({ ...issueFilters, page: issueFilters.page - 1 })}>Назад</Button><span>Страница {issueFilters.page} из {pageCount}</span><Button kind="secondary" disabled={issueFilters.page >= pageCount} onClick={() => setIssueFilters({ ...issueFilters, page: issueFilters.page + 1 })}>Далее</Button></div>}
      </div>}
    </section>}

    <div className="imports-layout">
      <section className="import-upload-card">
        <div className="import-card-heading"><div><span className="eyebrow">Новый пакет</span><h2>Проверить CSV</h2><p>UTF-8, UTF-8 с BOM или Windows-1251 · разделитель «;» или «,»</p></div><span className="import-icon">↥</span></div>
        <form onSubmit={upload}><label className={`dropzone ${drag ? 'dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={(event) => { event.preventDefault(); setDrag(false); choose(event.dataTransfer.files) }}><input type="file" accept=".csv,text/csv" onChange={(event) => choose(event.target.files)} /><span className="dropzone-icon">CSV</span><b>{file ? file.name : 'Перетащите CSV сюда'}</b><small>{file ? `${Math.round(file.size / 1024)} КБ · готов к проверке` : 'или нажмите, чтобы выбрать файл'}</small></label><div className="import-schema"><span>Обязательные колонки</span><b>Тип заявки ВК · Начало · Окончание · Адрес</b><small>До 1000 информационных строк и 10 МБ. Начало и окончание одной строки — в одну дату. При любой ошибке ничего не создаётся.</small><small>Дата и время: DD.MM.YYYY ЧЧ:ММ или YYYY-MM-DD ЧЧ:ММ; секунды допустимы.</small></div><Button className="wide" disabled={!file || busy}>{busy ? 'Загружаем…' : 'Проверить файл'}</Button></form>
      </section>

      <section className={`import-history-card ${historyOpen ? 'open' : 'collapsed'}`}>
        <button className="history-toggle" onClick={() => setHistoryOpen(!historyOpen)}><span><span className="eyebrow">Журнал операций</span><b>История импортов</b></span><span className="history-count">{history.length}</span><span className="import-chevron">{historyOpen ? '⌃' : '⌄'}</span></button>
        {historyOpen && (history.length ? <div className="import-history-list">{history.map((item) => <button className={`import-history-item ${batch?.id === item.id ? 'selected' : ''}`} key={item.id} onClick={() => open(item)}><span className={`import-status-dot status-${String(item.status).toLowerCase()}`} /><span className="import-history-main"><b>{item.original_filename || `Пакет #${item.id}`}</b><small>Заявки CSV · {item.project_name || projectLabel || `Проект #${item.project_id}`}</small><small>{item.created_by_name || item.created_by || '—'} · {dateTime(item.created_at)}</small></span><span className="import-history-meta"><Badge status={item.status}>{STATUS_TEXT[item.status] || item.status}</Badge><small>{item.total_rows || 0} строк · {item.error_count || 0} ошибок · {item.warning_count || 0} предупреждений</small><small>{item.created_count || 0} создано</small></span><span className="import-chevron">›</span></button>)}</div> : <Empty title="История пока пуста" text="После первой загрузки здесь появятся сохранённые пакеты." />)}
      </section>
    </div>
  </div>
}
