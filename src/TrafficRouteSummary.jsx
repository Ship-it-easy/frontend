import { transportLabel } from './transport.js'
import React from 'react'
import { clockInZone, sameLocalDay, routeTime } from './trafficModel.js'
import './traffic.css'

const minutes = seconds => Math.ceil(seconds / 60)

function DepartureComparison({ traffic, timeZone, onDeparture }) {
  const formatTime = (instant, zone) => routeTime(instant, traffic.departure_at, zone)
  const options = (traffic.departure_options || []).filter(o => sameLocalDay(o.departure_at, traffic.departure_at, timeZone))
  if (!options.length) return null
  const maximum = Math.max(1, ...options.map(o => o.duration_seconds))
  return <div className="departure-comparison">
    <div className="departure-comparison-title"><b>Если выехать позже</b><span>Шаг 5 минут · тот же путь</span></div>
    <div className="departure-bars" role="group" aria-label="Сравнение времени выезда">{options.map((option, i) => <button type="button" key={option.departure_at} onClick={() => onDeparture(clockInZone(option.departure_at, timeZone))} title={`Выезд ${formatTime(option.departure_at, timeZone)}, дорога ${minutes(option.duration_seconds)} мин, окончание работ ${formatTime(option.finish_at, timeZone)}${option.late_stops ? `, позже плана: ${option.late_stops}` : ''}`} aria-label={`Выезд ${formatTime(option.departure_at, timeZone)}, дорога ${minutes(option.duration_seconds)} минут`}><span className="departure-bar-value">{minutes(option.duration_seconds)}</span><i style={{height: `${Math.max(6, option.duration_seconds / maximum * 52)}px`}} className={option.late_stops ? 'late' : ''} /><small>{i % 3 === 0 ? formatTime(option.departure_at, timeZone) : '·'}</small></button>)}</div>
    <small>Варианты в пределах выбранной даты. Высота — минуты в дороге. Оранжевый — начало одной из работ позже опубликованного плана. Нажмите, чтобы пересчитать выезд для всех инженеров.</small>
  </div>
}

export default function TrafficRouteSummary({ routes, lines, loading, timeZone, onDeparture }) {
  const active = routes.filter(route => route.locations.length >= 2)
  return <section className="traffic-forecast" aria-label="Прогноз поездок инженеров">
    <header><div><span className="eyebrow">Москва · Домодедово · Ступино · Кашира</span><h3>Сколько времени займёт маршрут</h3></div><span className="traffic-model-label">Модель · шаг 5 минут</span></header>
    <p className="traffic-accuracy-note">Точность пока не измерена по фактическим поездкам. Прогноз учитывает время суток, направление и остановки; ДТП и текущие перекрытия не учтены.</p>
    <div className="traffic-route-cards">{active.map(route => {
      const state = lines[String(route.engineerId)]
      const t = state?.traffic
      const formatTime = (instant, zone) => routeTime(instant, t.departure_at, zone)
      return <article key={route.engineerId} className="traffic-route-card">
        <header><span className="traffic-engineer-dot" style={{background: route.color}} /><b>{route.engineerName}</b><small>{transportLabel(route.transportType)}</small></header>
        {!t ? <p className={state?.error ? 'traffic-route-error' : ''}>{loading ? 'Считаем время по дорожному маршруту…' : state?.error || 'Прогноз недоступен'}</p> : <>
          <div className="traffic-route-metrics"><div><small>В дороге</small><strong>≈{minutes(t.duration_seconds)}<em> мин</em></strong></div><div><small>Добавляет нагрузка</small><strong>+{minutes(t.delay_seconds)}<em> мин</em></strong></div><div><small>Все работы завершатся</small><strong>{formatTime(t.finish_at, timeZone)}</strong></div></div>
          <div className="traffic-route-breakdown"><span>Путь {minutes(t.baseline_seconds)} мин</span><span>Работы {minutes(t.service_seconds)} мин</span><span>Ожидание до работ {minutes(t.waiting_seconds)} мин</span><span>Доступ к клиентам {minutes(t.access_seconds)} мин</span></div>
          {t.coverage_status === 'partial' && <p className="traffic-route-error">Часть пути вне зоны модели. Географическое покрытие: {Math.round(t.coverage_fraction * 100)}%.</p>}
          {t.late_stops > 0 && <p className="traffic-late-note">Позже опубликованного плана: {t.late_stops} {t.late_stops === 1 ? 'работа' : 'работы'}. Проверьте время выезда и расписание.</p>}
          <details className="traffic-route-details"><summary>Все переезды и варианты выезда <span>{t.legs.length} переездов</span></summary>
            <ol className="traffic-itinerary">{t.legs.map((leg, i) => <li key={`${leg.job_id}-${i}`}><span className="traffic-stop-number">{i + 1}</span><div><b>{route.jobs[i]?.address || `Заявка #${leg.job_id}`}</b><p>Выезд {formatTime(leg.departure_at, timeZone)} → прибытие {formatTime(leg.arrival_at, timeZone)} <strong>{minutes(leg.duration_seconds)} мин</strong></p><small>Работа {formatTime(leg.service_start_at, timeZone)}–{formatTime(leg.service_finish_at, timeZone)}{leg.waiting_seconds > 0 ? ` · ожидание ${minutes(leg.waiting_seconds)} мин` : ''}{leg.late_to_plan_seconds > 0 ? ` · позже плана на ${minutes(leg.late_to_plan_seconds)} мин` : ''}</small></div></li>)}</ol>
            <DepartureComparison traffic={t} timeZone={timeZone} onDeparture={onDeparture} />
            {t.warnings?.map(message => <p key={message} className="traffic-detail-note">{message}</p>)}
          </details>
        </>}
      </article>
    })}</div>
  </section>
}
