import React, { useEffect, useMemo, useRef, useState } from 'react'
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { buildRoutesMapModel, coordinatePoint, decodePolyline6, mapBoundsSignature, routeGeometrySignature } from './routesMapModel.js'
import { formatDate, formatTime } from './ui.jsx'

const VALHALLA_URL = (import.meta.env.VITE_VALHALLA_URL || '/valhalla').replace(/\/$/, '')

function FitMap({ points, resetKey }) {
  const map = useMap()
  const userChangedView = useRef(false)
  const previousResetKey = useRef(resetKey)

  useEffect(() => {
    const container = map.getContainer()
    const markUserInteraction = () => { userChangedView.current = true }
    container.addEventListener('pointerdown', markUserInteraction)
    container.addEventListener('wheel', markUserInteraction, { passive: true })
    container.addEventListener('keydown', markUserInteraction)
    return () => {
      container.removeEventListener('pointerdown', markUserInteraction)
      container.removeEventListener('wheel', markUserInteraction)
      container.removeEventListener('keydown', markUserInteraction)
    }
  }, [map])

  useEffect(() => {
    const contextChanged = previousResetKey.current !== resetKey
    if (contextChanged) {
      previousResetKey.current = resetKey
      userChangedView.current = false
    }
    if (points.length && (!userChangedView.current || contextChanged)) map.fitBounds(points, { padding: [34, 34], maxZoom: 15 })
  }, [map, points, resetKey])
  return null
}

function useStableValue(value, signature) {
  const ref = useRef({ signature, value })
  if (ref.current.signature !== signature) ref.current = { signature, value }
  return ref.current.value
}

function SequenceTooltip({ children }) {
  return <Tooltip permanent direction="center" className="map-sequence-label">{children}</Tooltip>
}

function JobPopup({ job, timeZone, prefix }) {
  return <Popup><div className="route-map-popup"><b>{prefix}{job.route_position ? ` · №${job.route_position}` : ''}</b><span>{job.address || 'Адрес не указан'}</span>{job.planned_start && <small>{formatTime(job.planned_start, timeZone)}–{formatTime(job.planned_end, timeZone)}</small>}{job.work_type && <small>{job.work_type}</small>}{job.sla_date && <small>SLA {formatDate(job.sla_date)}</small>}</div></Popup>
}

