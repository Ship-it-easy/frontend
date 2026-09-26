export function matchesPlanningFilters(job, filters) {
  const query = filters.search.trim().toLocaleLowerCase('ru-RU')
  if (query && !`${job.address || ''} ${job.work_type || ''}`.toLocaleLowerCase('ru-RU').includes(query)) return false
  if (filters.priority && job.priority !== filters.priority) return false
  if (filters.status && job.status !== filters.status) return false
  if (filters.outcome === 'ASSIGNED' && job.outcome !== 'ASSIGNED') return false
  if (filters.outcome === 'UNASSIGNED_TODAY' && job.outcome !== 'UNASSIGNED_TODAY') return false
  return true
}

function formatSnapshotDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''))
  return match ? `${match[3]}.${match[2]}.${match[1]}` : 'дата не указана'
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

export function buildPlanComparison(plan) {
  const versionNumber = Number(plan?.version?.version_number || 0)
  const previousVersionNumber = Number(plan?.comparison?.previous_version_number || 0) || null
  const assignments = Array.isArray(plan?.assignments) ? plan.assignments : []
  const changes = Array.isArray(plan?.changes) ? plan.changes : []
  const unassignedChanges = Array.isArray(plan?.comparison?.unassigned_changes) ? plan.comparison.unassigned_changes : []
  const unchangedUnassigned = Array.isArray(plan?.comparison?.unchanged_unassigned) ? plan.comparison.unchanged_unassigned : []
  const changedJobIds = new Set(changes.map((item) => Number(item.job_id)))
  const unchanged = assignments.filter((item) => !changedJobIds.has(Number(item.job_id)))
  return {
    currentVersionNumber: versionNumber || null,
    previousVersionNumber,
    hasPreviousVersion: previousVersionNumber !== null,
    changes,
    unassignedChanges,
    unchanged,
    unchangedUnassigned,
    triggerSource: plan?.version?.trigger_source || null,
    triggers: Array.isArray(plan?.comparison?.triggers) ? plan.comparison.triggers : [],
    inputChanges: plan?.comparison?.input_changes || {},
    metrics: buildPlanningMetricsComparison(plan?.comparison?.metrics),
    counts: {
      changed: changes.length + unassignedChanges.length,
      assigned: changes.filter((item) => item.change_type === 'ASSIGNED').length,
      replanned: changes.filter((item) => item.change_type === 'CHANGED').length,
      removed: changes.filter((item) => ['DISPLACED', 'CANCELLED'].includes(item.change_type)).length,
      unchanged: Number(plan?.comparison?.unchanged_count ?? unchanged.length),
    },
  }
}

export function buildPlanningMetricsComparison(metrics) {
  const current = metrics?.current || { days: [], totals: {} }
  const previous = metrics?.previous || null
  const currentDays = new Map((current.days || []).map((item) => [item.planning_date, item]))
  const previousDays = new Map((previous?.days || []).map((item) => [item.planning_date, item]))
  const dates = [...new Set([...currentDays.keys(), ...previousDays.keys()])].sort()
  const emptyDay = (planningDate) => ({ planning_date: planningDate, personnel_count: 0, assigned_jobs_count: 0, distance_meters: 0, engineers: [] })
  return {
    hasPrevious: previous !== null,
    currentTotals: current.totals || {},
    previousTotals: previous?.totals || null,
    totals: {
      before: previous?.totals || { personnel_count: 0, assigned_jobs_count: 0, distance_meters: 0 },
      after: current.totals || { personnel_count: 0, assigned_jobs_count: 0, distance_meters: 0 },
      personnelDelta: Number(current.totals?.personnel_count || 0) - Number(previous?.totals?.personnel_count || 0),
      assignmentsDelta: Number(current.totals?.assigned_jobs_count || 0) - Number(previous?.totals?.assigned_jobs_count || 0),
      distanceDeltaMeters: Number(current.totals?.distance_meters || 0) - Number(previous?.totals?.distance_meters || 0),
    },
    days: dates.map((planningDate) => {
      const before = previousDays.get(planningDate) || emptyDay(planningDate)
      const after = currentDays.get(planningDate) || emptyDay(planningDate)
      const beforeEngineers = new Map((before.engineers || []).map((item) => [Number(item.engineer_id), item]))
      const afterEngineers = new Map((after.engineers || []).map((item) => [Number(item.engineer_id), item]))
      const engineerIds = [...new Set([...beforeEngineers.keys(), ...afterEngineers.keys()])].sort((left, right) => left - right)
      return {
        planningDate,
        before,
        after,
        personnelDelta: Number(after.personnel_count || 0) - Number(before.personnel_count || 0),
        distanceDeltaMeters: Number(after.distance_meters || 0) - Number(before.distance_meters || 0),
        engineers: engineerIds.map((engineerId) => {
          const previousEngineer = beforeEngineers.get(engineerId)
          const currentEngineer = afterEngineers.get(engineerId)
          return {
            engineerId,
            engineerName: currentEngineer?.engineer_name || previousEngineer?.engineer_name || `Инженер #${engineerId}`,
            previousJobs: Number(previousEngineer?.assigned_jobs_count || 0),
            currentJobs: Number(currentEngineer?.assigned_jobs_count || 0),
            previousDistanceMeters: Number(previousEngineer?.distance_meters || 0),
            currentDistanceMeters: Number(currentEngineer?.distance_meters || 0),
            distanceDeltaMeters: Number(currentEngineer?.distance_meters || 0) - Number(previousEngineer?.distance_meters || 0),
          }
        }),
      }
    }),
  }
}

