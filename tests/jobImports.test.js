import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ACTIVE_PLANNING_EVENT_STATES,
  buildApplyRequest,
  canApplyBatch,
  planningEventStatusText,
  POLLING_STATUSES,
} from '../src/jobImportsModel.js'

test('apply request matches backend idempotency and warning contract', () => {
  const request = buildApplyRequest(true, '00000000-0000-4000-8000-000000000001')
  assert.equal(request.method, 'POST')
  assert.equal(request.headers['Idempotency-Key'], '00000000-0000-4000-8000-000000000001')
  assert.deepEqual(JSON.parse(request.body), { acknowledge_warnings: true })
})

test('ready batch requires warning acknowledgement only when warnings exist', () => {
  assert.equal(canApplyBatch({ status: 'READY_TO_APPLY', warning_count: 0 }, false), true)
  assert.equal(canApplyBatch({ status: 'READY_TO_APPLY', warning_count: 2 }, false), false)
  assert.equal(canApplyBatch({ status: 'READY_TO_APPLY', warning_count: 2 }, true), true)
  assert.equal(canApplyBatch({ status: 'HAS_ERRORS', warning_count: 0 }, true), false)
})

test('polling is limited to active server states', () => {
  assert.equal(POLLING_STATUSES.has('VALIDATING'), true)
  assert.equal(POLLING_STATUSES.has('READY_TO_APPLY'), false)
  assert.equal(POLLING_STATUSES.has('HAS_ERRORS'), false)
  assert.equal(POLLING_STATUSES.has('TECHNICAL_ERROR'), false)
})

test('planning event status is localized and only active states are polled', () => {
  assert.equal(ACTIVE_PLANNING_EVENT_STATES.has('PENDING'), true)
  assert.equal(ACTIVE_PLANNING_EVENT_STATES.has('PUBLISHED'), false)
  assert.equal(planningEventStatusText('PUBLISHED'), 'план обновлён')
  assert.equal(planningEventStatusText('UNKNOWN'), 'состояние уточняется')
})
