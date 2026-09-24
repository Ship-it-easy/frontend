import React, { useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { buildRoutesMapModel, coordinatePoint } from './routesMapModel.js'
import { formatDate, formatTime } from './ui.jsx'
import { api } from './api.js'
import { congestionColor, frequentSegments, trafficRequest } from './trafficModel.js'
import TrafficRouteSummary from './TrafficRouteSummary.jsx'


function FitMap({ points }) {
  const map = useMap()
  useEffect(() => {
    if (points.length) map.fitBounds(points, { padding: [34, 34], maxZoom: 15 })
  }, [map, points])
  return null
}

function SequenceTooltip({ children }) {
  return <Tooltip permanent direction="center" className="map-sequence-label">{children}</Tooltip>
}

function JobPopup({ job, timeZone, prefix }) {
  return <Popup><div className="route-map-popup"><b>{prefix}{job.route_position ? ` · №${job.route_position}` : ''}</b><span>{job.address || 'Адрес не указан'}</span>{job.planned_start && <small>{formatTime(job.planned_start, timeZone)}–{formatTime(job.planned_end, timeZone)}</small>}{job.work_type && <small>{job.work_type}</small>}{job.sla_date && <small>SLA {formatDate(job.sla_date)}</small>}</div></Popup>
}

export default function RoutesMap({ day, planningDate, timeZone }) {
  const model = useMemo(() => buildRoutesMapModel(day), [day])
  const [geometry, setGeometry] = useState({ lines: {}, failed: 0, loading: false })
  const [departure, setDeparture] = useState('')
  const [showTraffic, setShowTraffic] = useState(true)
  const [accessMinutes, setAccessMinutes] = useState(0)
  const segments = useMemo(() => frequentSegments(geometry.lines), [geometry.lines])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const routable = model.routes.filter((route) => route.locations.length >= 2)
    setGeometry({ lines: {}, failed: 0, loading: routable.length > 0 })
    Promise.all(routable.map(async (route) => {
      const fallback = route.locations.map(coordinatePoint)
      try {
        const value = await api('/api/project/traffic/route', {
          method: 'POST',
          body: JSON.stringify(trafficRequest(route, planningDate, departure, timeZone, accessMinutes)),
          signal: controller.signal,
        })
        const line = value.legs.flatMap(leg => leg.points)
        const hasRoadLine = line.length >= 2
        return [String(route.engineerId), {
          points: hasRoadLine ? line : fallback,
          fallback: !hasRoadLine,
          traffic: value,
          warning: hasRoadLine ? null : 'Для этого переезда нет линии дороги; показана прямая линия.',
        }]
      } catch (error) {
        if (error.name === 'AbortError') return null
        return [String(route.engineerId), { points: fallback, fallback: true, error: error.message }]
      }
    })).then((entries) => {
      if (!active) return
      const values = entries.filter(Boolean)
      setGeometry({
        lines: Object.fromEntries(values),
        failed: values.filter(([, value]) => value.fallback).length,
        loading: false,
      })
    })
    return () => {
      active = false
      controller.abort()
    }
  }, [model.routes, planningDate, departure, timeZone, accessMinutes])

  if (!model.points.length) return <section className="routes-map-card empty-map"><div><span className="eyebrow">{formatDate(planningDate)}</span><h2>Карта маршрутов</h2><p>Для выбранного дня нет заявок или стартовых точек с координатами.</p>{model.missingCoordinateCount > 0 && <small>Без координат: {model.missingCoordinateCount}</small>}</div></section>

  return <section className="routes-map-card">
    <header><div><span className="eyebrow">{formatDate(planningDate)}</span><h2>Карта маршрутов</h2><p>Стартовые точки, последовательность заявок и маршруты всех инженеров выбранного дня.</p></div><div className="route-map-status">{geometry.loading && <span><i className="spinner" /> Строим дороги</span>}{model.missingCoordinateCount > 0 && <span className="map-warning">Без координат: {model.missingCoordinateCount}</span>}{geometry.failed > 0 && <span className="map-warning">Для {geometry.failed} маршрутов показаны прямые линии</span>}</div></header>
    <div className="route-map-legend">{model.routes.filter((route) => route.jobs.length).map((route) => <span key={route.engineerId}><i style={{ background: route.color }} />{route.engineerName}<small>{route.jobs.length}</small></span>)}{model.unassigned.length > 0 && <span><i className="unassigned" />Неназначенные<small>{model.unassigned.length}</small></span>}{model.cancelled.length > 0 && <span><i className="cancelled" />Отменённые<small>{model.cancelled.length}</small></span>}</div>
    <div className="traffic-controls"><label>Выезд для всех ({timeZone || 'Europe/Moscow'}) <input type="time" step="300" value={departure} onChange={e => setDeparture(e.target.value)} /></label><button type="button" onClick={() => setDeparture('')}>По опубликованному плану</button><label>Парковка и проход к клиенту <input type="number" min="0" max="120" step="1" value={accessMinutes} onChange={e => setAccessMinutes(Math.max(0, Math.min(120, Number(e.target.value) || 0)))} /> мин / заявка</label><label><input type="checkbox" checked={showTraffic} onChange={e => setShowTraffic(e.target.checked)} /> Окраска по замедлению</label><p>Коэффициент ×2 означает вдвое больше времени. Серый — нет данных. Пустое время выезда использует опубликованный план. Изменение выезда и времени доступа показывает прогноз; опубликованный план не изменяется.</p></div>
    <TrafficRouteSummary routes={model.routes} lines={geometry.lines} loading={geometry.loading} timeZone={timeZone} onDeparture={setDeparture} />
    {segments.length > 0 && <details className="traffic-table"><summary>Часто используемые участки в маршрутах инженеров — выбранный день</summary><p>Частота — число проездов в рассчитанных маршрутах, не городской транспортный поток. Коэффициент указан для первого проезда; точные границы — координаты дорожного манёвра.</p><table><thead><tr><th>Участок</th><th>Проездов</th><th>Первый въезд</th><th>Коэффициент</th></tr></thead><tbody>{segments.map((s, i) => <tr key={i}><td>{s.road}<small>{s.points[0].map(v => v.toFixed(4)).join(', ')} → {s.points.at(-1).map(v => v.toFixed(4)).join(', ')}</small></td><td>{s.count}</td><td>{formatTime(s.departure_at, timeZone)}</td><td>{s.coefficient == null ? 'Нет данных' : `×${s.coefficient}`}</td></tr>)}</tbody></table></details>}
    <MapContainer className="routes-map" center={model.points[0]} zoom={12} scrollWheelZoom>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
      <FitMap points={model.points} />
      {model.routes.map((route) => {
        const routeGeometry = geometry.lines[String(route.engineerId)]
        const fallback = route.locations.map(coordinatePoint)
        const line = routeGeometry?.points || fallback
        return <React.Fragment key={route.engineerId}>
          {showTraffic && routeGeometry?.traffic?.legs.flatMap(leg => leg.segments).map((segment, index) => segment.points.length >= 2 && <Polyline key={`traffic-${index}`} positions={segment.points} pathOptions={{ color: congestionColor(segment.coefficient), weight: 7, opacity: .9 }}><Popup><b>{segment.road}</b><p>{route.engineerName} · {formatTime(segment.departure_at, timeZone)} · {segment.coefficient == null ? 'Нет данных о пробках' : `×${segment.coefficient} (оценка)`}</p></Popup></Polyline>)}
          {line.length >= 2 && (!showTraffic || !routeGeometry?.traffic) && <Polyline positions={line} pathOptions={{ color: route.color, weight: 5, opacity: .82, dashArray: routeGeometry?.fallback ? '9 8' : undefined }} />}
          {route.start && <CircleMarker center={coordinatePoint(route.start)} radius={11} pathOptions={{ color: '#fff', weight: 3, fillColor: route.color, fillOpacity: 1 }}><SequenceTooltip>С</SequenceTooltip><Popup><div className="route-map-popup"><b>Старт · {route.engineerName}</b><span>{route.startAddress}</span><small>{route.transportType === 'CAR' ? 'Автомобиль' : 'Пеший маршрут'}</small></div></Popup></CircleMarker>}
          {route.jobs.map((job) => <CircleMarker key={job.job_id} center={coordinatePoint(job.coordinate)} radius={10} pathOptions={{ color: '#fff', weight: 3, fillColor: route.color, fillOpacity: 1 }}><SequenceTooltip>{job.route_position}</SequenceTooltip><JobPopup job={job} timeZone={timeZone} prefix={route.engineerName} /></CircleMarker>)}
        </React.Fragment>
      })}
      {model.unassigned.map((job) => <CircleMarker key={`unassigned-${job.job_id}`} center={coordinatePoint(job.coordinate)} radius={9} pathOptions={{ color: '#fff', weight: 3, fillColor: '#e28a12', fillOpacity: 1 }}><SequenceTooltip>!</SequenceTooltip><JobPopup job={job} timeZone={timeZone} prefix="Неназначенная заявка" /></CircleMarker>)}
      {model.cancelled.map((job) => <CircleMarker key={`cancelled-${job.job_id}`} center={coordinatePoint(job.coordinate)} radius={9} pathOptions={{ color: '#fff', weight: 3, fillColor: '#7b8797', fillOpacity: .9 }}><SequenceTooltip>×</SequenceTooltip><JobPopup job={job} timeZone={timeZone} prefix={`Отменена · ${job.engineer_name}`} /></CircleMarker>)}
    </MapContainer>
  </section>
}
