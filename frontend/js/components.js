import { toast, confirmDelete } from './utils.js';

let _modalSaveHandler = null;
let _mainModal = null;
let _confirmModal = null;

function getMainModal() {
  if (!_mainModal) _mainModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('main-modal'));
  return _mainModal;
}

// ---------------------------------------------------------------------------
// Generic table renderer
// ---------------------------------------------------------------------------

// Stato di ordinamento/filtri per tabella, associato al suo contenitore DOM.
// Quando il container viene ricreato (es. cambio tab/sotto-tab), lo stato
// precedente non è più raggiungibile e si riparte da zero.
const _tableState = new WeakMap();

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * columns: [{ key, label, fmt?, width?, class?, sortable?, filterable? }]
 * rows: array of objects
 * actions: { onEdit?, onDelete?, onDetail?, extra? }
 */
export function renderTable(container, { columns, rows, actions = {}, emptyMsg = 'Nessun elemento trovato', defaultSort = null }) {
  if (!rows.length) {
    container.innerHTML = `<div class="text-center py-5 text-muted"><i class="bi bi-inbox fs-1 d-block mb-2"></i>${emptyMsg}</div>`;
    return;
  }

  let state = _tableState.get(container);
  if (!state) {
    state = defaultSort
      ? { sortKey: defaultSort.key, sortDir: defaultSort.dir === 'desc' ? -1 : 1, filters: {} }
      : { sortKey: null, sortDir: 1, filters: {} };
    _tableState.set(container, state);
  }

  const hasActions = actions.onEdit || actions.onDelete || actions.onDetail || actions.extra;
  const colSpan = columns.length + (hasActions ? 1 : 0);

  function cellText(c, row) {
    const v = row[c.key];
    if (typeof v === 'boolean') return v ? 'sì' : 'no';
    const display = c.fmt ? c.fmt(v, row) : v;
    if (display === null || display === undefined) return '';
    return String(display).replace(/<[^>]*>/g, '').trim();
  }

  function sortValue(c, row) {
    const v = row[c.key];
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string') {
      const s = v.trim();
      if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
      // Date/datetime ISO (es. "2026-06-15" o "2026-06-15T10:52:49Z"): l'ordine
      // lessicografico coincide con l'ordine cronologico, a differenza del
      // formato "gg/mm/aaaa" usato per la visualizzazione.
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
    }
    return cellText(c, row).toLowerCase();
  }

  function getDisplayRows() {
    let out = rows;
    for (const c of columns) {
      const f = (state.filters[c.key] || '').trim().toLowerCase();
      if (!f) continue;
      out = out.filter(row => cellText(c, row).toLowerCase().includes(f));
    }
    if (state.sortKey) {
      const col = columns.find(c => c.key === state.sortKey);
      if (col) {
        out = [...out].sort((ra, rb) => {
          const a = sortValue(col, ra), b = sortValue(col, rb);
          let cmp;
          if (a === null && b === null) cmp = 0;
          else if (a === null) cmp = -1;
          else if (b === null) cmp = 1;
          else if (typeof a === 'number' && typeof b === 'number') cmp = a - b;
          else cmp = String(a).localeCompare(String(b), 'it', { numeric: true, sensitivity: 'base' });
          return cmp * state.sortDir;
        });
      }
    }
    return out;
  }

  function rowHtml(row) {
    const cells = columns.map(c => {
      const v = row[c.key];
      const display = c.fmt ? c.fmt(v, row) : (v === null || v === undefined ? '<span class="text-muted">—</span>' : v);
      return `<td class="${c.class || ''}">${display}</td>`;
    }).join('');

    let actionBtns = '';
    if (actions.extra) actionBtns += actions.extra(row);
    if (actions.onDetail) actionBtns += `<button class="btn btn-sm btn-outline-primary btn-action me-1" data-action="detail" data-id="${row.id}" title="Apri"><i class="bi bi-eye"></i></button>`;
    if (actions.onEdit)   actionBtns += `<button class="btn btn-sm btn-outline-secondary btn-action me-1" data-action="edit" data-id="${row.id}" title="Modifica"><i class="bi bi-pencil"></i></button>`;
    if (actions.onDelete) actionBtns += `<button class="btn btn-sm btn-outline-danger btn-action" data-action="delete" data-id="${row.id}" title="Elimina"><i class="bi bi-trash"></i></button>`;

    return `<tr>${cells}${hasActions ? `<td class="text-end">${actionBtns}</td>` : ''}</tr>`;
  }

  function bodyHtml(displayRows) {
    if (!displayRows.length) {
      return `<tr><td colspan="${colSpan}" class="text-center text-muted py-4">Nessun risultato con i filtri applicati</td></tr>`;
    }
    return displayRows.map(rowHtml).join('');
  }

  function bindRowActions(displayRows) {
    container.querySelectorAll('tbody [data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        const row = displayRows.find(r => r.id === id);
        const action = btn.dataset.action;
        if (action === 'detail' && actions.onDetail) actions.onDetail(id, row);
        if (action === 'edit'   && actions.onEdit)   actions.onEdit(id, row);
        if (action === 'delete' && actions.onDelete) actions.onDelete(id, row);
      });
    });
  }

  // Ridisegna solo il corpo della tabella (usato durante la digitazione nei
  // filtri, per non perdere il focus sugli input).
  function redrawBody() {
    const displayRows = getDisplayRows();
    container.querySelector('tbody').innerHTML = bodyHtml(displayRows);
    bindRowActions(displayRows);
  }

  // Ridisegna l'intera tabella (intestazioni, filtri e corpo).
  function redraw() {
    const displayRows = getDisplayRows();

    const headCells = columns.map(c => {
      const sortable = c.sortable !== false;
      let icon = '';
      if (sortable && state.sortKey === c.key) {
        icon = ` <i class="bi bi-caret-${state.sortDir === 1 ? 'up' : 'down'}-fill"></i>`;
      }
      const cls = sortable ? ' class="sortable"' : '';
      const attr = sortable ? ` data-sort-key="${c.key}"` : '';
      return `<th ${c.width ? `style="width:${c.width}"` : ''}${cls}${attr}>${c.label}${icon}</th>`;
    }).join('') + (hasActions ? '<th style="width:130px"></th>' : '');

    const filterCells = columns.map(c => {
      if (c.filterable === false) return '<th></th>';
      const val = escapeAttr(state.filters[c.key] || '');
      return `<th><input type="text" class="form-control form-control-sm table-filter-input" data-filter-key="${c.key}" placeholder="Filtra..." value="${val}"></th>`;
    }).join('') + (hasActions ? '<th></th>' : '');

    container.innerHTML = `
      <table class="table table-hover">
        <thead>
          <tr>${headCells}</tr>
          <tr class="table-filter-row">${filterCells}</tr>
        </thead>
        <tbody>${bodyHtml(displayRows)}</tbody>
      </table>`;

    container.querySelectorAll('th[data-sort-key]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sortKey;
        if (state.sortKey === key) state.sortDir = -state.sortDir;
        else { state.sortKey = key; state.sortDir = 1; }
        redraw();
      });
    });

    container.querySelectorAll('input[data-filter-key]').forEach(input => {
      input.addEventListener('input', () => {
        state.filters[input.dataset.filterKey] = input.value;
        redrawBody();
      });
    });

    bindRowActions(displayRows);
  }

  redraw();
}

