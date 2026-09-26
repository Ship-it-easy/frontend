import assert from 'node:assert/strict'
import test from 'node:test'

import { baselineHighlights } from '../src/baselineComparisonView.js'

const formatDistance = (meters) => `${meters / 1000} км`

test('different assigned job sets never produce a winner or savings claim', () => {
  const value = {
    coverage_comparable: false,
    baseline: { active_engineer_count: 12, total_distance_meters: 680000 },
    optimized: { active_engineer_count: 9, total_distance_meters: 490000 },
  }
  assert.deepEqual(baselineHighlights(value, formatDistance), [])
})

test('equal coverage presents only measured improvements', () => {
  const value = {
    coverage_comparable: true,
    baseline: { active_engineer_count: 12, total_distance_meters: 680000 },
    optimized: { active_engineer_count: 9, total_distance_meters: 490000 },
  }
  assert.deepEqual(baselineHighlights(value, formatDistance), [
    '3 инженера меньше',
    '190 км короче',
  ])
})

test('missing or worse comparison has no positive highlight', () => {
  assert.deepEqual(baselineHighlights(null, formatDistance), [])
  assert.deepEqual(baselineHighlights({ coverage_comparable: true }, formatDistance), [])
  assert.deepEqual(baselineHighlights({
    coverage_comparable: true,
    baseline: { active_engineer_count: 2, total_distance_meters: 1000 },
    optimized: { active_engineer_count: 3, total_distance_meters: 2000 },
  }, formatDistance), [])
})

test('five saved engineers use the correct Russian plural', () => {
  assert.deepEqual(baselineHighlights({
    coverage_comparable: true,
    baseline: { active_engineer_count: 7, total_distance_meters: 1000 },
    optimized: { active_engineer_count: 2, total_distance_meters: 1000 },
  }, formatDistance), ['5 инженеров меньше'])
})