export function planChangeTitle(change) {
  if (change?.change_type === 'ASSIGNED') return 'Заявка получила назначение'
  if (change?.change_type === 'CANCELLED') return 'Заявка исключена после отмены'
  if (change?.change_type === 'DISPLACED') return 'Заявка больше не назначена'
  const before = change?.old_assignment || {}
  const after = change?.new_assignment || {}
  if (before.planning_date !== after.planning_date) return 'Заявка перенесена на другую дату'
  if (before.engineer_id != null && after.engineer_id != null && Number(before.engineer_id) !== Number(after.engineer_id)) return 'Заявка передана другому инженеру'
  const sequenceChanged = (before.sequence != null || after.sequence != null) && Number(before.sequence) !== Number(after.sequence)
  if (before.planned_start !== after.planned_start || before.planned_finish !== after.planned_finish || sequenceChanged) return 'Изменены время или порядок в маршруте'
  if (Number(before.distance_from_previous_meters || 0) !== Number(after.distance_from_previous_meters || 0) || Number(before.travel_from_previous_min || 0) !== Number(after.travel_from_previous_min || 0)) return 'Изменился переезд до заявки'
  return 'Изменились условия назначения'
}

const changeReasonLabels = {
  JOB_CANCELLED: 'Заявка была отменена, поэтому исключена из активного маршрута.',
  ENGINEER_UNAVAILABLE: 'Назначенный инженер стал недоступен; его маршрут пришлось перестроить.',
  DISPLACED_TO_FUTURE: 'Оптимизатор перенёс заявку на более позднюю дату, чтобы сохранить допустимый план.',
  NOT_ASSIGNED_IN_NEW_HORIZON: 'После пересчёта для заявки не нашлось допустимого назначения в горизонте.',
  NEW_ASSIGNMENT: 'В новой версии найден допустимый инженер и временной слот.',
  REPLANNED: 'Маршрут пересчитан с учётом актуальных смен, ограничений и дорожных затрат.',
  CANCELLED_EN_ROUTE_ASSUMPTION: 'Маршрут продолжен от расчётной позиции инженера после отмены выполнявшейся заявки.',
  EQUIPMENT_UNAVAILABLE_IN_HORIZON: 'В новом снимке отсутствует обязательное оборудование для этой заявки.',
  DAILY_EQUIPMENT_CAPACITY: 'На выбранную дату недостаточно обязательного оборудования.',
  NO_SHIFT_IN_HORIZON: 'В доступном горизонте нет подходящей смены.',
  NO_AVAILABLE_ENGINEER: 'На выбранную дату нет доступной смены инженера.',
  NO_AVAILABLE_ENGINEER_TODAY: 'На выбранную дату нет доступной смены инженера.',
  NO_COMPATIBLE_ENGINEER: 'Нет инженера, который соответствует обязательным требованиям заявки.',
  NO_COMPATIBLE_ENGINEER_IN_HORIZON: 'В горизонте нет инженера, который соответствует обязательным требованиям заявки.',
  DURATION_EXCEEDS_ALL_SHIFTS: 'Длительность работы превышает доступную продолжительность всех смен.',
  INVALID_TIME_WINDOW_FOR_HORIZON: 'Временное окно заявки несовместимо с доступными сменами.',
  DAILY_TIME_WINDOW_CONFLICT: 'Временное окно заявки нельзя соблюсти в выбранный день.',
  NOT_ASSIGNED_WITHIN_HORIZON: 'До конца горизонта не найден допустимый слот для заявки.',
  DATASET_LIMIT: 'Заявка не вошла в лимит кандидатов завершившегося расчёта.',
  NO_EQUIPMENT: 'Отсутствует обязательное оборудование для выполнения заявки.',
  NO_SHIFT: 'В доступном горизонте нет подходящей смены.',
  NO_ELIGIBLE_ENGINEER: 'Нет инженера, который соответствует обязательным требованиям заявки.',
  TIME_WINDOW_CONFLICT: 'Временное окно заявки несовместимо с доступными сменами.',
  SHIFT_CAPACITY_EXCEEDED: 'Работа не помещается в доступный остаток смен.',
  ROUTE_INFEASIBLE: 'Не найден допустимый маршрут с учётом дороги.',
  DROPPED_BY_OBJECTIVE: 'Оптимизатор не включил заявку в выбранный маршрут.',
  HORIZON_EXHAUSTED: 'До конца горизонта не найдено допустимое назначение.',
  GEOCODING_FAILED: 'Не удалось определить координаты адреса заявки.',
  INVALID_INPUT: 'В заявке недостаточно данных для планирования.',
  MISSING_SERVICE_DURATION: 'Для заявки не указана длительность работ.',
}

