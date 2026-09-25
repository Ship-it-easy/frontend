import assert from 'node:assert/strict'
import test from 'node:test'

import { buildPlanComparison, buildPlanningMetricsComparison, matchesPlanningFilters, planChangeExplanation, planChangeReason, planChangeTitle, planComparisonCause, planningDaySummary, planningTriggerSummary, readinessTarget, selectPlanningDate, unassignedChangeExplanation } from '../src/planningView.js'

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

test('plan comparison separates changed and preserved assignments', () => {
  const comparison = buildPlanComparison({
    version: { version_number: 3 },
    assignments: [{ job_id: 1 }, { job_id: 2 }, { job_id: 3 }],
    changes: [
      { job_id: 1, change_type: 'CHANGED' },
      { job_id: 4, change_type: 'DISPLACED' },
    ],
    comparison: { previous_version_number: 2 },
  })

  assert.equal(comparison.previousVersionNumber, 2)
  assert.deepEqual(comparison.unchanged.map((item) => item.job_id), [2, 3])
  assert.deepEqual(comparison.counts, {
    changed: 2,
    assigned: 0,
    replanned: 1,
    removed: 1,
    unchanged: 2,
  })
})

test('plan comparison explains the visible kind and cause of a move', () => {
  const change = {
    change_type: 'CHANGED',
    reason: 'ENGINEER_UNAVAILABLE',
    old_assignment: { planning_date: '2026-09-24', engineer_id: 1 },
    new_assignment: { planning_date: '2026-09-25', engineer_id: 2 },
  }

  assert.equal(planChangeTitle(change), 'Заявка перенесена на другую дату')
  assert.match(planChangeReason(change), /инженер стал недоступен/i)
  assert.match(
    planChangeExplanation(
      { ...change, explanation_context: { related_assignment_job_ids: [9] } },
      {},
    ).cause,
    /инженер стал недоступен/i,
  )
})

test('plan comparison uses server version metadata and precise reason text', () => {
  const comparison = buildPlanComparison({
    version: { version_number: 8 },
    assignments: [],
    changes: [],
    comparison: { previous_version_number: 6, unchanged_count: 0 },
  })
  const constraintOnlyChange = {
    change_type: 'CHANGED',
    old_assignment: { planning_date: '2026-09-24', engineer_id: 1 },
    new_assignment: { planning_date: '2026-09-24', engineer_id: 1 },
    reason: 'NO_EQUIPMENT',
    reason_detail: { text: 'Недоступно обязательное оборудование: Лестница' },
  }

  assert.equal(comparison.previousVersionNumber, 6)
  assert.equal(planChangeTitle(constraintOnlyChange), 'Изменились условия назначения')
  assert.equal(
    planChangeReason(constraintOnlyChange),
    'Недоступно обязательное оборудование: Лестница',
  )
})

test('plan comparison includes changed and unchanged unassigned outcomes', () => {
  const comparison = buildPlanComparison({
    version: { version_number: 4 },
    assignments: [{ job_id: 1 }],
    changes: [],
    comparison: {
      previous_version_number: 3,
      unchanged_count: 2,
      unassigned_changes: [
        {
          job_id: 2,
          change_type: 'UNASSIGNED_REASON_CHANGED',
          previous_reason: { code: 'NO_SHIFT' },
          current_reason: { code: 'NO_EQUIPMENT' },
        },
      ],
      unchanged_unassigned: [{ job_id: 3, reason: { code: 'NO_SHIFT' } }],
    },
  })

  assert.equal(comparison.counts.changed, 1)
  assert.equal(comparison.counts.unchanged, 2)
  assert.equal(comparison.unassignedChanges[0].job_id, 2)
  assert.equal(comparison.unchangedUnassigned[0].job_id, 3)
})

