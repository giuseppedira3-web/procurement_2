import { api } from '../api.js';
import { fmt, toast, setHeaderActions, setTitle } from '../utils.js';
import { renderTable, showFormModal, deleteWithConfirm } from '../components.js';

const LIST_COLS = [
  { key: 'codice_fattura',              label: 'Codice',          fmt: v => `<span class="fw-semibold">${v}</span>` },
  { key: '_fornitore',                  label: 'Fornitore' },
  { key: 'numero_fattura_fornitore',    label: 'N° Fattura' },
  { key: 'data_fattura',                label: 'Data',             fmt: v => fmt(v, 'date') },
  { key: 'data_scadenza',               label: 'Scadenza',         fmt: (v, r) => {
    if (!v) return '—';
    const d = fmt(v, 'date');
    const past = new Date(v) < new Date();
    return past && r.stato !== 'pagata' ? `<span class="text-danger fw-semibold">${d}</span>` : d;
  }},
  { key: 'totale',                      label: 'Totale',           fmt: v => fmt(v, 'currency') },
  { key: 'tipo_documento_sdi',          label: 'Tipo SDI' },
  { key: 'stato',                       label: 'Stato',            fmt: v => fmt(v, 'stato') },
];

const STATI_FT  = ['ricevuta','in_verifica','verificata','approvata','pagata','contestata','annullata'];
const TIPI_SDI  = ['TD01','TD04','TD05','TD16','TD17','TD18','TD19'];

export async function renderFatture(container, id) {
  if (id) return renderDetail(container, id);

  const [rows, fornitori] = await Promise.all([api.fatture.list(), api.fornitori.list()]);
  const fornMap = Object.fromEntries(fornitori.map(f => [f.id, f.ragione_sociale]));
  rows.forEach(r => r._fornitore = fornMap[r.id_fornitore] || '—');

  setHeaderActions(`<button class="btn btn-primary btn-sm" id="btn-new"><i class="bi bi-plus-lg me-1"></i>Nuova Fattura</button>`);

  const wrap = document.createElement('div');
  wrap.className = 'table-card';
  wrap.innerHTML = `
    <div class="table-toolbar">
      <span class="text-muted small">${rows.length} fatture</span>
    </div>
    <div id="tbl-body"></div>`;
  container.innerHTML = '';
  container.appendChild(wrap);

  function refresh() {
    renderTable(wrap.querySelector('#tbl-body'), {
      columns: LIST_COLS, rows,
      actions: {
        onDetail: id => { window.location.hash = `#/fatture/${id}`; },
        onEdit: openEdit,
        onDelete: doDelete,
      },
    });
  }

  const headerFields = () => [
    { name: 'id_fornitore',             label: 'Fornitore',           type: 'select', required: true, col: 6,
      options: fornitori.map(f => ({ value: f.id, label: f.ragione_sociale })) },
    { name: 'numero_fattura_fornitore', label: 'N° Fattura Fornitore', type: 'text',  required: true, col: 3 },
    { name: 'tipo_documento_sdi',       label: 'Tipo SDI',             type: 'select', col: 3,
      options: TIPI_SDI.map(v => ({ value: v, label: v })) },
    { name: 'data_fattura',             label: 'Data Fattura',         type: 'date',  required: true, col: 4 },
    { name: 'data_ricezione',           label: 'Data Ricezione',       type: 'date',  col: 4 },
    { name: 'data_scadenza',            label: 'Scadenza',             type: 'date',  col: 4 },
    { name: 'imponibile',               label: 'Imponibile (€)',       type: 'decimal', required: true, col: 3, step: '0.01' },
    { name: 'aliquota_iva',             label: 'Aliquota IVA (%)',     type: 'decimal', col: 2, value: 22, step: '0.5' },
    { name: 'importo_iva',              label: 'IVA (€)',              type: 'decimal', required: true, col: 3, step: '0.01' },
    { name: 'totale',                   label: 'Totale (€)',           type: 'decimal', required: true, col: 4, step: '0.01' },
    { name: 'valuta',                   label: 'Valuta',               type: 'text',  col: 2, value: 'EUR' },
    { name: 'stato',                    label: 'Stato',                type: 'select', col: 4,
      options: STATI_FT.map(v => ({ value: v, label: v.replace(/_/g,' ') })) },
    { name: 'modalita_pagamento',       label: 'Modalità Pagamento',   type: 'text',  col: 6, placeholder: 'Bonifico 60gg DF' },
    { name: 'numero_sdi',               label: 'N° SDI',               type: 'text',  col: 4 },
    { name: 'codice_destinatario',      label: 'Codice Destinatario',  type: 'text',  col: 4 },
    { name: 'note',                     label: 'Note',                 type: 'textarea', col: 12 },
  ];

  document.getElementById('btn-new').onclick = () => showFormModal({
    title: 'Nuova Fattura', fields: headerFields(), values: { stato: 'ricevuta', aliquota_iva: 22 },
    onSave: async data => {
      const ft = await api.fatture.create(data);
      toast('Fattura registrata: ' + ft.codice_fattura);
      window.location.hash = `#/fatture/${ft.id}`;
    },
  });

  function openEdit(id, row) {
    showFormModal({
      title: `Modifica: ${row.codice_fattura}`, fields: headerFields().slice(1), values: row,
      onSave: async data => { await api.fatture.update(id, data); toast('Fattura aggiornata'); location.reload(); },
    });
  }

  async function doDelete(id, row) {
    await deleteWithConfirm(row.codice_fattura, () => api.fatture.del(id), () => location.reload());
  }

  refresh();
}

