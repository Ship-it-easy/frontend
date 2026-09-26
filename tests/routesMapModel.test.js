import assert from 'node:assert/strict'
import test from 'node:test'

import { buildRoutesMapModel, decodePolyline6, mapBoundsSignature, routeForecastSignature, routeGeometrySignature, validCoordinate } from '../src/routesMapModel.js'

test('route map model keeps route order and reports jobs without coordinates', () => {
  const day = {
    engineer_columns: [{
      engineer_id: 7,
      name: 'Иван Петров',
      transport_type: 'CAR',
      start_address: 'База',
      start_coordinate: { latitude: '58.01', longitude: '56.23' },
      jobs: [
        { job_id: 2, route_position: 2, coordinate: { latitude: 58.03, longitude: 56.25 } },
        { job_id: 1, route_position: 1, coordinate: { latitude: 58.02, longitude: 56.24 } },
        { job_id: 3, route_position: 3, coordinate: null },
      ],
      cancelled_jobs: [],
    }],
    unassigned: {
      moved: [{ job_id: 4, coordinate: { latitude: 58.04, longitude: 56.26 } }],
      horizon: [{ job_id: 5, coordinate: null }],
    },
  }

  const model = buildRoutesMapModel(day)

  assert.deepEqual(model.routes[0].jobs.map((job) => job.job_id), [1, 2])
  assert.equal(model.routes[0].locations.length, 3)
  assert.deepEqual(model.unassigned.map((job) => job.job_id), [4])
  assert.equal(model.points.length, 4)
  assert.equal(model.missingCoordinateCount, 2)
})

test('coordinate validation rejects incomplete and out-of-range values', () => {
  assert.equal(validCoordinate({ latitude: '58.01', longitude: '56.23' }), true)
  assert.equal(validCoordinate({ latitude: null, longitude: 56.23 }), false)
  assert.equal(validCoordinate({ latitude: 91, longitude: 56.23 }), false)
})

test('polyline6 decoder returns precise route points', () => {
  assert.deepEqual(decodePolyline6('A?@A'), [[0.000001, 0], [0, 0.000001]])
  assert.deepEqual(decodePolyline6('A'), [])
})

test('map bounds signature changes only when the visible bounds change', () => {
  const original = [[58.01, 56.23], [58.03, 56.25]]
  const refreshed = [[58.03, 56.25], [58.01, 56.23], [58.01, 56.23]]

  assert.equal(mapBoundsSignature(original), mapBoundsSignature(refreshed))
  assert.notEqual(mapBoundsSignature(original), mapBoundsSignature([...original, [58.04, 56.26]]))
})

test('route geometry signature ignores response identity but tracks route order', () => {
  const route = {
    engineerId: 7,
    transportType: 'CAR',
    locations: [
      { latitude: 58.01, longitude: 56.23 },
      { latitude: 58.03, longitude: 56.25 },
    ],
  }

  assert.equal(routeGeometrySignature([route]), routeGeometrySignature([{ ...route, locations: route.locations.map((point) => ({ ...point })) }]))
  assert.notEqual(routeGeometrySignature([route]), routeGeometrySignature([{ ...route, locations: [...route.locations].reverse() }]))
})

test('forecast refreshes when plan timings change without moving stops', () => {
  const original = {
    engineerId: 7,
    transportType: 'PUBLIC_TRANSPORT',
    locations: [{ latitude: 55.7, longitude: 37.5 }, { latitude: 55.8, longitude: 37.6 }],
    plannedDeparture: '2026-09-26T06:00:00Z',
    jobs: [{ job_id: 1, duration_min: 30, planned_start: '2026-09-26T07:00:00Z' }],
  }
  const changed = {
    ...original,
    plannedDeparture: '2026-09-26T07:00:00Z',
    jobs: [{ ...original.jobs[0], duration_min: 90 }],
  }
  assert.equal(routeGeometrySignature([original]), routeGeometrySignature([changed]))
  assert.notEqual(routeForecastSignature([original]), routeForecastSignature([changed]))
  assert.equal(routeForecastSignature([original]), routeForecastSignature([{ ...original }]))
})