test('plan comparison explains a route shift through a related new assignment', () => {
  const comparison = buildPlanComparison({
    version: { version_number: 5 },
    assignments: [],
    comparison: {
      previous_version_number: 4,
      triggers: [{ event_type: 'JOB_CREATED', job_ids: [3] }],
    },
    changes: [
      {
        job_id: 1,
        change_type: 'CHANGED',
        reason: 'REPLANNED',
        old_assignment: { planning_date: '2026-09-25', engineer_id: 7, engineer_name: 'Васан', planned_start: '2026-09-25T08:20:00+05:00', sequence: 1, previous_job_id: null, distance_from_previous_meters: 8200 },
        new_assignment: { planning_date: '2026-09-25', engineer_id: 7, engineer_name: 'Васан', planned_start: '2026-09-25T09:34:00+05:00', sequence: 2, previous_job_id: 3, distance_from_previous_meters: 1305 },
        explanation_context: { related_assignment_job_ids: [3] },
      },
      {
        job_id: 3,
        change_type: 'ASSIGNED',
        new_assignment: { planning_date: '2026-09-25', engineer_id: 7 },
      },
    ],
  })

  const explanation = planChangeExplanation(comparison.changes[0], comparison)

  assert.match(planComparisonCause(comparison), /№3/)
  assert.match(planningTriggerSummary(comparison), /создания заявки: №3/i)
  assert.match(explanation.cause, /заявк[аи] №3/i)
  assert.match(explanation.effect, /74 мин позже/i)
  assert.match(explanation.effect, /позиция в маршруте 1 → 2/i)
  assert.match(explanation.effect, /раньше 8,2 км от стартовой точки инженера, теперь 1,3 км от заявки №3/i)
  assert.match(explanation.effect, /точка отсчёта изменилась/i)
  assert.match(explanation.effect, /не означает изменение общего пробега маршрута/i)
  assert.doesNotMatch(explanation.effect, /на 6,9 км меньше/i)
  assert.match(explanation.purpose, /нового назначения/i)
  assert.match(explanation.basis, /журналом событий/i)
})

test('planning metrics compare daily staff and each engineer distance', () => {
  const metrics = buildPlanningMetricsComparison({
    previous: {
      totals: { personnel_count: 1, distance_meters: 3000 },
      days: [{ planning_date: '2026-09-25', personnel_count: 1, assigned_jobs_count: 2, distance_meters: 3000, engineers: [{ engineer_id: 7, engineer_name: 'Васан', assigned_jobs_count: 2, distance_meters: 3000 }] }],
    },
    current: {
      totals: { personnel_count: 2, distance_meters: 5200 },
      days: [{ planning_date: '2026-09-25', personnel_count: 2, assigned_jobs_count: 3, distance_meters: 5200, engineers: [{ engineer_id: 7, engineer_name: 'Васан', assigned_jobs_count: 2, distance_meters: 4000 }, { engineer_id: 8, engineer_name: 'Анна', assigned_jobs_count: 1, distance_meters: 1200 }] }],
    },
  })

  assert.equal(metrics.days[0].personnelDelta, 1)
  assert.equal(metrics.days[0].distanceDeltaMeters, 2200)
  assert.equal(metrics.totals.personnelDelta, 1)
  assert.equal(metrics.totals.distanceDeltaMeters, 2200)
  assert.deepEqual(metrics.days[0].engineers.map((item) => [item.engineerName, item.distanceDeltaMeters]), [['Васан', 1000], ['Анна', 1200]])
})

test('plan comparison shows exact changed job values and evidence source', () => {
  const explanation = planChangeExplanation(
    {
      job_id: 11,
      change_type: 'CHANGED',
      reason: 'REPLANNED',
      old_assignment: { planning_date: '2026-09-25', engineer_id: 7 },
      new_assignment: { planning_date: '2026-09-25', engineer_id: 7 },
    },
    {
      inputChanges: {
        job_changes: [{
          job_id: 11,
          changed_fields: ['service_duration_min'],
          changes: [{ field: 'service_duration_min', before: 60, after: 90 }],
        }],
      },
    },
  )

  assert.match(explanation.cause, /длительность работ: 60 → 90/i)
  assert.match(explanation.basis, /входных снимков/i)
})

test('unassigned comparison explains cause, effect, purpose and evidence', () => {
  const explanation = unassignedChangeExplanation({
    change_type: 'UNASSIGNED_REASON_CHANGED',
    previous_reason: { text: 'Нет подходящей смены.' },
    current_reason: { text: 'Недоступна лестница.' },
  })

  assert.equal(explanation.cause, 'Недоступна лестница.')
  assert.match(explanation.effect, /Нет подходящей смены.*Недоступна лестница/)
  assert.match(explanation.purpose, /обязательных ограничений/i)
  assert.match(explanation.basis, /обеих версий/i)
})

