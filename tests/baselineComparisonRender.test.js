import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transformWithOxc } from 'vite'

import { baselineHighlights } from '../src/baselineComparisonView.js'

const source = readFileSync(new URL('../src/DynamicPlanningPage.jsx', import.meta.url), 'utf8')
function extract(start, end) {
  const from = source.indexOf(start)
  const until = source.indexOf(end, from)
  assert.ok(from >= 0 && until > from, `Cannot locate ${start}`)
  return source.slice(from, until)
}

const componentSource = [
  extract('function pluralJobs(', 'function Readiness('),
  extract('function signedMetric(', 'function BaselineLoading('),
  extract('function BaselineLoading(', 'function JobCard('),
  extract('function formatKilometers(', 'function metricTransition('),
  'module.exports = { BaselineComparison }',
].join('\n')
const compiled = await transformWithOxc(componentSource, 'BaselineComparison.jsx')
const require = createRequire(import.meta.url)
const module = { exports: {} }
const Button = ({ children, ...props }) => React.createElement('button', props, children)
new Function(
  'require', 'module', 'activeStates', 'safeArray', 'baselineHighlights',
  'Button', 'formatDateTime', compiled.code,
)(
  require,
  module,
  new Set(['PENDING', 'RUNNING']),
  (value) => Array.isArray(value) ? value : [],
  baselineHighlights,
  Button,
  () => '27.09.2026 08:00',
)
const { BaselineComparison } = module.exports

function render(value, overrides = {}) {
  return renderToStaticMarkup(React.createElement(BaselineComparison, {
    value,
    loading: false,
    error: '',
    onRetry: () => {},
    onExpand: () => {},
    previousPlan: false,
    ...overrides,
  }))
}

function ready(overrides = {}) {
  return {
    status: 'READY',
    date: '2026-09-27',
    coverage_comparable: true,
    baseline: {
      input_jobs_count: 8, assigned_jobs_count: 8, window_hit_count: 8,
      window_hit_rate: 100, active_engineer_count: 2, total_distance_meters: 123381,
    },
    optimized: {
      input_jobs_count: 8, assigned_jobs_count: 8, window_hit_count: 8,
      window_hit_rate: 100, active_engineer_count: 2, total_distance_meters: 4520,
    },
    delta: {
      assigned_jobs_count: 0, window_hit_count: 0, window_hit_rate: 0,
      active_engineer_count: 0, total_distance_meters: -118861,
    },
    engineers: [],
    methodology: 'FIFO игнорирует оборудование и окна для назначения.',
    ...overrides,
  }
}

test('all non-ready states keep their own safe message and no metric table', () => {
  const cases = [
    ['PENDING', 'Сравнение рассчитывается'],
    ['RUNNING', 'Сравнение рассчитывается'],
    ['FAILED', 'Сравнение временно недоступно'],
    ['NOT_APPLICABLE_SHIFT_STARTED', 'после начала рабочей смены'],
    ['NOT_AVAILABLE_LEGACY_PLAN', 'сравнение не рассчитывалось'],
    ['NO_DAILY_RESULT', 'нет рассчитанного плана'],
  ]
  for (const [status, label] of cases) {
    const html = render({ status, attempt_count: 1 })
    assert.ok(html.includes(label), status)
    assert.ok(!html.includes('baseline-comparison-table'), status)
  }
  assert.ok(render(null, { loading: true }).includes('baseline-skeleton'))
  assert.ok(render({ status: 'FAILED', attempt_count: 3 }).includes('Лимит повторов исчерпан'))
  assert.ok(!render({ status: 'FAILED', attempt_count: 3 }).includes('<button'))
})

test('equal coverage renders the exact demo metrics and measured distance advantage', () => {
  const html = render(ready(), { previousPlan: true })
  assert.ok(html.indexOf('Как считается базовый план') < html.indexOf('baseline-comparison-table'))
  assert.ok(html.includes('8 из 8'))
  assert.ok(html.includes('123,4 км'))
  assert.ok(html.includes('4,5 км'))
  assert.ok(html.includes('118,9 км короче'))
  assert.ok(html.includes('предыдущей опубликованной версии'))
  assert.ok(html.includes('0 п.п.'))
})

test('different coverage highlights assigned jobs but never declares a winner', () => {
  const html = render(ready({ coverage_comparable: false }))
  assert.ok(html.includes('Покрытие различается'))
  assert.ok(html.includes('coverage-difference'))
  assert.ok(!html.includes('Оптимизатор:'))
})

test('twenty engineers and a long name all render in the detail list', () => {
  const longName = 'Очень длинное имя инженера '.repeat(8)
  const engineers = Array.from({ length: 20 }, (_, index) => ({
    engineer_name: index === 19 ? longName : `Инженер ${index + 1}`,
    baseline_jobs_count: index === 0 ? 0 : 1,
    baseline_distance_meters: index === 0 ? 0 : 1000,
    optimized_jobs_count: index === 19 ? 0 : 1,
    optimized_distance_meters: index === 19 ? 0 : 500,
    delta_distance_meters: index === 19 ? -1000 : 500,
  }))
  const html = render(ready({ engineers }))
  assert.equal((html.match(/<article/g) || []).length, 20)
  assert.ok(html.includes(longName.trim()))
  assert.ok(html.includes('0 заявок · 0 км'))
})

test('engineer detail uses the correct Russian plural for four jobs', () => {
  const html = render(ready({ engineers: [{
    engineer_name: 'Тестовый инженер',
    baseline_jobs_count: 4,
    baseline_distance_meters: 54800,
    optimized_jobs_count: 4,
    optimized_distance_meters: 4520,
    delta_distance_meters: -50280,
  }] }))
  assert.equal((html.match(/4 заявки/g) || []).length, 2)
  assert.ok(!html.includes('4 заявок'))
})
