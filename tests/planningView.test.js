import assert from 'node:assert/strict'
import test from 'node:test'

import { matchesPlanningFilters, planningDaySummary, readinessTarget, selectPlanningDate } from '../src/planningView.js'

const job = {
  address: 'Пермь, улица Ленина, 1',
  work_type: 'Диагностика',
  priority: 'CRITICAL',
  status: 'NEW',
  outcome: 'UNASSIGNED_TODAY',
}

test('planning filters combine search, priority, status and outcome', () => {
  assert.equal(matchesPlanningFilters(job, { search: 'ленина', priority: 'CRITICAL', status: 'NEW', outcome: 'UNASSIGNED_TODAY' }), true)
  assert.equal(matchesPlanningFilters(job, { search: 'монтаж', priority: '', status: '', outcome: 'ALL' }), false)
  assert.equal(matchesPlanningFilters(job, { search: '', priority: '', status: '', outcome: 'ASSIGNED' }), false)
})

test('selected day is preserved only inside the current seven-day range', () => {
  const days = [{ date: '2026-09-19' }, { date: '2026-09-20' }]
  assert.equal(selectPlanningDate(days, '2026-09-20', '2026-09-19'), '2026-09-20')
  assert.equal(selectPlanningDate(days, '2026-09-30', '2026-09-19'), '2026-09-19')
})

test('selected day separates moved jobs from jobs unassigned in the horizon', () => {
  const item = { date: '2026-09-22', assigned_count: 25, unassigned_count: 31 }
  const day = { unassigned: { moved: Array(26).fill({}), horizon: Array(5).fill({}) } }

  assert.deepEqual(planningDaySummary(item, item.date, day), {
    assigned: 25,
    moved: 26,
    horizon: 5,
    unassignedToday: null,
  })
  assert.deepEqual(planningDaySummary(item, '2026-09-23', day), {
    assigned: 25,
    moved: null,
    horizon: null,
    unassignedToday: 31,
  })
})

test('owner readiness sends unavailable settings to project management', () => {
  assert.equal(readinessTarget('parameters', true), 'projects')
  assert.equal(readinessTarget('catalogs', true), 'projects')
  assert.equal(readinessTarget('engineers', true), 'engineers')
  assert.equal(readinessTarget('catalogs', false), 'catalogs')
})
