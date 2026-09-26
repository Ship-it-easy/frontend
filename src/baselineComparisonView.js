export function baselineHighlights(value, formatDistance) {
  if (value?.coverage_comparable !== true || !value.baseline || !value.optimized) return []
  const engineersSaved = Number(value.baseline.active_engineer_count || 0) - Number(value.optimized.active_engineer_count || 0)
  const distanceSaved = Number(value.baseline.total_distance_meters || 0) - Number(value.optimized.total_distance_meters || 0)
  const highlights = []
  const engineersWord = engineersSaved % 10 === 1 && engineersSaved % 100 !== 11
    ? 'инженер'
    : engineersSaved % 10 >= 2 && engineersSaved % 10 <= 4 && (engineersSaved % 100 < 10 || engineersSaved % 100 >= 20)
      ? 'инженера'
      : 'инженеров'
  if (engineersSaved > 0) highlights.push(`${engineersSaved} ${engineersWord} меньше`)
  if (distanceSaved > 0) highlights.push(`${formatDistance(distanceSaved)} короче`)
  return highlights
}
