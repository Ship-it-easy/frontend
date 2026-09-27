import { transportLabel } from './transport.js'
import React from 'react'
import { routeTime } from './trafficModel.js'
import './traffic.css'

const minutes = seconds => Math.ceil(seconds / 60)

export default function TrafficRouteSummary({ routes, lines, loading, timeZone }) {
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
          <div className="traffic-route-metrics"><div><small>В дороге</small><strong>≈{minutes(t.duration_seconds)}<em> мин</em></strong></div><div><small>Все работы завершатся</small><strong>{formatTime(t.finish_at, timeZone)}</strong></div></div>
          <details className="traffic-route-details"><summary>Маршрут по шагам <span>Переездов: {t.legs.length}</span></summary>
            <ol className="traffic-itinerary">{t.legs.map((leg, i) => <li key={`${leg.job_id}-${i}`}><span className="traffic-stop-number">{i + 1}</span><div><b>{route.jobs[i]?.address || `Заявка #${leg.job_id}`}</b><p>Выезд {formatTime(leg.departure_at, timeZone)} → прибытие {formatTime(leg.arrival_at, timeZone)} <strong>{minutes(leg.duration_seconds)} мин</strong></p><small>Работа {formatTime(leg.service_start_at, timeZone)}–{formatTime(leg.service_finish_at, timeZone)}{leg.waiting_seconds > 0 ? ` · ожидание ${minutes(leg.waiting_seconds)} мин` : ''}{leg.late_to_plan_seconds > 0 ? ` · позже плана на ${minutes(leg.late_to_plan_seconds)} мин` : ''}</small></div></li>)}</ol>
          </details>
        </>}
      </article>
    })}</div>
  </section>
}
