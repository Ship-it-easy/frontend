export function matchesPlanningFilters(job, filters) {
  const query = filters.search.trim().toLocaleLowerCase('ru-RU')
  if (query && !`${job.address || ''} ${job.work_type || ''}`.toLocaleLowerCase('ru-RU').includes(query)) return false
  if (filters.priority && job.priority !== filters.priority) return false
  if (filters.status && job.status !== filters.status) return false
  if (filters.outcome === 'ASSIGNED' && job.outcome !== 'ASSIGNED') return false
  if (filters.outcome === 'UNASSIGNED_TODAY' && job.outcome !== 'UNASSIGNED_TODAY') return false
  return true
}

export function selectPlanningDate(days, preferredDate, projectDate) {
  const dates = Array.isArray(days) ? days.map((item) => item.date) : []
  return dates.includes(preferredDate) ? preferredDate : projectDate
}

export function planningDaySummary(item, selectedDate, selectedDay) {
  const assigned = Number(item?.assigned_count || 0)
  if (item?.date === selectedDate && selectedDay?.unassigned) {
    return {
      assigned,
      moved: Array.isArray(selectedDay.unassigned.moved) ? selectedDay.unassigned.moved.length : 0,
      horizon: Array.isArray(selectedDay.unassigned.horizon) ? selectedDay.unassigned.horizon.length : 0,
      unassignedToday: null,
    }
  }
  return { assigned, moved: null, horizon: null, unassignedToday: Number(item?.unassigned_count || 0) }
}

export function readinessTarget(section, ownerMode) {
  return ownerMode && ['catalogs', 'parameters'].includes(section) ? 'projects' : section
}
