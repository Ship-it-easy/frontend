import React, { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const VALHALLA = import.meta.env.VITE_VALHALLA_URL || '/valhalla'
const asArray = (value) => Array.isArray(value) ? value : []
const validCoordinate = (value) => value && Number.isFinite(Number(value.latitude)) && Number.isFinite(Number(value.longitude))
const point = (value) => [Number(value.latitude), Number(value.longitude)]

function decode(encoded) {
  if (typeof encoded !== 'string' || !encoded.length) return []
  let index = 0, latitude = 0, longitude = 0
  const result = []
  while (index < encoded.length) {
    let shift = 0, value = 0, byte
    do { if (index >= encoded.length) return []; byte = encoded.charCodeAt(index++) - 63; value |= (byte & 31) << shift; shift += 5 } while (byte >= 32)
    latitude += value & 1 ? ~(value >> 1) : value >> 1
    shift = 0; value = 0
    do { if (index >= encoded.length) return []; byte = encoded.charCodeAt(index++) - 63; value |= (byte & 31) << shift; shift += 5 } while (byte >= 32)
    longitude += value & 1 ? ~(value >> 1) : value >> 1
    result.push([latitude / 1e6, longitude / 1e6])
  }
  return result.filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon))
}

function Fit({ points }) {
  const map = useMap()
  useEffect(() => { if (points.length) map.fitBounds(points, { padding: [30, 30] }) }, [map, points])
  return null
}

export default function RoutesMap({ result }) {
  const [lines, setLines] = useState({})
  const { routes, jobs, engineers } = useMemo(() => {
    const snapshot = result?.run?.input_snapshot || {}
    const jobMap = Object.fromEntries(asArray(snapshot.jobs).filter((item) => item?.id != null).map((item) => [item.id, item.coordinate]))
    const engineerMap = Object.fromEntries(asArray(snapshot.engineers).filter((item) => item?.id != null).map((item) => [item.id, item]))
    return { routes: asArray(result?.routes), jobs: jobMap, engineers: engineerMap }
  }, [result])

  const locationsFor = (route) => [engineers[route.engineer_id]?.coordinate, ...asArray(route.jobs).map((job) => jobs[job.job_id])].filter(validCoordinate)
  const points = routes.flatMap((route) => locationsFor(route).map(point))

  useEffect(() => {
    let cancelled = false
    Promise.all(routes.map(async (route) => {
      const engineer = engineers[route.engineer_id]
      const locations = locationsFor(route)
      if (locations.length < 2) return [route.engineer_id, locations.map(point)]
      try {
        const response = await fetch(`${VALHALLA}/route`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locations: locations.map((item) => ({ lat: Number(item.latitude), lon: Number(item.longitude) })), costing: engineer?.transport_type === 'CAR' ? 'auto' : 'pedestrian', shape_format: 'polyline6' }),
        })
        if (!response.ok) throw new Error('Valhalla route failed')
        const data = await response.json()
        const line = asArray(data?.trip?.legs).flatMap((leg, index) => { const decoded = decode(leg?.shape); return index ? decoded.slice(1) : decoded })
        return [route.engineer_id, line.length ? line : locations.map(point)]
      } catch { return [route.engineer_id, locations.map(point)] }
    })).then((value) => { if (!cancelled) setLines(Object.fromEntries(value)) })
    return () => { cancelled = true }
  }, [routes, engineers, jobs])

  if (!points.length) return <section className="map-result"><h2>Карта маршрутов</h2><p>В этом расчёте нет назначенных заявок с корректными координатами.</p></section>
  return <section className="map-result"><h2>Карта маршрутов</h2><MapContainer className="routes-map" center={points[0]} zoom={12}><TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" /><Fit points={points} />{routes.map((route, index) => {
    const engineer = engineers[route.engineer_id]
    const markers = locationsFor(route)
    const line = asArray(lines[route.engineer_id]).length ? lines[route.engineer_id] : markers.map(point)
    const color = ['#2563eb', '#dc2626', '#16a34a', '#9333ea'][index % 4]
    return <React.Fragment key={route.engineer_id}><Polyline positions={line} pathOptions={{ color, weight: 5 }} />{validCoordinate(engineer?.coordinate) && <Marker position={point(engineer.coordinate)}><Popup>Инженер #{route.engineer_id} · {engineer.transport_type === 'CAR' ? 'автомобиль' : 'пешком'}</Popup></Marker>}{asArray(route.jobs).map((job) => validCoordinate(jobs[job.job_id]) && <Marker key={job.job_id} position={point(jobs[job.job_id])}><Popup>Заявка #{job.job_id}<br />{job.planned_start ? new Date(job.planned_start).toLocaleTimeString('ru-RU') : 'Время не указано'}</Popup></Marker>)}</React.Fragment>
  })}</MapContainer></section>
}
