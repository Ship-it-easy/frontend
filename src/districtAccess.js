export function selectDispatcherProject(projects, rememberedProjectId) {
  const items = Array.isArray(projects) ? projects : []
  const remembered = String(rememberedProjectId || '')
  if (remembered && items.some((item) => String(item.id) === remembered)) return remembered
  return String(items[0]?.id || '')
}

export function dispatcherWorkspaceBase(projectId) {
  return projectId ? `/api/projects/${projectId}/workspace` : ''
}

export function dispatcherPlanningBase(projectId) {
  return projectId ? `/api/projects/${projectId}` : ''
}
