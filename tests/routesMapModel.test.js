import assert from 'node:assert/strict'
import test from 'node:test'

import { buildRoutesMapModel, decodePolyline6, validCoordinate } from '../src/routesMapModel.js'

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
