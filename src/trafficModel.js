import { transportProfile } from './transport.js'

export function projectTrafficRouteUrl(projectId) {
  if (!Number.isInteger(Number(projectId)) || Number(projectId) <= 0) {
    throw new Error('Не выбран участок для построения маршрута')
  }
  return `/api/projects/${projectId}/workspace/traffic/route`
}

export function departureInstant(day, clock, timeZone = 'Europe/Moscow') {
  const wall = Date.parse(`${day}T${clock.slice(0, 5)}:00Z`)
  if (!Number.isFinite(wall)) throw new Error('Не указано время выезда')
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
  let instant = wall
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(formatter.formatToParts(instant).map(x => [x.type, x.value]))
    const rendered = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`)
    instant += wall - rendered
  }
  return new Date(instant).toISOString()
}

export function trafficRequest(route, day, clock, timeZone, accessMinutes = 0) {
  if (!route.start || route.missingCoordinateCount) throw new Error('Не хватает координат для полного маршрута')
  if (!clock && !route.plannedDeparture && !route.shiftStart) throw new Error('Не указано время выезда')
  return {
    departure_at: clock
      ? departureInstant(day, clock, timeZone)
      : route.plannedDeparture || departureInstant(day, route.shiftStart, timeZone),
    profile: transportProfile(route.transportType || 'NONE'),
    stops: [{ ...route.start }, ...route.jobs.map(job => ({
      ...job.coordinate, job_id: job.job_id,
      service_seconds: Math.max(0, Math.round(Number(job.duration_min || 0) * 60)),
      not_before: job.time_window_start
        ? departureInstant(day, job.time_window_start, timeZone)
        : null,
      planned_start: job.planned_start || null,
      access_seconds: Math.round(accessMinutes * 60),
    }))],
  }
}

export function clockInZone(instant, timeZone = 'Europe/Moscow') {
  return new Intl.DateTimeFormat('en-GB', {timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(new Date(instant))
}

export function sameLocalDay(a, b, timeZone = 'Europe/Moscow') {
  const f = new Intl.DateTimeFormat('en-CA', {timeZone, year: 'numeric', month: '2-digit', day: '2-digit'})
  return f.format(new Date(a)) === f.format(new Date(b))
}

export function routeTime(instant, departure, timeZone = 'Europe/Moscow') {
  const clock = clockInZone(instant, timeZone)
  if (sameLocalDay(instant, departure, timeZone)) return clock
  return `${new Intl.DateTimeFormat('ru-RU', {timeZone, day: '2-digit', month: '2-digit'}).format(new Date(instant))} ${clock}`
}

export function congestionColor(k) {
  return k == null ? '#64748b' : k < 1.25 ? '#15965c' : k < 1.7 ? '#db9d0b' : k < 2.2 ? '#e66a19' : '#cd3346'
}

export function frequentSegments(lines) {
  const sections = new Map()
  for (const value of Object.values(lines)) for (const leg of value.traffic?.legs || []) for (const s of leg.segments) {
    const key = JSON.stringify([s.road, s.points[0], s.points.at(-1)])
    const row = sections.get(key) || { ...s, count: 0, totalSeconds: 0 }
    row.count++
    row.totalSeconds += s.duration_seconds
    sections.set(key, row)
  }
  return [...sections.values()].sort((a, b) => b.count - a.count || b.totalSeconds - a.totalSeconds).slice(0, 20)
}
