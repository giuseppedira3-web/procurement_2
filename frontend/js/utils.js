export function fmt(v, type = 'text') {
  if (v === null || v === undefined || v === '') return '<span class="text-muted">—</span>';
  if (type === 'date') return new Date(v + 'T00:00:00').toLocaleDateString('it-IT');
  if (type === 'datetime') return new Date(v).toLocaleString('it-IT');
  if (type === 'currency') return new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2 }).format(v) + ' €';
  if (type === 'peso_t') return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(v / 1000) + ' t';
  if (type === 'number') return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 4 }).format(v);
  if (type === 'bool') return v ? '<i class="bi bi-check-circle-fill text-success"></i>' : '<i class="bi bi-x-circle text-secondary"></i>';
  if (type === 'stato') return `<span class="badge badge-${v}">${v.replace(/_/g,' ')}</span>`;
  return String(v);
}

export function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast align-items-center text-bg-${type} border-0 show`;
  el.setAttribute('role', 'alert');
  el.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${msg}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>`;
  document.getElementById('toast-container').appendChild(el);
  const bsToast = new bootstrap.Toast(el, { delay: 3500 });
  bsToast.show();
  el.addEventListener('hidden.bs.toast', () => el.remove());
}

export function setTitle(title, subtitle = '') {
  document.getElementById('page-title').textContent = title;
  document.title = title + ' — Procurement Acciaio';
}

export function setHeaderActions(html) {
  document.getElementById('header-actions').innerHTML = html;
}

export function loading(container) {
  container.innerHTML = `<div class="content-loading"><div class="spinner-border text-primary"></div></div>`;
}

export async function confirmDelete(name) {
  return new Promise(resolve => {
    const el = document.getElementById('confirm-modal');
    document.getElementById('confirm-text').textContent = `Eliminare "${name}"?`;
    const modal = bootstrap.Modal.getOrCreateInstance(el);
    const btn = document.getElementById('confirm-ok-btn');
    const handler = () => { modal.hide(); resolve(true); };
    btn.onclick = handler;
    el.addEventListener('hidden.bs.modal', () => resolve(false), { once: true });
    modal.show();
  });
}

// Generic select option builder
export function opts(items, valueKey, labelKey, selected = null) {
  return items.map(i =>
    `<option value="${i[valueKey]}" ${i[valueKey] == selected ? 'selected' : ''}>${i[labelKey]}</option>`
  ).join('');
}

// Colore identificativo per gli utenti senza password (pulsante di login + fascia header)
export const USER_COLORS = {
  giovanni: '#dc3545',
  giuseppe: '#198754',
  enzo:     '#6f42c1',
};

export function qs(sel, ctx = document) { return ctx.querySelector(sel); }
export function qsa(sel, ctx = document) { return [...ctx.querySelectorAll(sel)]; }

const QUALITA_COLORS = {
  'S235JRH':   'primary',
  'DX51D':     'secondary',
  'S275JRH':   'success',
  'S275J0H':   'success',
  'S275J2H':   'warning',
  'S355J0H':   '#fd7e14',
  'S355J2H':   'danger',
  'S280GD+Z':  '#6f42c1',
  'DD11':      'info',
  'DC01':      'dark',
  'N.a.':      'light',
  'Libero':    'secondary',
};

export const QUALITA_ACCIAIO = ['','S235JRH','DX51D','S275JRH','S275J0H','S275J2H','S355J0H','S355J2H','S280GD+Z','DD11','DC01','N.a.','Libero'];

export function qualitaBadge(v) {
  if (!v) return '<span class="text-muted">—</span>';
  const color = QUALITA_COLORS[v] ?? 'secondary';
  // Colore esadecimale personalizzato → stile inline; altrimenti classe Bootstrap
  if (color.startsWith('#')) return `<span class="badge" style="background:${color}">${v}</span>`;
  const textClass = color === 'light' ? ' text-dark' : '';
  return `<span class="badge bg-${color}${textClass}">${v}</span>`;
}

// --- Export CSV lato client: scarica le righe già caricate in una tabella -----
function csvCell(v) {
  if (v == null) return '';
  let s;
  if (typeof v === 'boolean') s = v ? 'sì' : 'no';
  else if (typeof v === 'number') s = v.toLocaleString('it-IT', { maximumFractionDigits: 4 });
  else s = String(v).replace(/<[^>]*>/g, '').replace(/&mdash;/g, '—').replace(/&nbsp;/g, ' ').trim();
  if (/[";\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function downloadCsv(filename, columns, rows) {
  if (!rows.length) { toast('Nessun dato da scaricare', 'warning'); return; }
  const header = columns.map(c => csvCell(c.label)).join(';');
  const lines  = rows.map(r => columns.map(c => csvCell(r[c.key])).join(';'));
  const csv = '﻿' + [header, ...lines].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
