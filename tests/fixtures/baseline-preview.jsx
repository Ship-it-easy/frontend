import React from 'react'
import { createRoot } from 'react-dom/client'

import { BaselineComparison } from '../../src/DynamicPlanningPage.jsx'
import '../../src/style.css'

const engineers = Array.from({ length: 20 }, (_, index) => ({
  engineer_name: index === 19
    ? 'Очень длинное имя инженера для проверки переноса и устойчивости таблицы'
    : `Инженер ${index + 1}`,
  baseline_jobs_count: index < 2 ? 4 : 0,
  baseline_distance_meters: index < 2 ? 61690 : 0,
  optimized_jobs_count: index < 2 ? 4 : 0,
  optimized_distance_meters: index < 2 ? 2260 : 0,
  delta_distance_meters: index < 2 ? -59430 : 0,
}))

const comparison = {
  status: 'READY',
  date: '2026-09-27',
  timezone: 'Asia/Yekaterinburg',
  calculated_at: '2026-09-26T07:19:25Z',
  coverage_comparable: true,
  baseline: {
    input_jobs_count: 8,
    assigned_jobs_count: 8,
    window_hit_count: 8,
    window_hit_rate: 100,
    active_engineer_count: 2,
    total_distance_meters: 123381,
  },
  optimized: {
    input_jobs_count: 8,
    assigned_jobs_count: 8,
    window_hit_count: 8,
    window_hit_rate: 100,
    active_engineer_count: 2,
    total_distance_meters: 4520,
  },
  delta: {
    assigned_jobs_count: 0,
    window_hit_count: 0,
    window_hit_rate: 0,
    active_engineer_count: 0,
    total_distance_meters: -118861,
  },
  engineers,
  methodology: 'FIFO учитывает квалификации, транспорт и вместимость смены. Оборудование и временные окна не запрещают назначение. Дорога для времени фиксирована — 20 минут на заявку, а пробег рассчитан по сохранённой дорожной матрице.',
}

createRoot(document.getElementById('root')).render(
  <div style={{ maxWidth: 1180, margin: '24px auto', padding: 20 }}>
    <p style={{ fontWeight: 700, color: '#a43333' }}>
      Только визуальный QA: синтетические данные, не живой результат планирования.
    </p>
    <BaselineComparison
      value={comparison}
      loading={false}
      error=""
      onRetry={() => {}}
      onExpand={() => {}}
      previousPlan={false}
    />
  </div>,
)
