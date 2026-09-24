import test from 'node:test'
import assert from 'node:assert/strict'
import { departureInstant, trafficRequest, congestionColor, sameLocalDay, routeTime } from './trafficModel.js'

test('midnight is evaluated in project timezone and arrival shows the new date', () => {
  const start = '2026-09-23T20:55:00Z'
  const next = '2026-09-23T21:05:00Z'
  assert.equal(sameLocalDay(start, next, 'Europe/Moscow'), false)
  assert.equal(sameLocalDay(start, next, 'Asia/Yekaterinburg'), true)
  assert.equal(routeTime(next, start, 'Europe/Moscow'), '24.09 00:05')
})

test('departure uses project timezone, independent of browser timezone', () => {
  assert.equal(departureInstant('2026-09-23', '08:15', 'Europe/Moscow'), '2026-09-23T05:15:00.000Z')
  assert.equal(departureInstant('2026-09-23', '08:15', 'Asia/Yekaterinburg'), '2026-09-23T03:15:00.000Z')
})
test('engineer stops retain service times and appointments', () => {
  const route = {start: { latitude: 55.8, longitude: 37.4 }, shiftStart: '09:00:00', transportType: 'CAR', jobs: [{job_id: 3, coordinate: {latitude: 55.9, longitude: 37.5}, duration_min: 90, planned_start: '2026-09-23T08:00:00Z'}]}
  const body = trafficRequest(route, '2026-09-23', '', 'Europe/Moscow')
  assert.equal(body.stops[1].service_seconds, 5400)
  assert.equal(body.stops[1].job_id, 3)
  assert.equal(body.stops[1].planned_start, '2026-09-23T08:00:00Z')
  assert.equal(body.departure_at, '2026-09-23T06:00:00.000Z')
  assert.throws(() => trafficRequest({...route, missingCoordinateCount: 1}, '2026-09-23', '', 'Europe/Moscow'))
  assert.notEqual(congestionColor(null), congestionColor(1))
  assert.equal(trafficRequest(route, '2026-09-23', '08:05', 'Europe/Moscow', 7).stops[1].access_seconds, 420)
})
