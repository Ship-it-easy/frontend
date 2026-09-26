export const transportOptions = [
  { value: 'CAR', label: 'Автомобиль', profile: 'auto' },
  { value: 'NONE', label: 'Пешеход', profile: 'pedestrian' },
  { value: 'BICYCLE', label: 'Велосипед', profile: 'bicycle' },
]

export function transportLabel(type) {
  const current = type === 'PUBLIC_TRANSPORT' ? 'NONE' : type
  return transportOptions.find(option => option.value === current)?.label || 'Неизвестный транспорт'
}

export function transportProfile(type) {
  const current = type === 'PUBLIC_TRANSPORT' ? 'NONE' : type
  const option = transportOptions.find(option => option.value === current)
  if (!option) throw new Error('Неизвестный тип транспорта')
  return option.profile
}

export const movementStyles = {
  car: { label: 'Автомобиль', color: '#2563eb' },
  walk: { label: 'Пешком', color: '#64748b', dashArray: '7 6' },
  bicycle: { label: 'Велосипед', color: '#15803d' },
}

export function movementStyle(segment, transportType) {
  if (segment.travel_mode === 'pedestrian' || transportType === 'NONE' || transportType === 'PUBLIC_TRANSPORT') return movementStyles.walk
  if (segment.travel_mode === 'bicycle' || transportType === 'BICYCLE') return movementStyles.bicycle
  return movementStyles.car
}
