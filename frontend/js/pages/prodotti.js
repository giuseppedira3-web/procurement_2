import { api } from '../api.js';
import { fmt, toast, setHeaderActions, downloadCsv } from '../utils.js';
import { renderTable, showFormModal, showImportModal, deleteWithConfirm } from '../components.js';

const LIMIT = 10000;

const COLUMNS = [
  { key: 'codice_prodotto',       label: 'Codice',  fmt: v => `<span class="fw-semibold">${v}</span>` },
  { key: 'descrizione',           label: 'Descrizione' },
  { key: 'norma',                 label: 'Norma' },
  { key: 'qualita_acciaio',       label: 'Qualità' },
  { key: 'unita_misura_acquisto', label: 'U.M.',    fmt: v => `<code>${v}</code>` },
  { key: 'attivo',                label: 'Attivo',  fmt: v => fmt(v, 'bool') },
];

const BADGE_COLORS_TRAVE = ['primary','success','warning','danger','info','secondary'];

const COLUMNS_TRAVI = [
  { key: 'codice_prodotto',       label: 'Codice',     fmt: v => `<span class="fw-semibold">${v}</span>` },
  { key: 'descrizione',           label: 'Descrizione' },
  { key: 'categoria_trave',       label: 'Categoria',
    fmt: v => v != null
      ? `<span class="badge bg-${BADGE_COLORS_TRAVE[v]}">Cat ${v}</span>`
      : '<span class="text-muted">—</span>' },
  { key: 'norma',                 label: 'Norma' },
  { key: 'unita_misura_acquisto', label: 'U.M.',        fmt: v => `<code>${v}</code>` },
  { key: 'attivo',                label: 'Attivo',      fmt: v => fmt(v, 'bool') },
];