export function planChangeReason(change) {
  return change?.reason_detail?.text || changeReasonLabels[change?.reason] || 'Назначение изменилось в результате оптимизации по актуальным данным.'
}

function assignmentTimeDeltaMinutes(before, after) {
  if (!before || !after) return null
  const beforeTime = Date.parse(before)
  const afterTime = Date.parse(after)
  if (!Number.isFinite(beforeTime) || !Number.isFinite(afterTime)) return null
  return Math.round((afterTime - beforeTime) / 60000)
}

function signedMinutes(value) {
  if (!value) return null
  return value > 0 ? `на ${value} мин позже` : `на ${Math.abs(value)} мин раньше`
}

function formatRouteDistance(meters) {
  const value = Math.abs(Number(meters || 0))
  if (value >= 1000) return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value / 1000)} км`
  return `${value} м`
}

function routeLegOrigin(assignment) {
  if (Number(assignment?.sequence) === 1) return 'от стартовой точки инженера'
  if (assignment?.previous_job_id != null) return `от заявки №${assignment.previous_job_id}`
  return 'от предыдущей заявки'
}

const jobFieldLabels = {
  address: 'адрес',
  sla_date: 'SLA-дата',
  time_window_start: 'начало временного окна',
  time_window_end: 'конец временного окна',
  service_duration_min: 'длительность работ',
  work_type_id: 'тип работ',
  latitude: 'координаты',
  longitude: 'координаты',
  priority: 'приоритет',
  required_transport: 'требуемый транспорт',
}

const engineerFieldLabels = {
  name: 'имя',
  active: 'доступность',
  transport_type: 'транспорт',
  start_address: 'стартовый адрес',
  start_latitude: 'координаты старта',
  start_longitude: 'координаты старта',
}

const specificChangeReasons = new Set([
  'JOB_CANCELLED',
  'ENGINEER_UNAVAILABLE',
  'CANCELLED_EN_ROUTE_ASSUMPTION',
  'EQUIPMENT_UNAVAILABLE_IN_HORIZON',
  'DAILY_EQUIPMENT_CAPACITY',
  'NO_EQUIPMENT',
  'NO_SHIFT_IN_HORIZON',
  'NO_AVAILABLE_ENGINEER',
  'NO_COMPATIBLE_ENGINEER',
  'NO_COMPATIBLE_ENGINEER_IN_HORIZON',
  'DURATION_EXCEEDS_ALL_SHIFTS',
  'INVALID_TIME_WINDOW_FOR_HORIZON',
  'DAILY_TIME_WINDOW_CONFLICT',
])

function formatInputValue(value) {
  if (value == null || value === '') return 'не задано'
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'нет'
  if (typeof value === 'boolean') return value ? 'да' : 'нет'
  return String(value)
}

const triggerLabels = {
  MANUAL: 'Перепланирование запущено вручную.',
  NIGHTLY: 'Перепланирование запущено ночным регламентным расчётом.',
  JOB_CREATED: 'Перепланирование запущено после создания заявки.',
  JOBS_IMPORTED: 'Перепланирование запущено после импорта заявок.',
  JOB_CANCELLED: 'Перепланирование запущено после отмены заявки.',
  WORK_TYPE_PRIORITY_CHANGED: 'Перепланирование запущено после изменения приоритета типа работ.',
  ENGINEER_AVAILABILITY_LOST: 'Перепланирование запущено после потери доступности инженера.',
  ENGINEER_AVAILABILITY_RESTORED: 'Перепланирование запущено после восстановления доступности инженера.',
  COALESCED: 'В один расчёт объединено несколько событий.',
}

export function planningTriggerSummary(comparison) {
  const triggers = comparison?.triggers || []
  if (triggers.length) {
    return triggers.map((trigger) => {
      const jobIds = (trigger.job_ids || []).map((jobId) => `№${jobId}`).join(', ')
      const base = triggerLabels[trigger.event_type] || `Перепланирование запущено событием ${trigger.event_type}.`
      const engineerNames = (trigger.engineers || []).map((engineer) => engineer.engineer_name || `Инженер #${engineer.engineer_id}`).join(', ')
      if (['ENGINEER_AVAILABILITY_LOST', 'ENGINEER_AVAILABILITY_RESTORED'].includes(trigger.event_type)) {
        const engineerText = engineerNames ? ` Инженер: ${engineerNames}.` : ''
        const jobsText = jobIds ? ` Затронутые заявки: ${jobIds}.` : ''
        return `${base}${engineerText}${jobsText}`
      }
      return jobIds ? `${base.replace(/\.$/, '')}: ${jobIds}.` : base
    }).join(' ')
  }
  return triggerLabels[comparison?.triggerSource] || ''
}