// ---------------------------------------------------------------------------
// DETAIL
// ---------------------------------------------------------------------------
async function renderDetail(container, id) {
  const [fattura, prodotti, ddtList, ordiniList] = await Promise.all([
    api.fatture.get(id), api.prodotti.list(), api.ddt.list(), api.ordini.list(),
  ]);

  setTitle(`Fattura: ${fattura.codice_fattura}`);
  setHeaderActions(`
    <a href="#/fatture" class="btn btn-sm btn-outline-secondary me-2"><i class="bi bi-arrow-left me-1"></i>Lista</a>
    <button class="btn btn-sm btn-outline-primary me-2" id="btn-edit-header"><i class="bi bi-pencil me-1"></i>Modifica Testata</button>
    <button class="btn btn-sm btn-primary" id="btn-add-riga"><i class="bi bi-plus-lg me-1"></i>Aggiungi Riga</button>`);

  container.innerHTML = ftHeaderCard(fattura) + ftRigheSection(fattura.righe, prodotti, ddtList, ordiniList);

  document.getElementById('btn-edit-header').onclick = () => {
    const fields = [
      { name: 'stato',            label: 'Stato',           type: 'select', col: 4,
        options: STATI_FT.map(v => ({ value: v, label: v.replace(/_/g,' ') })) },
      { name: 'data_scadenza',    label: 'Scadenza',        type: 'date',  col: 4 },
      { name: 'data_pagamento',   label: 'Data Pagamento',  type: 'date',  col: 4 },
      { name: 'modalita_pagamento', label: 'Modalità Pagam.', type: 'text', col: 6 },
      { name: 'riferimento_riba', label: 'Rif. RiBa',       type: 'text',  col: 3 },
      { name: 'note',             label: 'Note',             type: 'textarea', col: 12 },
    ];
    showFormModal({
      title: 'Modifica Testata Fattura', fields, values: fattura,
      onSave: async data => { await api.fatture.update(id, data); toast('Fattura aggiornata'); renderDetail(container, id); },
    });
  };

  document.getElementById('btn-add-riga').onclick = () => openRigaModal(null, null, id, fattura, prodotti, ddtList, ordiniList, container);

  container.querySelectorAll('[data-riga-edit]').forEach(btn => {
    const rid = Number(btn.dataset.rigaEdit);
    const riga = fattura.righe.find(r => r.id === rid);
    btn.onclick = () => openRigaModal(rid, riga, id, fattura, prodotti, ddtList, ordiniList, container);
  });
  container.querySelectorAll('[data-riga-delete]').forEach(btn => {
    const rid = Number(btn.dataset.rigaDelete);
    btn.onclick = () => deleteWithConfirm(`riga #${rid}`, () => api.fatture.righe.del(id, rid), () => renderDetail(container, id));
  });
}

function ftHeaderCard(ft) {
  const dl = (label, value, col = 3) => `<div class="col-md-${col}"><div class="detail-label">${label}</div><div class="detail-value">${value || '—'}</div></div>`;
  const scaduta = ft.data_scadenza && new Date(ft.data_scadenza) < new Date() && ft.stato !== 'pagata';
  return `<div class="detail-header-card">
    <div class="row g-3">
      ${dl('Codice', `<strong>${ft.codice_fattura}</strong>`)}
      ${dl('Stato', fmt(ft.stato, 'stato'))}
      ${dl('N° Fornitore', ft.numero_fattura_fornitore)}
      ${dl('Tipo SDI', ft.tipo_documento_sdi)}
      ${dl('Data Fattura', fmt(ft.data_fattura, 'date'))}
      ${dl('Data Ricezione', fmt(ft.data_ricezione, 'date'))}
      ${dl('Scadenza', `<span class="${scaduta ? 'text-danger fw-semibold' : ''}">${fmt(ft.data_scadenza, 'date')}</span>`)}
      ${dl('Data Pagamento', fmt(ft.data_pagamento, 'date'))}
      ${dl('Imponibile', fmt(ft.imponibile, 'currency'), 2)}
      ${dl('IVA', fmt(ft.importo_iva, 'currency'), 2)}
      ${dl('Totale', `<strong class="fs-5">${fmt(ft.totale, 'currency')}</strong>`, 2)}
      ${dl('Modalità Pagam.', ft.modalita_pagamento, 3)}
      ${dl('N° SDI', ft.numero_sdi, 2)}
      ${ft.note ? dl('Note', ft.note, 12) : ''}
    </div>
  </div>`;
}

