import React, { useEffect, useState } from 'react'

import { api } from './api.js'
import { Button, Field, Modal } from './ui.jsx'

export default function PlanningConfig({ notify, endpoint = '/api/project/planning-config' }) {
  const [config, setConfig] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    api(endpoint).then(setConfig).catch(() => setConfig(null))
  }, [endpoint])

  async function save(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const body = {}
    for (const [key, value] of form) body[key] = Number(value)
    try {
      setConfig(await api(endpoint, { method: 'PATCH', body: JSON.stringify(body) }))
      notify('Настройки расчёта сохранены')
      setOpen(false)
    } catch (error) {
      notify(error.message, 'error')
    }
  }

  if (!config) return null
  const fields = [
    ['solver_time_limit_sec', 'Лимит solver на день, сек'],
    ['batch_total_time_limit_sec', 'Лимит каскада, сек'],
    ['max_jobs_per_run', 'Заявок за дневной расчёт'],
    ['max_jobs_per_batch', 'Заявок в batch'],
    ['future_opportunity_critical', 'Бонус: одна возможность'],
    ['future_opportunity_high', 'Бонус: 2–3 возможности'],
    ['future_opportunity_limited', 'Бонус: 4–7 возможностей'],
    ['travel_cost_per_minute', 'Цена минуты пути'],
    ['sla_today', 'Штраф SLA сегодня'],
    ['sla_tomorrow', 'Штраф SLA завтра'],
    ['sla_overdue_base', 'Базовый штраф просрочки'],
  ]
  return <>
    <Button id="planning-parameters" kind="secondary" icon="settings" onClick={() => setOpen(true)}>Параметры</Button>
    {open && <Modal wide title="Параметры оптимизации" subtitle={`Версия конфигурации ${config.version}`} onClose={() => setOpen(false)}>
      <form className="stack-form" onSubmit={save}>
        <div className="form-grid">{fields.map(([name, label]) => <Field label={label} key={name}><input name={name} type="number" min="0" defaultValue={config[name]} /></Field>)}</div>
        <div className="form-actions"><Button type="button" kind="ghost" onClick={() => setOpen(false)}>Отмена</Button><Button>Сохранить новую версию</Button></div>
      </form>
    </Modal>}
  </>
}
