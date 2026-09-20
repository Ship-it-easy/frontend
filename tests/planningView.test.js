import assert from 'node:assert/strict'
import test from 'node:test'

import { matchesPlanningFilters, readinessTarget, selectPlanningDate } from '../src/planningView.js'

const job = {
  address: 'Пермь, улица Ленина, 1',
  work_type: 'Диагностика',
  priority_type: 'EMERGENCY',
  status: 'NEW',
  outcome: 'UNASSIGNED_TODAY',
}

test('planning filters combine search, priority, status and outcome', () => {
  assert.equal(matchesPlanningFilters(job, { search: 'ленина', priority: 'EMERGENCY', status: 'NEW', outcome: 'UNASSIGNED_TODAY' }), true)
  assert.equal(matchesPlanningFilters(job, { search: 'монтаж', priority: '', status: '', outcome: 'ALL' }), false)
  assert.equal(matchesPlanningFilters(job, { search: '', priority: '', status: '', outcome: 'ASSIGNED' }), false)
})

test('selected day is preserved only inside the current seven-day range', () => {
  const days = [{ date: '2026-09-19' }, { date: '2026-09-20' }]
  assert.equal(selectPlanningDate(days, '2026-09-20', '2026-09-19'), '2026-09-20')
  assert.equal(selectPlanningDate(days, '2026-09-30', '2026-09-19'), '2026-09-19')
})

test('owner readiness sends unavailable settings to project management', () => {
  assert.equal(readinessTarget('parameters', true), 'projects')
  assert.equal(readinessTarget('catalogs', true), 'projects')
  assert.equal(readinessTarget('engineers', true), 'engineers')
  assert.equal(readinessTarget('catalogs', false), 'catalogs')
})
