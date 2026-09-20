export const POLLING_STATUSES = new Set(['UPLOADED', 'VALIDATING', 'APPLYING'])
export const ACTIVE_PLANNING_EVENT_STATES = new Set(['PENDING', 'RUNNING'])

const PLANNING_EVENT_STATUS_TEXT = {
  PENDING: 'ожидает расчёта',
  RUNNING: 'расчёт выполняется',
  PUBLISHED: 'план обновлён',
  FAILED: 'расчёт завершился ошибкой',
}

export function planningEventStatusText(state) {
  return PLANNING_EVENT_STATUS_TEXT[state] || 'состояние уточняется'
}

export function buildApplyRequest(acknowledgeWarnings, idempotencyKey = crypto.randomUUID()) {
  return {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ acknowledge_warnings: Boolean(acknowledgeWarnings) }),
  }
}

export function canApplyBatch(batch, warningAcknowledged) {
  return batch?.status === 'READY_TO_APPLY'
    && (!Number(batch.warning_count || 0) || warningAcknowledged)
}
