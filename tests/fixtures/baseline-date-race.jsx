import React from 'react'
import { createRoot } from 'react-dom/client'
import DynamicPlanningPage from '../../src/DynamicPlanningPage.jsx'
import '../../src/style.css'

const dates = Array.from({ length: 7 }, (_, index) => {
  const day = new Date(Date.UTC(2026, 8, 27 + index))
  return day.toISOString().slice(0, 10)
})
const board = {
  project_date: dates[0],
  timezone: 'Asia/Yekaterinburg',
  days: dates.map((date) => ({ date, assigned_count: 0, unassigned_count: 0, cancelled_count: 0 })),
  plan_version: { id: 14, number: 14, status: 'SUCCESS', published_at: '2026-09-26T06:00:00Z', trigger: 'MANUAL' },
  active_run: { state: 'RUNNING', phase: 'Синтетический QA: опрос каждые 2 секунды', started_at: '2026-09-26T06:00:00Z' },
  readiness: { ready: true },
  selected_day: { result_available: false, unassigned: { moved: [], horizon: [] } },
}

function comparison(date) {
  const count = dates.indexOf(date) + 1
  const metrics = {
    input_jobs_count: count, assigned_jobs_count: count, window_hit_count: count,
    window_hit_rate: 100, active_engineer_count: 1, total_distance_meters: count * 1000,
  }
  return {
    status: 'READY', date, plan_version_id: 14, coverage_comparable: true,
    baseline: metrics, optimized: metrics,
    delta: { assigned_jobs_count: 0, window_hit_count: 0, window_hit_rate: 0, active_engineer_count: 0, total_distance_meters: 0 },
    engineers: [], methodology: 'Синтетический QA-макет.',
  }
}

const json = (value) => Response.json(value)
const delayed = (value, milliseconds) => new Promise((resolve) => window.setTimeout(() => resolve(json(value)), milliseconds))
window.fetch = async (input) => {
  const path = new URL(input, window.location.href).pathname
  if (path.endsWith('/planning/board')) return json(board)
  const day = /\/planning\/board\/(\d{4}-\d{2}-\d{2})$/.exec(path)?.[1]
  if (day) {
    const count = dates.indexOf(day) + 1
    const value = { result_available: false, unassigned: { moved: Array.from({ length: count }, () => ({})), horizon: [] } }
    return delayed(value, day === dates[1] ? 4000 : 50)
  }
  const comparisonDate = /\/planning\/current\/days\/(\d{4}-\d{2}-\d{2})\/comparison$/.exec(path)?.[1]
  if (comparisonDate) return delayed(comparison(comparisonDate), comparisonDate === dates[1] ? 3500 : 50)
  if (path.endsWith('/planning/versions')) return json({ items: [] })
  if (path.endsWith('/planning/versions/14')) return json({ version: { id: 14, version_number: 14 }, assignments: [], comparison: null })
  return json({})
}

createRoot(document.getElementById('root')).render(
  <DynamicPlanningPage projectId={8} notify={() => {}} />,
)
