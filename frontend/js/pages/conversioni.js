import { api } from '../api.js';
import { toast, setHeaderActions } from '../utils.js';
import { renderTable, showFormModal, showImportModal, deleteWithConfirm } from '../components.js';

const COLUMNS = [
  { key: '_prodotto',           label: 'Prodotto',    fmt: v => v !== '—' ? `<span class="fw-semibold">${v}</span>` : '<span class="text-muted">—</span>' },
  { key: '_descrizione',        label: 'Descrizione' },
  { key: '_scope',              label: 'Livello',     fmt: v => v },
  { key: 'da_unita',            label: 'Da U.M.',     fmt: v => `<code>${v}</code>` },
  { key: 'a_unita',             label: 'A U.M.',      fmt: v => `<code>${v}</code>` },
  { key: 'fattore_conversione', label: 'Fattore',     fmt: v => Number(v).toFixed(6) },
  { key: 'note',                label: 'Note' },
];

export async function renderConversioni(container) {
  const [rows, prodotti, categorie] = await Promise.all([
    api.conversioni.list('?limit=10000'), api.prodotti.list('?limit=10000'), api.categorie.list(),
  ]);

  const prodMap = Object.fromEntries(prodotti.map(p => [p.id, p]));
  const catMap  = Object.fromEntries(categorie.map(c => [c.id, c]));

  rows.forEach(r => {
    const prod = r.id_prodotto ? prodMap[r.id_prodotto] : null;
    r._prodotto    = prod ? prod.codice_prodotto : '—';
    r._descrizione = prod ? prod.descrizione : (r.id_categoria ? catMap[r.id_categoria]?.descrizione ?? '—' : '—');
    r._catId       = prod ? prod.id_categoria : r.id_categoria;
    r._scope       = prod
      ? `<span class="badge bg-secondary">prodotto</span>`
      : `<span class="badge bg-primary">categoria</span>`;
  });

  setHeaderActions(`
    <a href="${api.conversioni.templateUrl}" class="btn btn-outline-secondary btn-sm me-2" download>
      <i class="bi bi-download me-1"></i>Template
    </a>
    <a href="${api.conversioni.exportUrl}" class="btn btn-outline-secondary btn-sm me-2" download>
      <i class="bi bi-file-earmark-arrow-down me-1"></i>Esporta
    </a>
    <button class="btn btn-outline-primary btn-sm me-2" id="btn-import"><i class="bi bi-upload me-1"></i>Importa</button>
    <button class="btn btn-primary btn-sm" id="btn-new"><i class="bi bi-plus-lg me-1"></i>Nuova Conversione</button>`);

  container.innerHTML = `
    <ul class="nav nav-pills mb-3">
      ${categorie.map((c, i) => `
        <li class="nav-item">
          <button class="nav-link ${i === 0 ? 'active' : ''}" data-bs-toggle="pill"
            data-bs-target="#conv-cat-${c.id}" type="button" title="${c.descrizione}">
            ${c.codice}
          </button>
        </li>`).join('')}
    </ul>
    <div class="tab-content">
      ${categorie.map((c, i) => `<div class="tab-pane fade ${i === 0 ? 'show active' : ''}" id="conv-cat-${c.id}"></div>`).join('')}
    </div>`;

  const fields = [
    { name: 'id_prodotto',         label: 'Prodotto (specifico)',        type: 'select', col: 6,
      options: [{ value: '', label: '— nessuno (regola categoria) —' },
                ...prodotti.map(p => ({ value: p.id, label: `${p.codice_prodotto} — ${p.descrizione}` }))] },
    { name: 'id_categoria',        label: 'Categoria (regola generale)', type: 'select', col: 6,
      options: [{ value: '', label: '— nessuna —' },
                ...categorie.map(c => ({ value: c.id, label: c.codice }))] },
    { name: 'da_unita',            label: 'Da Unità',   type: 'select', required: true, col: 3,
      options: ['pz','m','ml','mq','t'].map(v => ({ value: v, label: v })) },
    { name: 'a_unita',             label: 'A Unità',    type: 'select', required: true, col: 3,
      options: ['kg','t'].map(v => ({ value: v, label: v })) },
    { name: 'fattore_conversione', label: 'Fattore (1 da_unità = ? a_unità)', type: 'decimal', required: true, col: 6, step: '0.000001' },
    { name: 'note',                label: 'Note', type: 'textarea', col: 12 },
  ];

  categorie.forEach((cat, i) => {
    const pane = container.querySelector(`#conv-cat-${cat.id}`);
    const catRows = rows.filter(r => r._catId === cat.id);

    pane.innerHTML = `
      <div class="table-card">
        <div class="table-toolbar">
          <span class="text-muted small">${catRows.length} conversioni — ${cat.codice}</span>
        </div>
        <div class="tbl-body"></div>
      </div>`;

    if (catRows.length === 0) {
      pane.querySelector('.tbl-body').innerHTML =
        '<div class="text-center py-5 text-muted small">Nessuna conversione per questa categoria</div>';
    } else {
      renderTable(pane.querySelector('.tbl-body'), {
        columns: COLUMNS, rows: catRows,
        actions: { onEdit: openEdit, onDelete: doDelete },
      });
    }
  });

  document.getElementById('btn-new').onclick = () => showFormModal({
    title: 'Nuova Conversione Peso', fields, values: { a_unita: 'kg' },
    onSave: async data => { await api.conversioni.create(data); toast('Conversione creata'); location.reload(); },
  });

  document.getElementById('btn-import').onclick = () => showImportModal({
    title: 'Importa Conversioni Peso da CSV/XLSX',
    templateUrl: api.conversioni.templateUrl,
    importFn: file => api.conversioni.importFile(file),
    onSuccess: () => location.reload(),
    helpHtml: `<p class="small text-muted">
      Una riga per prodotto (o per categoria). Campi obbligatori: <code>da_unita</code>,
      <code>fattore_conversione</code> (kg per 1 unità), e almeno uno tra
      <code>codice_prodotto</code> o <code>categoria_codice</code>.<br>
      Colonne opzionali: <code>a_unita</code> (default <code>kg</code>), <code>note</code>.
    </p>`,
  });

  function openEdit(id, row) {
    showFormModal({
      title: 'Modifica Conversione', fields, values: row,
      onSave: async data => { await api.conversioni.update(id, data); toast('Conversione aggiornata'); location.reload(); },
    });
  }

  async function doDelete(id, row) {
    const label = row._prodotto !== '—' ? `conversione ${row._prodotto}` : `conversione #${id}`;
    await deleteWithConfirm(label, () => api.conversioni.del(id), () => location.reload());
  }
}