test('planning trigger names the unavailable engineer and affected jobs', () => {
  const summary = planningTriggerSummary({
    triggers: [{
      event_type: 'ENGINEER_AVAILABILITY_LOST',
      engineer_ids: [7],
      engineers: [{ engineer_id: 7, engineer_name: 'Васан' }],
      job_ids: [1, 2],
    }],
  })

  assert.match(summary, /Инженер: Васан/)
  assert.match(summary, /Затронутые заявки: №1, №2/)
})

test('equipment recovery explanation only uses equipment required by the job', () => {
  const explanation = planChangeExplanation(
    {
      job_id: 12,
      change_type: 'ASSIGNED',
      new_assignment: { engineer_id: 7, planning_date: '2026-09-25' },
      explanation_context: {
        previous_unassigned_reason: {
          code: 'NO_EQUIPMENT',
          text: 'Недоступно обязательное оборудование: Лестница.',
          parameters: { missing_equipment: [{ id: 4, name: 'Лестница' }] },
        },
      },
    },
    {
      inputChanges: {
        equipment_changes: [
          { equipment_type_id: 4, equipment_name: 'Лестница', before_units: 0, after_units: 1 },
          { equipment_type_id: 5, equipment_name: 'Дрель', before_units: 0, after_units: 3 },
        ],
      },
    },
  )

  assert.match(explanation.cause, /Лестница 0 → 1/)
  assert.doesNotMatch(explanation.cause, /Дрель/)
})

test('distance-only assignment change has a specific title', () => {
  assert.equal(planChangeTitle({
    change_type: 'CHANGED',
    old_assignment: { distance_from_previous_meters: 8000 },
    new_assignment: { distance_from_previous_meters: 1200 },
  }), 'Изменился переезд до заявки')
})

test('removed unassigned job explains cancellation from the event log', () => {
  const explanation = unassignedChangeExplanation(
    {
      job_id: 15,
      change_type: 'UNASSIGNED_REMOVED',
      previous_reason: { text: 'Нет доступной смены.' },
    },
    { triggers: [{ event_type: 'JOB_CANCELLED', job_ids: [15] }] },
  )

  assert.match(explanation.cause, /была отменена/i)
  assert.match(explanation.basis, /журналом событий/i)
})

test('comparison summary includes removed jobs and changed engineers', () => {
  const summary = planComparisonCause({
    changes: [],
    counts: { changed: 0 },
    inputChanges: {
      removed_job_ids: [15],
      engineer_changes: [{ engineer_id: 7, engineer_name: 'Васан' }],
    },
  })

  assert.match(summary, /исключены заявки: №15/i)
  assert.match(summary, /изменились данные инженеров: Васан/i)
})

test('nightly horizon shift reports retained assignments without claiming changes', () => {
  const summary = planComparisonCause({
    changes: [],
    counts: { changed: 0 },
    triggers: [{ event_type: 'NIGHTLY_REPLAN' }],
    inputChanges: {
      horizon_changed: true,
      horizon_change: {
        effective_start_date: { before: '2026-09-25', after: '2026-09-26' },
        maximum_horizon_end: { before: '2026-10-23', after: '2026-10-24' },
      },
      carried_forward_job_ids: [1, 2, 3],
    },
  })

  assert.match(summary, /сместился расчётный горизонт/i)
  assert.match(summary, /начало 25\.09\.2026 → 26\.09\.2026/i)
  assert.match(summary, /конец 23\.10\.2026 → 24\.10\.2026/i)
  assert.match(summary, /№1, №2, №3 оказались до начала нового горизонта/i)
  assert.match(summary, /назначения при этом не изменились/i)
  assert.doesNotMatch(summary, /исключены заявки/i)
})

test('assignment change explains the exact engineer input change', () => {
  const explanation = planChangeExplanation(
    {
      job_id: 1,
      change_type: 'CHANGED',
      reason: 'REPLANNED',
      old_assignment: { engineer_id: 7, planning_date: '2026-09-25' },
      new_assignment: { engineer_id: 7, planning_date: '2026-09-25' },
    },
    {
      inputChanges: {
        engineer_changes: [{
          engineer_id: 7,
          engineer_name: 'Васан',
          changed_fields: ['start_address'],
          changes: [{ field: 'start_address', before: 'База А', after: 'База Б' }],
        }],
      },
    },
  )

  assert.match(explanation.cause, /стартовый адрес: База А → База Б/i)
  assert.match(explanation.basis, /входных снимков/i)
})
