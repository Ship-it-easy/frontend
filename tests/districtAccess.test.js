import test from 'node:test'
import assert from 'node:assert/strict'
import {
  dispatcherPlanningBase,
  dispatcherWorkspaceBase,
  selectDispatcherProject,
} from '../src/districtAccess.js'

test('dispatcher keeps a remembered project only while it is assigned', () => {
  const projects = [{ id: 3, name: 'Восток' }, { id: 7, name: 'Запад' }]
  assert.equal(selectDispatcherProject(projects, '7'), '7')
  assert.equal(selectDispatcherProject(projects, '99'), '3')
})

test('dispatcher with no projects has no workspace scope', () => {
  assert.equal(selectDispatcherProject([], '7'), '')
  assert.equal(dispatcherWorkspaceBase(''), '')
})

test('workspace URL always carries the selected project', () => {
  assert.equal(dispatcherWorkspaceBase('7'), '/api/projects/7/workspace')
})

test('planning URL uses the project API outside the workspace router', () => {
  assert.equal(dispatcherPlanningBase('7'), '/api/projects/7')
  assert.equal(dispatcherPlanningBase(''), '')
})