function ftRigheSection(righe, prodotti, ddtList, ordini) {
  const prodMap = Object.fromEntries(prodotti.map(p => [p.id, p.codice_prodotto]));
  const ddtMap  = Object.fromEntries(ddtList.map(d => [d.id, d.codice_ddt]));
  const ordMap  = Object.fromEntries(ordini.map(o => [o.id, o.codice_ordine]));

  const totale = righe.reduce((s, r) => s + Number(r.importo_riga), 0);

  const tableRows = righe.map(r => `<tr>
    <td class="text-center">${r.numero_riga}</td>
    <td>${r.id_prodotto ? prodMap[r.id_prodotto] : r.descrizione_fattura}</td>
    <td>${r.id_ddt ? `<a href="#/ddt/${r.id_ddt}" class="text-decoration-none">${ddtMap[r.id_ddt] || r.id_ddt}</a>` : '—'}</td>
    <td>${r.id_ordine ? `<a href="#/ordini/${r.id_ordine}" class="text-decoration-none">${ordMap[r.id_ordine] || r.id_ordine}</a>` : '—'}</td>
    <td class="text-end">${fmt(r.quantita, 'number')}</td>
    <td><code>${r.unita_misura}</code></td>
    <td class="text-end">${fmt(r.prezzo_unitario, 'number')}</td>
    <td class="text-end">${r.sconto_percentuale > 0 ? r.sconto_percentuale + '%' : '—'}</td>
    <td class="text-end fw-semibold">${fmt(r.importo_riga, 'currency')}</td>
    <td>${r.aliquota_iva}%</td>
    <td class="text-end">
      <button class="btn btn-outline-secondary btn-action me-1" data-riga-edit="${r.id}"><i class="bi bi-pencil"></i></button>
      <button class="btn btn-outline-danger btn-action" data-riga-delete="${r.id}"><i class="bi bi-trash"></i></button>
    </td>
  </tr>`).join('');

  return `<div class="table-card">
    <div class="table-toolbar fw-semibold small">
      <i class="bi bi-list-ul me-2"></i>Righe Fattura
      <span class="ms-auto">Totale imponibile: <strong>${fmt(totale, 'currency')}</strong></span>
    </div>
    <table class="table table-hover">
      <thead><tr>
        <th class="text-center">#</th><th>Prodotto / Descrizione</th><th>DDT</th><th>Ordine</th>
        <th class="text-end">Q.tà</th><th>U.M.</th>
        <th class="text-end">Prezzo</th><th class="text-end">Sc.%</th>
        <th class="text-end">Importo</th><th>IVA</th><th></th>
      </tr></thead>
      <tbody>${tableRows || '<tr><td colspan="11" class="text-center text-muted py-3">Nessuna riga</td></tr>'}</tbody>
    </table>
  </div>`;
}

function openRigaModal(rigaId, riga, ftId, fattura, prodotti, ddtList, ordini, container) {
  const nextNum = rigaId ? riga.numero_riga : (Math.max(0, ...fattura.righe.map(r => r.numero_riga)) + 1);
  const fields = [
    { name: 'numero_riga',        label: 'N° Riga',          type: 'number',  required: true, col: 2, value: nextNum },
    { name: 'id_prodotto',        label: 'Prodotto',          type: 'select',  col: 10,
      options: prodotti.map(p => ({ value: p.id, label: `${p.codice_prodotto} — ${p.descrizione}` })) },
    { name: 'descrizione_fattura', label: 'Descrizione (come da fattura)', type: 'text', required: true, col: 12 },
    { name: 'id_ddt',             label: 'DDT di riferimento', type: 'select', col: 6,
      options: ddtList.map(d => ({ value: d.id, label: d.codice_ddt })) },
    { name: 'id_ordine',          label: 'Ordine di riferimento', type: 'select', col: 6,
      options: ordini.map(o => ({ value: o.id, label: o.codice_ordine })) },
    { name: 'quantita',           label: 'Quantità',          type: 'decimal', required: true, col: 3 },
    { name: 'unita_misura',       label: 'U.M.',              type: 'select',  required: true, col: 2,
      options: ['kg','t','m','pz','mq'].map(v=>({value:v,label:v})) },
    { name: 'prezzo_unitario',    label: 'Prezzo Unitario',   type: 'decimal', required: true, col: 3, step: '0.000001' },
    { name: 'sconto_percentuale', label: 'Sconto %',          type: 'decimal', col: 2, value: 0, step: '0.01' },
    { name: 'importo_riga',       label: 'Importo Riga (€)',  type: 'decimal', required: true, col: 3, step: '0.01' },
    { name: 'aliquota_iva',       label: 'Aliquota IVA %',    type: 'decimal', col: 3, value: 22, step: '0.5' },
    { name: 'note',               label: 'Note',              type: 'textarea', col: 12 },
  ];

  showFormModal({
    title: rigaId ? `Modifica Riga #${riga.numero_riga}` : 'Aggiungi Riga Fattura',
    fields, values: riga || {},
    onSave: async data => {
      if (rigaId) {
        await api.fatture.righe.update(ftId, rigaId, data);
        toast('Riga aggiornata');
      } else {
        await api.fatture.righe.create(ftId, data);
        toast('Riga aggiunta');
      }
      renderDetail(container, ftId);
    },
  });
}
