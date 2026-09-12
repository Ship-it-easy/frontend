import React, { useEffect, useRef, useState } from 'react'
import { api } from './api.js'

export const today = () => { const date = new Date(); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 10) }
function formatSafely(value, options, dateOnly = false) {
  if (!value) return '—'
  const date = new Date(dateOnly ? `${String(value).slice(0, 10)}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('ru-RU', options).format(date)
}
export const formatDate = (value) => formatSafely(value, undefined, true)
export const formatDateTime = (value) => formatSafely(value, { dateStyle: 'short', timeStyle: 'short' })
export const formatTime = (value) => {
  if (!value) return '—'
  const text = String(value)
  if (text.includes('T')) return formatSafely(value, { hour: '2-digit', minute: '2-digit' })
  return text.slice(0, 5)
}

const icons = { jobs: '▤', planning: '⌁', engineers: '♙', catalogs: '▦', projects: '▣', owners: '♙', today: '◎', future: '→', history: '✓', logout: '↗', close: '×', back: '←', plus: '+', settings: '⚙', refresh: '↻', search: '⌕', map: '◇', account: '○', chevron: '›', menu: '☰' }
export function Icon({ name }) { return <span className={`icon icon-${name}`} aria-hidden="true">{icons[name] || '•'}</span> }
export function Badge({ status, children }) { const value = String(status || '').toLowerCase(); return <span className={`badge badge-${value}`}>{children || status || '—'}</span> }
export function Button({ kind = 'primary', icon, children, ...props }) { return <button className={`button ${kind}`} {...props}>{icon && <Icon name={icon} />}{children}</button> }
export function Field({ label, hint, error, children, className = '', ...props }) { return <label className={`field ${className}`}><span>{label}</span>{children || <input {...props} />}{hint && <small>{hint}</small>}{error && <small className="field-error">{error}</small>}</label> }

export function CheckGroup({ items, value = [], onChange, empty = 'Справочник пуст' }) {
  const safeItems = Array.isArray(items) ? items : []
  const safeValue = Array.isArray(value) ? value : []
  const selected = new Set(safeValue.map(Number))
  if (!safeItems.length) return <p className="empty-inline">{empty}</p>
  return <div className="check-grid">{safeItems.map((item) => <label className="check-card" key={item.id}><input type="checkbox" checked={selected.has(Number(item.id))} onChange={() => onChange(selected.has(Number(item.id)) ? safeValue.filter((id) => Number(id) !== Number(item.id)) : [...safeValue, item.id])} /><span>{item.name}</span></label>)}</div>
}

export function AddressField({ label = 'Адрес', value, onChange, onSelect, required = true, hint }) {
  const [items, setItems] = useState([]), [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [searched, setSearched] = useState(false)
  const picked = useRef('')
  useEffect(() => {
    const query = value?.trim() || ''
    if (query.length < 3 || query === picked.current) { setItems([]); setOpen(false); return }
    const timer = setTimeout(async () => {
      setBusy(true); setSearched(false)
      try { const result = await api(`/api/project/address-suggestions?q=${encodeURIComponent(query)}`); setItems(result); setOpen(true); setSearched(true) }
      catch { setItems([]); setOpen(true); setSearched(true) } finally { setBusy(false) }
    }, 350)
    return () => clearTimeout(timer)
  }, [value])
  function change(event) { picked.current = ''; onChange(event.target.value) }
  function choose(item) { picked.current = item.display_name; setItems([]); setOpen(false); onChange(item.display_name); onSelect?.(item) }
  return <Field label={label} hint={hint || 'Начните вводить город, улицу и дом, затем выберите подсказку.'} className="address-control"><div className="input-icon-wrap"><Icon name="map" /><input required={required} value={value} onChange={change} onFocus={() => items.length && setOpen(true)} placeholder="Например, Пермь, улица Ленина, 58" /><span className={`input-state ${busy ? 'spin' : ''}`}>{busy ? '↻' : value === picked.current ? '✓' : ''}</span></div>{open && <div className="suggestions">{items.map((item) => <button type="button" key={`${item.latitude}-${item.longitude}-${item.display_name}`} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item)}><Icon name="map" /><span>{item.display_name}<small>{item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}</small></span></button>)}{!busy && searched && !items.length && <div className="suggestion-empty">Точный адрес с номером дома не найден</div>}</div>}</Field>
}

export function Modal({ title, subtitle, children, onClose, wide = false }) {
  useEffect(() => { const close = (event) => event.key === 'Escape' && onClose(); window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [onClose])
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className={`modal ${wide ? 'modal-wide' : ''}`}><header><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose}><Icon name="close" /></button></header>{children}</section></div>
}
export function Empty({ title, text, action }) { return <div className="empty-state"><div className="empty-symbol">◇</div><h3>{title}</h3><p>{text}</p>{action}</div> }
export function Toast({ toast, onClose }) { useEffect(() => { if (!toast) return; const timer = setTimeout(onClose, 4500); return () => clearTimeout(timer) }, [toast, onClose]); if (!toast) return null; return <div className={`toast toast-${toast.type || 'info'}`}><span>{toast.type === 'error' ? '!' : '✓'}</span><p>{toast.message}</p><button onClick={onClose}>×</button></div> }

export function Shell({ user, roleLabel, contextLabel, contextValue, nav, active, onNavigate, onLogout, children }) {
  const [mobile, setMobile] = useState(false)
  return <div className="app-shell"><aside className={mobile ? 'sidebar open' : 'sidebar'}><div className="sidebar-brand"><span className="brand-mark">↗</span><span>Маршрут<small>выездной сервис</small></span></div><div className="sidebar-context"><small>{contextLabel}</small><b>{contextValue}</b></div><nav>{nav.map((item) => <button key={item.id} className={active === item.id ? 'active' : ''} onClick={() => { onNavigate(item.id); setMobile(false) }}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav><div className="sidebar-user"><span className="avatar">{user.login?.[0]?.toUpperCase()}</span><span><b>{user.login}</b><small>{roleLabel}</small></span><button title="Выйти" onClick={onLogout}><Icon name="logout" /></button></div></aside><button className="mobile-menu" onClick={() => setMobile(!mobile)}><Icon name="menu" /></button>{mobile && <button className="mobile-overlay" aria-label="Закрыть меню" onClick={() => setMobile(false)} />}<main className="app-content">{children}</main></div>
}
export function PageHeader({ eyebrow, title, subtitle, actions }) { return <header className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div>{actions && <div className="page-actions">{actions}</div>}</header> }
export function StatCard({ label, value, tone = 'blue' }) { return <div className={`stat-card tone-${tone}`}><span>{label}</span><strong>{value}</strong><i /></div> }
