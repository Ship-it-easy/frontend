export const transportOptions = [
  { value: 'CAR', label: 'Автомобиль', profile: 'auto' },
  { value: 'NONE', label: 'Пешеход', profile: 'pedestrian' },
  { value: 'BICYCLE', label: 'Велосипед', profile: 'bicycle' },
  { value: 'PUBLIC_TRANSPORT', label: 'Общественный транспорт', profile: 'multimodal' },
]

export function transportLabel(type) {
  return transportOptions.find(option => option.value === type)?.label || 'Неизвестный транспорт'
}

export function transportProfile(type) {
  const option = transportOptions.find(option => option.value === type)
  if (!option) throw new Error('Неизвестный тип транспорта')
  return option.profile
}

export function transitTypeLabel(type) {
  return {
    bus: 'Автобус',
    tram: 'Трамвай',
    rail: 'Поезд',
    subway: 'Метро',
    metro: 'Метро',
    cable_car: 'Канатная дорога',
  }[type] || 'Транспорт'
}

export const movementStyles = {
  car: { label: 'Автомобиль', color: '#2563eb' },
  walk: { label: 'Пешком', color: '#64748b', dashArray: '7 6' },
  bicycle: { label: 'Велосипед', color: '#15803d' },
  bus: { label: 'Автобус', color: '#ea580c' },
  tram: { label: 'Трамвай', color: '#be123c' },
  subway: { label: 'Метро', color: '#7c3aed' },
  rail: { label: 'Поезд', color: '#0f766e' },
  cable_car: { label: 'Канатная дорога', color: '#0369a1' },
  transit: { label: 'Общественный транспорт', color: '#a16207' },
}

export function movementStyle(segment, transportType) {
  if (segment.travel_mode === 'transit') {
    const type = segment.travel_type === 'metro' ? 'subway' : segment.travel_type
    return movementStyles[type] || movementStyles.transit
  }
  if (segment.travel_mode === 'pedestrian' || transportType === 'NONE') return movementStyles.walk
  if (segment.travel_mode === 'bicycle' || transportType === 'BICYCLE') return movementStyles.bicycle
  if (transportType === 'PUBLIC_TRANSPORT') return movementStyles.walk
  return movementStyles.car
}