export function planChangeExplanation(change, comparison = {}) {
  const before = change?.old_assignment || null
  const after = change?.new_assignment || null
  const context = change?.explanation_context || {}
  const inputChanges = comparison?.inputChanges || comparison?.input_changes || {}
  const relatedIds = Array.isArray(context.related_assignment_job_ids) ? context.related_assignment_job_ids : []
  const changedJob = (inputChanges.job_changes || []).find((item) => Number(item.job_id) === Number(change?.job_id))
  const triggeringJobIds = new Set((comparison?.triggers || []).flatMap((trigger) => ['JOB_CREATED', 'JOBS_IMPORTED'].includes(trigger.event_type) ? (trigger.job_ids || []).map(Number) : []))
  const triggeredRelatedIds = relatedIds.filter((jobId) => triggeringJobIds.has(Number(jobId)))
  const relevantSchedule = (inputChanges.schedule_changes || []).find((item) => {
    const engineerIds = [before?.engineer_id, after?.engineer_id].filter((value) => value != null).map(Number)
    const dates = [before?.planning_date, after?.planning_date].filter(Boolean)
    return engineerIds.includes(Number(item.engineer_id)) && dates.includes(item.planning_date)
  })
  const relevantEngineerChange = (inputChanges.engineer_changes || []).find((item) => {
    const engineerIds = [before?.engineer_id, after?.engineer_id].filter((value) => value != null).map(Number)
    return engineerIds.includes(Number(item.engineer_id))
  })
  const previousMissingEquipmentIds = new Set((context.previous_unassigned_reason?.parameters?.missing_equipment || [])
    .map((item) => Number(typeof item === 'object' ? item.id : item))
    .filter(Number.isFinite))
  const restoredEquipment = (inputChanges.equipment_changes || []).filter((item) => previousMissingEquipmentIds.has(Number(item.equipment_type_id)) && Number(item.after_units || 0) > Number(item.before_units || 0))

  let cause
  let basis = 'Причина взята из сохранённого результата оптимизации.'
  if (change?.change_type === 'ASSIGNED' && context.previous_unassigned_reason?.text) {
    let recovery = 'После пересчёта соседних маршрутов появился допустимый слот.'
    if (relevantSchedule) recovery = `Между версиями изменилась смена инженера ${relevantSchedule.engineer_name || `#${relevantSchedule.engineer_id}`}, после чего появился допустимый слот.`
    if (context.previous_unassigned_reason.code === 'NO_EQUIPMENT' && restoredEquipment.length) recovery = `Доступность оборудования увеличилась: ${restoredEquipment.map((item) => `${item.equipment_name || `тип #${item.equipment_type_id}`} ${item.before_units} → ${item.after_units}`).join(', ')}.`
    if (changedJob?.changed_fields?.length) recovery = `Были обновлены данные самой заявки, после чего назначение стало допустимым.`
    cause = `В прошлой версии заявка оставалась без назначения: ${context.previous_unassigned_reason.text} ${recovery}`
    basis = 'Сопоставлены сохранённая причина неназначения и входные снимки двух версий.'
  } else if (change?.change_type === 'ASSIGNED' && context.new_input_job) {
    cause = 'Заявка появилась во входных данных этой версии, и планировщик нашёл для неё допустимый маршрут.'
    basis = 'Заявка отсутствовала в предыдущем входном снимке и появилась в текущем.'
  } else if (specificChangeReasons.has(change?.reason)) {
    cause = planChangeReason(change)
    basis = 'Причина сохранена планировщиком или событием, запустившим перепланирование.'
  } else if (changedJob?.changed_fields?.length) {
    const details = (changedJob.changes || []).map((item) => `${jobFieldLabels[item.field] || item.field}: ${formatInputValue(item.before)} → ${formatInputValue(item.after)}`)
    const fields = [...new Set(changedJob.changed_fields.map((field) => jobFieldLabels[field] || field))]
    cause = `Между версиями изменились исходные данные этой заявки: ${details.length ? details.join('; ') : fields.join(', ')}. Назначение было рассчитано заново.`
    basis = 'Изменения подтверждены сравнением входных снимков версий.'
  } else if (relevantEngineerChange?.changed_fields?.length) {
    const details = (relevantEngineerChange.changes || []).map((item) => `${engineerFieldLabels[item.field] || item.field}: ${formatInputValue(item.before)} → ${formatInputValue(item.after)}`)
    const fields = [...new Set(relevantEngineerChange.changed_fields.map((field) => engineerFieldLabels[field] || field))]
    cause = `Между версиями изменились данные инженера ${relevantEngineerChange.engineer_name || `#${relevantEngineerChange.engineer_id}`}: ${details.length ? details.join('; ') : fields.join(', ')}. Его маршрут был рассчитан заново.`
    basis = 'Изменения инженера подтверждены сравнением входных снимков версий.'
  } else if (triggeredRelatedIds.length) {
    const jobs = triggeredRelatedIds.map((jobId) => `№${jobId}`).join(', ')
    cause = `Перепланирование запущено после появления заявки ${jobs}. Она получила назначение в том же маршруте, поэтому последовательность и время соседних остановок были пересчитаны.`
    basis = 'Связь подтверждена журналом событий и изменениями одного маршрута.'
  } else if (relatedIds.length) {
    const jobs = relatedIds.map((jobId) => `№${jobId}`).join(', ')
    cause = `В этой же версии в тот же маршрут добавлено назначение — заявка ${jobs}. При повторной оптимизации последовательность и время остальных остановок были пересчитаны.`
    basis = 'Это наблюдаемая связь внутри одного маршрута; отдельная причинная трассировка решения solver не сохраняется.'
  } else if (relevantSchedule) {
    cause = `Между версиями изменилась смена инженера ${relevantSchedule.engineer_name || `#${relevantSchedule.engineer_id}`} на ${relevantSchedule.planning_date}; маршрут был рассчитан заново в новых границах смены.`
    basis = 'Изменение подтверждено входными снимками смен двух версий.'
  } else {
    cause = planChangeReason(change)
    basis = 'Более точная первичная причина для этой старой версии не сохранилась; показан наиболее конкретный доступный код результата.'
  }

  const effects = []
  if (!before && after) effects.push(`появилось назначение инженеру ${after.engineer_name || `#${after.engineer_id}`}`)
  if (before && !after) effects.push('назначение исчезло из опубликованного плана')
  if (before?.planning_date && after?.planning_date && before.planning_date !== after.planning_date) effects.push(`дата ${before.planning_date} → ${after.planning_date}`)
  if (before?.engineer_id != null && after?.engineer_id != null && Number(before.engineer_id) !== Number(after.engineer_id)) effects.push(`инженер ${before.engineer_name || `#${before.engineer_id}`} → ${after.engineer_name || `#${after.engineer_id}`}`)
  const timeDelta = assignmentTimeDeltaMinutes(before?.planned_start, after?.planned_start)
  if (timeDelta) effects.push(`начало ${signedMinutes(timeDelta)}`)
  const finishDelta = assignmentTimeDeltaMinutes(before?.planned_finish, after?.planned_finish)
  if (finishDelta && finishDelta !== timeDelta) effects.push(`окончание ${signedMinutes(finishDelta)}`)
  if (before?.sequence != null && after?.sequence != null && Number(before.sequence) !== Number(after.sequence)) effects.push(`позиция в маршруте ${before.sequence} → ${after.sequence}`)
  const beforeDistance = Number(before?.distance_from_previous_meters || 0)
  const afterDistance = Number(after?.distance_from_previous_meters || 0)
  const distanceDelta = afterDistance - beforeDistance
  if (before && after && distanceDelta) {
    const referenceChanged = Number(before.sequence) !== Number(after.sequence)
      || Number(before.engineer_id) !== Number(after.engineer_id)
      || String(before.planning_date || '') !== String(after.planning_date || '')
      || Number(before.previous_job_id || 0) !== Number(after.previous_job_id || 0)
    const clarification = referenceChanged
      ? 'точка отсчёта изменилась; это не означает изменение общего пробега маршрута'
      : 'это длина отдельного переезда, а не общий пробег маршрута'
    effects.push(`путь до заявки: раньше ${formatRouteDistance(beforeDistance)} ${routeLegOrigin(before)}, теперь ${formatRouteDistance(afterDistance)} ${routeLegOrigin(after)} (${clarification})`)
  }

  let purpose = 'Получить допустимый опубликованный план с учётом смен, совместимости инженеров, временных окон и дорожных затрат.'
  if (relatedIds.length) purpose = 'Освободить место для нового назначения и сохранить допустимую последовательность всего маршрута.'
  if (change?.change_type === 'ASSIGNED') purpose = 'Выполнить заявку в доступном временном слоте, не нарушая ограничения маршрута.'
  if (['DISPLACED', 'CANCELLED'].includes(change?.change_type)) purpose = 'Не оставлять в маршруте назначение, которое больше нельзя выполнить в сохранённых условиях.'

  return {
    cause,
    effect: effects.length ? `Изменилось: ${effects.join('; ')}.` : 'Параметры назначения были пересчитаны, но основной маршрутный результат сохранился.',
    purpose,
    basis,
  }
}

export function unassignedChangeExplanation(change, comparison = {}) {
  const previous = change?.previous_reason?.text
  const current = change?.current_reason?.text
  if (change?.change_type === 'UNASSIGNED_REMOVED') {
    const cancelled = (comparison.triggers || []).some((trigger) => trigger.event_type === 'JOB_CANCELLED' && (trigger.job_ids || []).map(Number).includes(Number(change.job_id)))
    const removedFromInput = (comparison.inputChanges?.removed_job_ids || []).map(Number).includes(Number(change.job_id))
    const cause = cancelled
      ? 'Заявка была отменена и поэтому исключена из активного планирования.'
      : removedFromInput
        ? 'Заявка отсутствует во входном снимке новой версии и больше не планируется.'
        : 'Заявка больше не входит в текущий список неназначенных; более точное итоговое состояние в этой версии не сохранилось.'
    return {
      cause,
      effect: `Раньше: ${previous || 'причина не сохранена'}. Сейчас неназначенного результата нет.`,
      purpose: 'Не показывать как проблему заявку, которая получила другое итоговое состояние.',
      basis: cancelled ? 'Отмена подтверждена журналом событий планирования.' : 'Сопоставлены итоговые списки неназначенных заявок и входные снимки двух версий.',
    }
  }
  return {
    cause: current || 'Текущая причина неназначения не сохранилась.',
    effect: previous ? `Причина изменилась: ${previous} → ${current || 'причина не сохранена'}.` : 'В предыдущей версии заявка не числилась неназначенной.',
    purpose: 'Не назначать заявку с нарушением обязательных ограничений и явно сохранить основной блокирующий фактор.',
    basis: 'Причины взяты из итоговых сохранённых результатов обеих версий.',
  }
}

export function planComparisonCause(comparison) {
  const assigned = (comparison?.changes || []).filter((item) => item.change_type === 'ASSIGNED')
  const input = comparison?.inputChanges || {}
  const causes = []
  if (input.horizon_changed) {
    const horizon = input.horizon_change || {}
    const dates = []
    if (horizon.effective_start_date) dates.push(`начало ${formatSnapshotDate(horizon.effective_start_date.before)} → ${formatSnapshotDate(horizon.effective_start_date.after)}`)
    if (horizon.maximum_horizon_end) dates.push(`конец ${formatSnapshotDate(horizon.maximum_horizon_end.before)} → ${formatSnapshotDate(horizon.maximum_horizon_end.after)}`)
    causes.push(`сместился расчётный горизонт планирования${dates.length ? ` (${dates.join(', ')})` : ''}`)
  }
  if (input.carried_forward_job_ids?.length) causes.push(`заявки ${input.carried_forward_job_ids.slice(0, 4).map((jobId) => `№${jobId}`).join(', ')} оказались до начала нового горизонта и сохранили прежние назначения`)
  if (input.schedule_changes?.length) causes.push(`изменились смены инженеров: ${input.schedule_changes.length}`)
  if (input.equipment_changes?.length) causes.push(`изменилось количество оборудования: ${input.equipment_changes.map((item) => item.equipment_name || `тип #${item.equipment_type_id}`).join(', ')}`)
  if (input.job_changes?.length) causes.push(`обновлены данные заявок: ${input.job_changes.length}`)
  if (input.new_job_ids?.length) causes.push(`добавлены заявки: ${input.new_job_ids.slice(0, 4).map((jobId) => `№${jobId}`).join(', ')}`)
  if (input.removed_job_ids?.length) causes.push(`исключены заявки: ${input.removed_job_ids.slice(0, 4).map((jobId) => `№${jobId}`).join(', ')}`)
  if (input.engineer_changes?.length) causes.push(`изменились данные инженеров: ${input.engineer_changes.map((item) => item.engineer_name || `№${item.engineer_id}`).slice(0, 4).join(', ')}`)
  if (input.required_equipment_changed_work_type_ids?.length) causes.push('изменились требования к оборудованию')
  if (input.required_qualification_changed_work_type_ids?.length || input.engineer_qualification_changed_ids?.length) causes.push('изменились требования или квалификации инженеров')
  if (input.config_changed_fields?.length) causes.push(`изменены параметры оптимизации: ${input.config_changed_fields.length}`)
  const trigger = planningTriggerSummary(comparison)
  if (causes.length) {
    const outcome = comparison?.counts?.changed
      ? `Планировщик проверил затронутые назначения заново${assigned.length ? ` и добавил новых назначений: ${assigned.length}` : ''}.`
      : 'Опубликованные назначения при этом не изменились.'
    return `${trigger ? `${trigger} ` : ''}Между снимками ${causes.join('; ')}. ${outcome}`
  }
  if (assigned.length) {
    const jobs = assigned.slice(0, 4).map((item) => `№${item.job_id}`).join(', ')
    return `${trigger ? `${trigger} ` : ''}В план добавлено ${assigned.length} ${assigned.length === 1 ? 'назначение' : 'назначения'} (${jobs}). Маршруты с этими заявками были пересобраны, поэтому у соседних остановок могли измениться время и позиция.`
  }
  if (comparison?.counts?.changed) return `${trigger ? `${trigger} ` : ''}Оптимизатор повторно проверил назначения по сохранённому снимку ограничений; конкретный эффект раскрыт в каждой карточке ниже.`
  return `${trigger ? `${trigger} ` : ''}Повторный расчёт подтвердил прежние назначения и причины неназначения.`
}
