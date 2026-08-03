import { api } from '../api.js';
import { fmt, toast, setHeaderActions, setTitle, countLabel } from '../utils.js';
import { renderTable, showFormModal, deleteWithConfirm } from '../components.js';

const LIST_LIMIT = 1000;

const COLUMNS = [
  { key: 'ragione_sociale', label: 'Ragione Sociale', fmt: v => `<strong>${v}</strong>` },
  { key: 'telefono',        label: 'Telefono' },
  { key: 'email',           label: 'Email' },
  { key: 'note',            label: 'Note' },
  { key: 'attivo',          label: 'Attivo', width: '70px', fmt: v => fmt(v, 'bool') },
];

const FIELDS = [
  { name: 'ragione_sociale', label: 'Ragione Sociale', type: 'text',     required: true, col: 8 },
  { name: 'telefono',        label: 'Telefono',         type: 'text',     col: 4 },
  { name: 'email',           label: 'Email',            type: 'text',     col: 6 },
  { name: 'attivo',          label: 'Attivo',           type: 'checkbox', col: 2, value: true },
  { name: 'note',            label: 'Note',             type: 'textarea', col: 12 },
];

export async function renderVettori(container) {
  setTitle('Vettori');
  const rows = await api.vettori.list(`?limit=${LIST_LIMIT}`);

  setHeaderActions(`<button class="btn btn-primary btn-sm" id="btn-new"><i class="bi bi-plus-lg me-1"></i>Nuovo Vettore</button>`);

  const wrap = document.createElement('div');
  wrap.className = 'table-card';
  wrap.innerHTML = `<div class="table-toolbar">${countLabel(rows.length, LIST_LIMIT, 'vettori')}</div><div id="tbl-body"></div>`;
  container.innerHTML = '';
  container.appendChild(wrap);

  renderTable(wrap.querySelector('#tbl-body'), {
    columns: COLUMNS,
    rows,
    actions: {
      onEdit:   (id, row) => showFormModal({
        title: `Modifica: ${row.ragione_sociale}`, fields: FIELDS, values: row,
        onSave: async data => { await api.vettori.update(id, data); toast('Vettore aggiornato'); renderVettori(container); },
      }),
      onDelete: (id, row) => deleteWithConfirm(row.ragione_sociale, () => api.vettori.del(id), () => renderVettori(container)),
    },
  });

  document.getElementById('btn-new').onclick = () => showFormModal({
    title: 'Nuovo Vettore', fields: FIELDS,
    onSave: async data => { await api.vettori.create(data); toast('Vettore creato'); renderVettori(container); },
  });
}
