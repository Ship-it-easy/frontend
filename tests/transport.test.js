import test from 'node:test'
import assert from 'node:assert/strict'
import { transportOptions } from '../src/transport.js'
import { trafficRequest } from '../src/trafficModel.js'

for (const option of transportOptions) {
  test(option.label + ': map request keeps selected transport', () => {
    const request = trafficRequest({
      transportType: option.value, start: { latitude: 55.8, longitude: 37.4 },
      shiftStart: '09:00', jobs: [],
    }, '2026-09-25', '', 'Europe/Moscow')
    assert.equal(request.profile, option.profile)
  })
}

test('historical public transport route is displayed as walking', () => {
  const request = trafficRequest({
    transportType: 'PUBLIC_TRANSPORT',
    start: { latitude: 55.8, longitude: 37.4 },
    shiftStart: '09:00', jobs: [],
  }, '2026-09-25', '', 'Europe/Moscow')
  assert.equal(request.profile, 'pedestrian')
  assert.equal(transportOptions.some(option => option.value === 'PUBLIC_TRANSPORT'), false)
})
