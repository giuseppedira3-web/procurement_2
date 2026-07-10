import { api } from '../api.js';
import { fmt, toast, setHeaderActions } from '../utils.js';
import { renderTable, showFormModal, deleteWithConfirm } from '../components.js';

const COLUMNS = [
  { key: 'codice',             label: 'Codice',     fmt: v => `<span class="fw-semibold">${v}</span>` },
  { key: 'descrizione',        label: 'Descrizione' },
  { key: 'tipo_prezzo',        label: 'Tipo Prezzo', fmt: v => fmt(v, 'stato') },
  { key: 'unita_misura_base',  label: 'U.M. Base',  fmt: v => `<code>${v}</code>` },
  { key: 'note',               label: 'Note' },
];

const FIELDS = [
  { name: 'codice',            label: 'Codice',            type: 'text',   required: true, col: 4, placeholder: 'es. LAMIERA' },
  { name: 'descrizione',       label: 'Descrizione',       type: 'text',   required: true, col: 8 },
  { name: 'tipo_prezzo',       label: 'Tipo Prezzo',       type: 'select', required: true, col: 6,
    options: [{ value: 'listino', label: 'Listino (variabile)' }, { value: 'fisso', label: 'Fisso (contratto)' }] },
  { name: 'unita_misura_base', label: 'U.M. Base',         type: 'select', required: true, col: 6,
    options: ['kg','t','m','ml','pz','mq'].map(v => ({ value: v, label: v })) },
  { name: 'note', label: 'Note', type: 'textarea', col: 12 },
];

export async function renderCategorie(container) {
  const rows = await api.categorie.list();

  setHeaderActions(`<button class="btn btn-primary btn-sm" id="btn-new"><i class="bi bi-plus-lg me-1"></i>Nuova Categoria</button>`);

  const wrap = document.createElement('div');
  wrap.className = 'table-card';
  wrap.innerHTML = `<div class="table-toolbar"><span class="text-muted small">${rows.length} categorie</span></div><div id="tbl-body"></div>`;
  container.innerHTML = '';
  container.appendChild(wrap);

  renderTable(wrap.querySelector('#tbl-body'), {
    columns: COLUMNS, rows,
    actions: { onEdit: openEdit, onDelete: doDelete },
  });

  document.getElementById('btn-new').onclick = () => showFormModal({
    title: 'Nuova Categoria', fields: FIELDS, values: {},
    onSave: async data => { await api.categorie.create(data); toast('Categoria creata'); location.reload(); },
  });

  function openEdit(id, row) {
    showFormModal({
      title: `Modifica: ${row.codice}`, fields: FIELDS.filter(f => f.name !== 'codice'), values: row,
      onSave: async data => { await api.categorie.update(id, data); toast('Categoria aggiornata'); location.reload(); },
    });
  }

  async function doDelete(id, row) {
    await deleteWithConfirm(row.codice, () => api.categorie.del(id), () => location.reload());
  }
}