// ---------------------------------------------------------------------------
// Generic modal form
// ---------------------------------------------------------------------------
/**
 * fields: [{ name, label, type, required?, options?, placeholder?, value?, rows?, step?, min? }]
 *   types: text, number, decimal, date, select, textarea, checkbox, hidden
 * values: existing object (for edit)
 * onSave: async (data) => void
 */
export function showFormModal({ title, fields, values = {}, onSave, afterShow }) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = buildForm(fields, values);

  const modal = getMainModal();
  modal.show();
  if (afterShow) afterShow(document.getElementById('modal-body'));

  const saveBtn = document.getElementById('modal-save-btn');
  if (_modalSaveHandler) saveBtn.removeEventListener('click', _modalSaveHandler);

  _modalSaveHandler = async () => {
    const data = readForm(fields);
    if (!validateForm(fields, data)) return;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Salvo...';
    try {
      await onSave(data);
      modal.hide();
    } catch (e) {
      toast(e.message, 'danger');
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Salva';
    }
  };
  saveBtn.addEventListener('click', _modalSaveHandler);
}

function buildForm(fields, values) {
  const visibleFields = fields.filter(f => f.type !== 'hidden');
  // Group into rows of up to 3 cols
  let html = '<div class="row g-3">';
  for (const f of visibleFields) {
    const val = values[f.name] ?? f.value ?? '';
    const colClass = f.col ? `col-md-${f.col}` : 'col-md-6';
    html += `<div class="${colClass}">${fieldHtml(f, val)}</div>`;
  }
  // Add hidden fields as actual hidden inputs
  fields.filter(f => f.type === 'hidden').forEach(f => {
    html += `<input type="hidden" name="${f.name}" value="${values[f.name] ?? f.value ?? ''}" />`;
  });
  html += '</div>';
  return html;
}

function fieldHtml(f, val) {
  const req = f.required ? '<span class="text-danger">*</span>' : '';
  const label = `<label class="form-label fw-semibold small mb-1">${f.label} ${req}</label>`;
  let input = '';

  if (f.type === 'select') {
    const optionsHtml = (f.options || []).map(o => {
      const v = typeof o === 'object' ? o.value : o;
      const l = typeof o === 'object' ? o.label : o;
      return `<option value="${v}" ${String(v) === String(val) ? 'selected' : ''}>${l}</option>`;
    }).join('');
    input = `<select class="form-select" name="${f.name}" ${f.required ? 'required' : ''}>
      <option value="">— Seleziona —</option>${optionsHtml}</select>`;
  } else if (f.type === 'textarea') {
    input = `<textarea class="form-control" name="${f.name}" rows="${f.rows || 2}" placeholder="${f.placeholder || ''}">${val}</textarea>`;
  } else if (f.type === 'checkbox') {
    return `<div class="form-check mt-4">
      <input class="form-check-input" type="checkbox" name="${f.name}" id="chk_${f.name}" ${val ? 'checked' : ''}>
      <label class="form-check-label" for="chk_${f.name}">${f.label}</label>
    </div>`;
  } else {
    const itype = f.type === 'decimal' ? 'number' : f.type;
    const step = f.type === 'decimal' ? (f.step || '0.0001') : (f.step || '1');
    const extra = f.type === 'number' || f.type === 'decimal' ? `step="${step}"` : '';
    input = `<input type="${itype}" class="form-control" name="${f.name}" value="${val}"
      placeholder="${f.placeholder || ''}" ${f.required ? 'required' : ''} ${extra} />`;
  }
  return `${label}${input}`;
}

