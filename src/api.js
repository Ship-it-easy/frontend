const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export class ApiError extends Error {
  constructor(message, status, code, payload) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.payload = payload
  }
}

function errorDetails(payload, status) {
  const detail = payload?.detail
  if (typeof detail === 'string') return { message: detail }
  if (Array.isArray(detail)) return { message: detail.map((item) => item.msg).join('; ') }
  if (detail && typeof detail === 'object') return detail
  return {
    code: payload?.code,
    message: payload?.message || `Сервер вернул ошибку ${status}`,
  }
}

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {})
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    ...options,
    headers,
  })

  const payload = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    const details = errorDetails(payload, response.status)
    if (response.status === 401 && !path.endsWith('/login')) {
      window.dispatchEvent(new CustomEvent('route-app:unauthorized'))
    }
    throw new ApiError(details.message, response.status, details.code, payload)
  }
  return payload
}

export function qs(values) {
  const params = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) params.set(key, String(value))
  })
  const query = params.toString()
  return query ? `?${query}` : ''
}

export { API_URL }
