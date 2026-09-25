const ROUTE_COLORS = ['#1478e8', '#dc4c64', '#12a174', '#8b5cf6', '#e28a12', '#0891b2', '#db5f18', '#64748b']

const safeArray = (value) => Array.isArray(value) ? value : []

export function validCoordinate(value) {
  if (!value || value.latitude == null || value.longitude == null || value.latitude === '' || value.longitude === '') return false
  const latitude = Number(value.latitude)
  const longitude = Number(value.longitude)
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
}

export function coordinatePoint(value) {
  return [Number(value.latitude), Number(value.longitude)]
}

export function mapBoundsSignature(points) {
  return [...new Set(safeArray(points)
    .filter((point) => Array.isArray(point) && point.length >= 2 && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])))
    .map((point) => `${Number(point[0])},${Number(point[1])}`))]
    .sort()
    .join('|')
}

export function routeGeometrySignature(routes) {
  return safeArray(routes).map((route) => {
    const locations = safeArray(route?.locations)
      .filter(validCoordinate)
      .map((location) => coordinatePoint(location).join(','))
      .join(';')
    return `${route?.engineerId ?? ''}:${route?.transportType || ''}:${locations}`
  }).sort().join('|')
}

export function decodePolyline6(encoded) {
  if (typeof encoded !== 'string' || !encoded.length) return []
  let index = 0
  let latitude = 0
  let longitude = 0
  const result = []
  while (index < encoded.length) {
    let shift = 0, value = 0, byte
    do {
      if (index >= encoded.length) return []
      byte = encoded.charCodeAt(index++) - 63
      value |= (byte & 31) << shift
      shift += 5
    } while (byte >= 32)
    latitude += value & 1 ? ~(value >> 1) : value >> 1
    shift = 0
    value = 0
    do {
      if (index >= encoded.length) return []
      byte = encoded.charCodeAt(index++) - 63
      value |= (byte & 31) << shift
      shift += 5
    } while (byte >= 32)
    longitude += value & 1 ? ~(value >> 1) : value >> 1
    result.push([latitude / 1e6, longitude / 1e6])
  }
  return result.filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon))
}

function colorFor(engineerId, fallbackIndex) {
  const numericId = Number(engineerId)
  const index = Number.isInteger(numericId) ? Math.abs(numericId) : fallbackIndex
  return ROUTE_COLORS[index % ROUTE_COLORS.length]
}

export function buildRoutesMapModel(day) {
  const columns = safeArray(day?.engineer_columns)
  const routes = columns.map((column, index) => {
    const jobs = safeArray(column.jobs)
      .slice()
      .sort((left, right) => Number(left.route_position || 0) - Number(right.route_position || 0))
    const visibleJobs = jobs.filter((job) => validCoordinate(job.coordinate))
    const start = validCoordinate(column.start_coordinate) ? column.start_coordinate : null
    const firstJob = visibleJobs[0]
    const plannedDeparture = firstJob?.planned_arrival
      ? new Date(new Date(firstJob.planned_arrival).getTime() - Number(firstJob.travel_from_previous_min || 0) * 60_000).toISOString()
      : null
    return {
      engineerId: column.engineer_id,
      engineerName: column.name || `Инженер #${column.engineer_id}`,
      transportType: column.transport_type || 'NONE',
      startAddress: column.start_address || 'Стартовая точка',
      start,
      shiftStart: column.shift_start,
      plannedDeparture,
      jobs: visibleJobs,
      locations: [start, ...visibleJobs.map((job) => job.coordinate)].filter(Boolean),
      color: colorFor(column.engineer_id, index),
      missingCoordinateCount: jobs.length - visibleJobs.length,
    }
  }).filter((route) => route.jobs.length || route.start)

  const unassignedJobs = [
    ...safeArray(day?.unassigned?.moved),
    ...safeArray(day?.unassigned?.horizon),
  ]
  const cancelledJobs = columns.flatMap((column) => safeArray(column.cancelled_jobs).map((job) => ({
    ...job,
    engineer_id: column.engineer_id,
    engineer_name: column.name,
  })))

  const unassigned = unassignedJobs.filter((job) => validCoordinate(job.coordinate))
  const cancelled = cancelledJobs.filter((job) => validCoordinate(job.coordinate))
  const points = [
    ...routes.flatMap((route) => route.locations.map(coordinatePoint)),
    ...unassigned.map((job) => coordinatePoint(job.coordinate)),
    ...cancelled.map((job) => coordinatePoint(job.coordinate)),
  ]

  return {
    routes,
    unassigned,
    cancelled,
    points,
    missingCoordinateCount: routes.reduce((total, route) => total + route.missingCoordinateCount, 0)
      + unassignedJobs.length - unassigned.length
      + cancelledJobs.length - cancelled.length,
  }
}