export async function renderProdotti(container) {
  const [rows, categorie] = await Promise.all([
    api.prodotti.list(`?limit=${LIMIT}`), api.categorie.list(),
  ]);

  setHeaderActions(`
    <a href="${api.prodotti.templateUrl}" class="btn btn-outline-secondary btn-sm me-2" download title="Scarica template per import massivo">
      <i class="bi bi-download me-1"></i>Template
    </a>
    <a href="${api.prodotti.exportUrl}" class="btn btn-outline-secondary btn-sm me-2" download title="Scarica i prodotti esistenti in CSV (stesso formato del template)">
      <i class="bi bi-file-earmark-arrow-down me-1"></i>Esporta
    </a>
    <button class="btn btn-outline-primary btn-sm me-2" id="btn-import"><i class="bi bi-upload me-1"></i>Importa</button>
    <button class="btn btn-primary btn-sm" id="btn-new"><i class="bi bi-plus-lg me-1"></i>Nuovo Prodotto</button>`);

  if (rows.length >= LIMIT) {
    toast(`Attenzione: raggiunto il limite di ${LIMIT.toLocaleString('it-IT')} prodotti caricati. Potrebbero essercene altri non visualizzati.`, 'warning');
  }

  const senzaCategoria = rows.filter(r => r.id_categoria == null);
  const categorieOrdinate = [...categorie].sort((a, b) =>
    (a.codice === 'ALTRO') - (b.codice === 'ALTRO') || a.codice.localeCompare(b.codice));
  const tabs = [
    ...categorieOrdinate.map(c => ({ id: String(c.id), codice: c.codice, descrizione: c.descrizione, idCategoria: c.id })),
    ...(senzaCategoria.length ? [{ id: 'none', codice: 'Senza Categoria', descrizione: 'Prodotti senza categoria assegnata', idCategoria: null }] : []),
  ];

  const countClass = rows.length >= LIMIT ? 'text-danger fw-semibold'
    : rows.length >= LIMIT * 0.9 ? 'text-warning fw-semibold'
    : 'text-muted';

  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
      <ul class="nav nav-pills" id="prod-tabs">
        ${tabs.map((t, i) => `<li class="nav-item"><button class="nav-link ${i === 0 ? 'active' : ''}" data-bs-toggle="pill" data-bs-target="#prod-cat-${t.id}" data-cat-id="${t.idCategoria ?? ''}" type="button" title="${t.descrizione}">${t.codice}</button></li>`).join('')}
      </ul>
      <span class="small ${countClass}" title="Limite massimo di prodotti recuperabili">${rows.length.toLocaleString('it-IT')}/${LIMIT.toLocaleString('it-IT')} prodotti</span>
    </div>
    <div class="tab-content">
      ${tabs.map((t, i) => `<div class="tab-pane fade ${i === 0 ? 'show active' : ''}" id="prod-cat-${t.id}"></div>`).join('')}
    </div>`;

  let activeCatId = tabs[0]?.idCategoria ?? null;
  container.querySelectorAll('#prod-tabs button').forEach(btn => {
    btn.addEventListener('shown.bs.tab', () => {
      const v = btn.dataset.catId;
      activeCatId = v ? Number(v) : null;
    });
  });

  const fields = [
    { name: 'codice_prodotto',       label: 'Codice Prodotto',  type: 'text',   required: true, col: 4 },
    { name: 'descrizione',           label: 'Descrizione',      type: 'text',   required: true, col: 8 },
    { name: 'id_categoria',          label: 'Categoria',        type: 'select', col: 4,
      options: categorieOrdinate.map(c => ({ value: c.id, label: c.codice })) },
    { name: 'norma',                 label: 'Norma EN',         type: 'text',   col: 4, placeholder: 'EN 10025' },
    { name: 'qualita_acciaio',       label: 'Qualità',          type: 'select', col: 4,
      options: ['','S235JRH','S275JRH','S275J0H','S275J2H','S355J0H','S280GD+Z','N.a.','Libero'].map(v => ({ value: v, label: v || '— non specificata —' })) },
    { name: 'spessore_mm',           label: 'Spessore (mm)',    type: 'decimal', col: 3 },
    { name: 'larghezza_mm',          label: 'Larghezza (mm)',   type: 'decimal', col: 3 },
    { name: 'lunghezza_mm',          label: 'Lunghezza (mm)',   type: 'decimal', col: 3, value: 6000 },
    { name: 'diametro_mm',           label: 'Diametro (mm)',    type: 'decimal', col: 3 },
    { name: 'unita_misura_acquisto', label: 'U.M. Acquisto',    type: 'select', required: true, col: 4,
      options: ['kg','t','m','pz','mq'].map(v => ({ value: v, label: v })) },
    { name: 'peso_unitario_kg',      label: 'Peso unit. (kg)',  type: 'decimal', col: 4 },
    { name: 'categoria_trave',       label: 'Cat. Trave',       type: 'select',  col: 4,
      options: [{value:'',label:'—'}].concat([0,1,2,3,4,5].map(n => ({ value: n, label: `Cat ${n}` }))) },
    { name: 'attivo',                label: 'Attivo',           type: 'checkbox', col: 4, value: true },
    { name: 'note',                  label: 'Note',             type: 'textarea', col: 12 },
  ];

  tabs.forEach(t => {
    const pane = container.querySelector(`#prod-cat-${t.id}`);
    const catRows = rows.filter(r => t.idCategoria == null ? r.id_categoria == null : r.id_categoria === t.idCategoria);
    pane.innerHTML = `
      <div class="table-card">
        ${t.idCategoria == null ? `<div class="alert alert-warning small mb-0 rounded-0 border-0">
          <i class="bi bi-exclamation-triangle me-1"></i>Questi prodotti non hanno una categoria assegnata.
          Modificali singolarmente per assegnarne una, oppure ri-importa il CSV con la colonna <code>categoria_codice</code> popolata.
        </div>` : ''}
        <div class="table-toolbar">
          <span class="text-muted small">${catRows.length} prodotti</span>
          <button class="btn btn-outline-success btn-sm ms-auto" data-action="export-cat" title="Scarica i prodotti mostrati in CSV"><i class="bi bi-file-earmark-arrow-down me-1"></i>Scarica</button>
        </div>
        <div id="tbl-body"></div>
      </div>`;
    const colsDef = t.codice === 'TRAVI' ? COLUMNS_TRAVI : COLUMNS;
    renderTable(pane.querySelector('#tbl-body'), {
      columns: colsDef, rows: catRows,
      actions: { onEdit: openEdit, onDelete: doDelete },
    });
    pane.querySelector('[data-action="export-cat"]').onclick = () =>
      downloadCsv(`prodotti_${t.codice.replace(/\s+/g, '_')}.csv`, colsDef, catRows);
  });

  document.getElementById('btn-new').onclick = () => showFormModal({
    title: 'Nuovo Prodotto', fields, values: activeCatId ? { id_categoria: activeCatId } : {},
    onSave: async data => { await api.prodotti.create(data); toast('Prodotto creato'); location.reload(); },
  });

  document.getElementById('btn-import').onclick = () => showImportModal({
    title: 'Importa Prodotti da CSV/XLSX',
    templateUrl: api.prodotti.templateUrl,
    importFn: file => api.prodotti.importFile(file),
    onSuccess: () => location.reload(),
    helpHtml: `<p class="small text-muted">
      Campi obbligatori: <code>codice_prodotto</code>, <code>descrizione</code>, <code>unita_misura_acquisto</code>.<br>
      Colonne opzionali riconosciute: categoria_codice (codice categoria prodotto), spessore_mm, larghezza_mm,
      lunghezza_mm, diametro_mm, norma, qualita_acciaio, peso_unitario_kg, prezzo_riferimento, attivo, note.<br>
      Per modifiche massive: usa il pulsante <strong>Esporta</strong> per scaricare i prodotti esistenti
      nello stesso formato del template, modificali e ricaricali da qui.
    </p>`,
  });

  function openEdit(id, row) {
    showFormModal({
      title: `Modifica: ${row.codice_prodotto}`, fields: fields.filter(f => f.name !== 'codice_prodotto'), values: row,
      onSave: async data => { await api.prodotti.update(id, data); toast('Prodotto aggiornato'); location.reload(); },
    });
  }

  async function doDelete(id, row) {
    await deleteWithConfirm(row.codice_prodotto, () => api.prodotti.del(id), () => location.reload());
  }
}
