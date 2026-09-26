import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/DynamicPlanningPage.jsx', import.meta.url), 'utf8')
const start = source.indexOf('async function loadDay(')
const end = source.indexOf('async function loadBoard(', start)
assert.ok(start >= 0 && end > start)
const loadDaySource = source.slice(start, end)

function fixture() {
  const pending = []
  const days = []
  const boardReloads = []
  const dayRequest = { current: 0 }
  const dayInFlight = { current: '' }
  const selectedDateRef = { current: '2026-09-27' }
  const boardRef = { current: { plan_version: { id: 14 } } }
  const loadDay = new Function(
    'api', 'base', 'dayRequest', 'dayInFlight', 'selectedDateRef', 'boardRef', 'setDay',
    'loadBoard', 'emitPlanningEvent', 'notify', `${loadDaySource}\nreturn loadDay`,
  )(
    (url) => new Promise((resolve, reject) => pending.push({ url, resolve, reject })),
    '/api/projects/8/planning', dayRequest, dayInFlight, selectedDateRef, boardRef,
    (value) => days.push(value),
    async (quiet, date) => { boardReloads.push({ quiet, date }); return null },
    () => {}, () => {},
  )
  return { pending, days, boardReloads, dayRequest, dayInFlight, selectedDateRef, boardRef, loadDay }
}

test('late day response cannot replace the day selected on another tab', async () => {
  const view = fixture()
  const oldRequest = view.loadDay('2026-09-27', 14)
  view.selectedDateRef.current = '2026-09-28'
  const currentRequest = view.loadDay('2026-09-28', 14)

  view.pending[1].resolve({ marker: '28 September' })
  assert.deepEqual(await currentRequest, { marker: '28 September' })
  view.pending[0].resolve({ marker: '27 September' })
  assert.equal(await oldRequest, null)
  assert.deepEqual(view.days, [{ marker: '28 September' }])
})

test('response from a superseded plan version cannot enter the board', async () => {
  const view = fixture()
  const oldRequest = view.loadDay('2026-09-27', 14)
  view.boardRef.current = { plan_version: { id: 15 } }
  view.pending[0].resolve({ marker: 'version 14' })
  assert.equal(await oldRequest, null)
  assert.deepEqual(view.days, [])
})

test('obsolete VERSION_CHANGED error does not trigger another board reload', async () => {
  const view = fixture()
  const oldRequest = view.loadDay('2026-09-27', 14)
  view.selectedDateRef.current = '2026-09-28'
  const currentRequest = view.loadDay('2026-09-28', 14)
  view.pending[0].reject(Object.assign(new Error('old version'), { code: 'VERSION_CHANGED' }))
  assert.equal(await oldRequest, null)
  assert.deepEqual(view.boardReloads, [])
  view.pending[1].resolve({ marker: '28 September' })
  await currentRequest
})