export default function RoutesMap({ day, planningDate, timeZone }) {
  const model = useMemo(() => buildRoutesMapModel(day), [day])
  const stablePoints = useStableValue(model.points, mapBoundsSignature(model.points))
  const stableRoutes = useStableValue(model.routes, routeGeometrySignature(model.routes))
  const [geometry, setGeometry] = useState({ lines: {}, failed: 0, loading: false })

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const routable = stableRoutes.filter((route) => route.locations.length >= 2)
    setGeometry({ lines: {}, failed: 0, loading: routable.length > 0 })
    Promise.all(routable.map(async (route) => {
      const fallback = route.locations.map(coordinatePoint)
      try {
        const response = await fetch(`${VALHALLA_URL}/route`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            locations: route.locations.map((coordinate) => ({ lat: Number(coordinate.latitude), lon: Number(coordinate.longitude) })),
            costing: route.transportType === 'CAR' ? 'auto' : 'pedestrian',
            shape_format: 'polyline6',
          }),
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Valhalla route failed')
        const value = await response.json()
        const line = (value?.trip?.legs || []).flatMap((leg, index) => {
          const decoded = decodePolyline6(leg?.shape)
          return index ? decoded.slice(1) : decoded
        })
        if (line.length < 2) throw new Error('Valhalla returned no geometry')
        return [String(route.engineerId), { points: line, fallback: false }]
      } catch (error) {
        if (error.name === 'AbortError') return null
        return [String(route.engineerId), { points: fallback, fallback: true }]
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
  }, [stableRoutes])

  if (!model.points.length) return <section className="routes-map-card empty-map"><div><span className="eyebrow">{formatDate(planningDate)}</span><h2>Карта маршрутов</h2><p>Для выбранного дня нет заявок или стартовых точек с координатами.</p>{model.missingCoordinateCount > 0 && <small>Без координат: {model.missingCoordinateCount}</small>}</div></section>

  return <section className="routes-map-card">
    <header><div><span className="eyebrow">{formatDate(planningDate)}</span><h2>Карта маршрутов</h2><p>Стартовые точки, последовательность заявок и маршруты всех инженеров выбранного дня.</p></div><div className="route-map-status">{geometry.loading && <span><i className="spinner" /> Строим дороги</span>}{model.missingCoordinateCount > 0 && <span className="map-warning">Без координат: {model.missingCoordinateCount}</span>}{geometry.failed > 0 && <span className="map-warning">Для {geometry.failed} маршрутов показаны прямые линии</span>}</div></header>
    <div className="route-map-legend">{model.routes.filter((route) => route.jobs.length).map((route) => <span key={route.engineerId}><i style={{ background: route.color }} />{route.engineerName}<small>{route.jobs.length}</small></span>)}{model.unassigned.length > 0 && <span><i className="unassigned" />Неназначенные<small>{model.unassigned.length}</small></span>}{model.cancelled.length > 0 && <span><i className="cancelled" />Отменённые<small>{model.cancelled.length}</small></span>}</div>
    <MapContainer className="routes-map" center={model.points[0]} zoom={12} scrollWheelZoom>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
      <FitMap points={stablePoints} resetKey={planningDate} />
      {model.routes.map((route) => {
        const routeGeometry = geometry.lines[String(route.engineerId)]
        const fallback = route.locations.map(coordinatePoint)
        const line = routeGeometry?.points || fallback
        return <React.Fragment key={route.engineerId}>
          {line.length >= 2 && <Polyline positions={line} pathOptions={{ color: route.color, weight: 5, opacity: .82, dashArray: routeGeometry?.fallback ? '9 8' : undefined }} />}
          {route.start && <CircleMarker center={coordinatePoint(route.start)} radius={11} pathOptions={{ color: '#fff', weight: 3, fillColor: route.color, fillOpacity: 1 }}><SequenceTooltip>С</SequenceTooltip><Popup><div className="route-map-popup"><b>Старт · {route.engineerName}</b><span>{route.startAddress}</span><small>{route.transportType === 'CAR' ? 'Автомобиль' : 'Пеший маршрут'}</small></div></Popup></CircleMarker>}
          {route.jobs.map((job) => <CircleMarker key={job.job_id} center={coordinatePoint(job.coordinate)} radius={10} pathOptions={{ color: '#fff', weight: 3, fillColor: route.color, fillOpacity: 1 }}><SequenceTooltip>{job.route_position}</SequenceTooltip><JobPopup job={job} timeZone={timeZone} prefix={route.engineerName} /></CircleMarker>)}
        </React.Fragment>
      })}
      {model.unassigned.map((job) => <CircleMarker key={`unassigned-${job.job_id}`} center={coordinatePoint(job.coordinate)} radius={9} pathOptions={{ color: '#fff', weight: 3, fillColor: '#e28a12', fillOpacity: 1 }}><SequenceTooltip>!</SequenceTooltip><JobPopup job={job} timeZone={timeZone} prefix="Неназначенная заявка" /></CircleMarker>)}
      {model.cancelled.map((job) => <CircleMarker key={`cancelled-${job.job_id}`} center={coordinatePoint(job.coordinate)} radius={9} pathOptions={{ color: '#fff', weight: 3, fillColor: '#7b8797', fillOpacity: .9 }}><SequenceTooltip>×</SequenceTooltip><JobPopup job={job} timeZone={timeZone} prefix={`Отменена · ${job.engineer_name}`} /></CircleMarker>)}
    </MapContainer>
  </section>
}
