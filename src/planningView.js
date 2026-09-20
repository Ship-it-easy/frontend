export function matchesPlanningFilters(job, filters) {
  const query = filters.search.trim().toLocaleLowerCase('ru-RU')
  if (query && !`${job.address || ''} ${job.work_type || ''}`.toLocaleLowerCase('ru-RU').includes(query)) return false
  if (filters.priority && job.priority_type !== filters.priority) return false
  if (filters.status && job.status !== filters.status) return false
  if (filters.outcome === 'ASSIGNED' && job.outcome !== 'ASSIGNED') return false
  if (filters.outcome === 'UNASSIGNED_TODAY' && job.outcome !== 'UNASSIGNED_TODAY') return false
  return true
}

export function selectPlanningDate(days, preferredDate, projectDate) {
  const dates = Array.isArray(days) ? days.map((item) => item.date) : []
  return dates.includes(preferredDate) ? preferredDate : projectDate
}

export function readinessTarget(section, ownerMode) {
  return ownerMode && ['catalogs', 'parameters'].includes(section) ? 'projects' : section
}