function readForm(fields) {
  const data = {};
  const form = document.getElementById('modal-body');
  for (const f of fields) {
    const el = form.querySelector(`[name="${f.name}"]`);
    if (!el) continue;
    if (f.type === 'checkbox') { data[f.name] = el.checked; continue; }
    const v = el.value.trim();
    if (v === '') { data[f.name] = null; continue; }
    if (f.type === 'number') data[f.name] = parseInt(v);
    else if (f.type === 'decimal') data[f.name] = parseFloat(v);
    else data[f.name] = v;
  }
  return data;
}

function validateForm(fields, data) {
  const form = document.getElementById('modal-body');
  let valid = true;
  form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
  for (const f of fields) {
    if (f.required && (data[f.name] === null || data[f.name] === '')) {
      const el = form.querySelector(`[name="${f.name}"]`);
      if (el) el.classList.add('is-invalid');
      valid = false;
    }
  }
  if (!valid) toast('Compilare i campi obbligatori', 'warning');
  return valid;
}

// ---------------------------------------------------------------------------
// Import massivo (CSV/XLSX)
// ---------------------------------------------------------------------------
/**
 * templateUrl: URL del template CSV scaricabile
 * importFn: async (file) => BulkImportResult { totale_righe, inseriti, errori: [{riga, errore}] }
 * onSuccess: chiamata alla chiusura del modal se almeno una riga è stata inserita
 * helpHtml: HTML opzionale con dettagli sulle colonne accettate
 */
export function showImportModal({ title, templateUrl, importFn, onSuccess, helpHtml = '' }) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = `
    <div class="d-flex align-items-start justify-content-between mb-3 gap-2">
      <div class="small text-muted">Carica un file <code>.csv</code> o <code>.xlsx</code> con una riga di intestazione (vedi template).</div>
      <a href="${templateUrl}" class="btn btn-outline-secondary btn-sm text-nowrap" download>
        <i class="bi bi-download me-1"></i>Scarica template
      </a>
    </div>
    ${helpHtml}
    <div class="mb-3">
      <label class="form-label fw-semibold small mb-1">File <span class="text-danger">*</span></label>
      <input type="file" class="form-control" id="import-file" accept=".csv,.xlsx">
    </div>
    <div id="import-result"></div>`;

  const modal = getMainModal();
  const modalEl = document.getElementById('main-modal');
  modal.show();

  const saveBtn = document.getElementById('modal-save-btn');
  saveBtn.innerHTML = '<i class="bi bi-upload me-1"></i>Importa';
  if (_modalSaveHandler) saveBtn.removeEventListener('click', _modalSaveHandler);

  let insertedAny = false;

  _modalSaveHandler = async () => {
    const file = document.getElementById('import-file').files[0];
    if (!file) { toast('Seleziona un file', 'warning'); return; }
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Importo...';
    try {
      const result = await importFn(file);
      if (result.inseriti > 0) insertedAny = true;
      const variant = result.errori.length ? (result.inseriti ? 'warning' : 'danger') : 'success';
      let html = `<div class="alert alert-${variant} mb-2">Inserite <strong>${result.inseriti}</strong> righe su ${result.totale_righe}.</div>`;
      if (result.errori.length) {
        html += `<div class="small" style="max-height:200px; overflow:auto;">` +
          result.errori.map(e => `<div class="text-danger">Riga ${e.riga}: ${e.errore}</div>`).join('') +
          `</div>`;
      }
      document.getElementById('import-result').innerHTML = html;
      if (!result.errori.length) {
        toast('Importazione completata', 'success');
        setTimeout(() => modal.hide(), 1000);
      }
    } catch (e) {
      toast(e.message, 'danger');
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="bi bi-upload me-1"></i>Importa';
    }
  };
  saveBtn.addEventListener('click', _modalSaveHandler);

  modalEl.addEventListener('hidden.bs.modal', () => {
    saveBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Salva';
    if (insertedAny && onSuccess) onSuccess();
  }, { once: true });
}

// ---------------------------------------------------------------------------
// Simple confirm + delete helper
// ---------------------------------------------------------------------------
export async function deleteWithConfirm(name, deleteFn, onSuccess) {
  const confirmed = await confirmDelete(name);
  if (!confirmed) return;
  try {
    await deleteFn();
    toast(`"${name}" eliminato`, 'success');
    if (onSuccess) onSuccess();
  } catch (e) {
    toast(e.message, 'danger');
  }
}
