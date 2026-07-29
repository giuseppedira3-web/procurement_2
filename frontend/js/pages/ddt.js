import { api } from '../api.js';
import { fmt, toast, setHeaderActions, setTitle, qualitaBadge } from '../utils.js';
import { renderTable, showFormModal, deleteWithConfirm } from '../components.js';

const LIST_COLS = [
  { key: 'codice_ddt',           label: 'Codice',         fmt: v => `<span class="fw-semibold">${v}</span>` },
  { key: '_fornitore',           label: 'Fornitore' },
  { key: 'numero_ddt_fornitore', label: 'N° Fornitore' },
  { key: 'data_ddt',             label: 'Data DDT',        fmt: v => fmt(v, 'date') },
  { key: 'data_ricezione',       label: 'Ricezione',       fmt: v => fmt(v, 'date') },
  { key: 'peso_netto_kg',        label: 'Peso Netto (kg)', fmt: v => fmt(v, 'number') },
  { key: 'stato',                label: 'Stato',           fmt: v => fmt(v, 'stato') },
];

const RIGHE_COLS = [
  { key: 'codice_ddt',           label: 'DDT',            fmt: v => `<span class="fw-semibold">${v}</span>` },
  { key: 'fornitore',            label: 'Fornitore' },
  { key: 'numero_ddt_fornitore', label: 'N° Forn.' },
  { key: 'data_ddt',             label: 'Data',            fmt: v => fmt(v, 'date') },
  { key: '_prodotto',            label: 'Prodotto',
    fmt: (v, r) => r._prodottoCodice ? `${v}<br><small class="text-muted">${r._prodottoCodice}</small>` : v },
  { key: 'qualita_acciaio',      label: 'Qualità',          fmt: v => qualitaBadge(v) },
  { key: 'lunghezza_mm',         label: 'Lung. mm',         class: 'text-end', fmt: v => v ? Number(v).toLocaleString('it-IT') : '<span class="text-muted">—</span>' },
  { key: 'quantita_consegnata',  label: 'Q.tà',            fmt: v => fmt(v, 'number') },
  { key: 'unita_misura',         label: 'U.M.',            fmt: v => `<code>${v}</code>` },
  { key: 'quantita_kg',          label: 'kg',              fmt: v => fmt(v, 'number') },
  { key: 'stato_ddt',            label: 'Stato DDT',       fmt: v => fmt(v, 'stato') },
  { key: '_fatturato',           label: 'Fatturato',       fmt: v => v },
];

const STATI_DDT = ['ricevuto','verificato','fatturato','contestato'];

let _righeViewActive = false;

export async function renderDdt(container, id) {
  if (id) return renderDetail(container, id);

  const [rows, fornitori, vettori] = await Promise.all([api.ddt.list(), api.fornitori.list(), api.vettori.list()]);
  const fornMap = Object.fromEntries(fornitori.map(f => [f.id, f.ragione_sociale]));
  rows.forEach(r => r._fornitore = fornMap[r.id_fornitore] || '—');

  // defined first so renderHeader closure can reference it safely
  const headerFields = () => [
    { name: 'id_fornitore',         label: 'Fornitore',        type: 'select', required: true, col: 6,
      options: fornitori.map(f => ({ value: f.id, label: f.ragione_sociale })) },
    { name: 'numero_ddt_fornitore', label: 'N° DDT Fornitore', type: 'text',   required: true, col: 3 },
    { name: 'data_ddt',             label: 'Data DDT',         type: 'date',   required: true, col: 3 },
    { name: 'data_ricezione',       label: 'Data Ricezione',   type: 'date',   col: 4 },
    { name: 'numero_colli',         label: 'N° Colli',         type: 'number', col: 2 },
    { name: 'peso_lordo_kg',        label: 'Peso Lordo (kg)',  type: 'decimal', col: 3 },
    { name: 'peso_netto_kg',        label: 'Peso Netto (kg)',  type: 'decimal', col: 3 },
    { name: 'id_vettore',           label: 'Vettore',          type: 'select', col: 6,
      options: [{ value: '', label: '— nessuno —' }, ...vettori.filter(v => v.attivo).map(v => ({ value: v.id, label: v.ragione_sociale }))] },
    { name: 'targa',                label: 'Targa',            type: 'text',   col: 3 },
    { name: 'stato',                label: 'Stato',            type: 'select', col: 3,
      options: STATI_DDT.map(v => ({ value: v, label: v })) },
    { name: 'note',                 label: 'Note',             type: 'textarea', col: 12 },
  ];

  function renderHeader() {
    setHeaderActions(`
      <div class="btn-group btn-group-sm me-2">
        <button class="btn ${!_righeViewActive ? 'btn-secondary' : 'btn-outline-secondary'}" id="btn-view-ddt"><i class="bi bi-file-earmark-text me-1"></i>Vista DDT</button>
        <button class="btn ${_righeViewActive  ? 'btn-secondary' : 'btn-outline-secondary'}" id="btn-view-righe"><i class="bi bi-list-ul me-1"></i>Vista Righe</button>
      </div>
      <button class="btn btn-primary btn-sm" id="btn-new"><i class="bi bi-plus-lg me-1"></i>Nuovo DDT</button>`);

    document.getElementById('btn-view-ddt').onclick = () => { _righeViewActive = false; renderDdt(container); };
    document.getElementById('btn-view-righe').onclick = () => { _righeViewActive = true; renderDdt(container); };
    document.getElementById('btn-new').onclick = () => showFormModal({
      title: 'Nuovo DDT', fields: headerFields(), values: { stato: 'ricevuto' },
      onSave: async data => {
        const d = await api.ddt.create(data);
        toast('DDT creato: ' + d.codice_ddt);
        window.location.hash = `#/ddt/${d.id}`;
      },
    });
  }

  if (_righeViewActive) {
    renderHeader();
    const righe = await api.ddt.listAllRighe();
    righe.forEach(r => {
      r._prodotto  = r.codice_prodotto
        ? (r.descrizione_prodotto || r.codice_prodotto)
        : (r.descrizione_libera || '—');
      r._prodottoCodice = r.codice_prodotto && r.descrizione_prodotto ? r.codice_prodotto : null;
      r._fatturato = r.fatturato
        ? '<span class="badge bg-success">sì</span>'
        : '<span class="badge bg-warning text-dark">no</span>';
    });
    const wrap2 = document.createElement('div');
    wrap2.className = 'table-card';
    wrap2.innerHTML = `<div class="table-toolbar"><span class="text-muted small">${righe.length} righe DDT</span></div><div id="tbl-righe"></div>`;
    container.innerHTML = '';
    container.appendChild(wrap2);
    renderTable(wrap2.querySelector('#tbl-righe'), {
      columns: RIGHE_COLS,
      rows: righe,
      actions: { onDetail: (_id, row) => { window.location.hash = '#/ddt/' + row.id_ddt; } },
    });
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'table-card';
  wrap.innerHTML = `<div class="table-toolbar"><span class="text-muted small">${rows.length} DDT</span></div><div id="tbl-body"></div>`;
  container.innerHTML = '';
  container.appendChild(wrap);
  renderHeader();

  renderTable(wrap.querySelector('#tbl-body'), {
    columns: LIST_COLS, rows,
    defaultSort: { key: 'data_ddt', dir: 'desc' },
    actions: {
      onDetail: id => { window.location.hash = `#/ddt/${id}`; },
      onEdit: (id, row) => showFormModal({
        title: `Modifica: ${row.codice_ddt}`, fields: headerFields().slice(1), values: row,
        onSave: async data => { await api.ddt.update(id, data); toast('DDT aggiornato'); location.reload(); },
      }),
      onDelete: async (id, row) => deleteWithConfirm(row.codice_ddt, () => api.ddt.del(id), () => location.reload()),
    },
  });
}

// ---------------------------------------------------------------------------
// DETAIL
// ---------------------------------------------------------------------------
async function renderDetail(container, id) {
  // Fetch DDT first to know the supplier for filtering orders
  const ddt = await api.ddt.get(id);

  const [prodotti, fornitore, vettori] = await Promise.all([
    api.prodotti.list('?limit=10000'),
    api.fornitori.get(ddt.id_fornitore),
    api.vettori.list(),
  ]);

  // Se il DDT è emesso da una zincheria, gli ordini collegabili sono quelli
  // delle acciaierie con zincatura associata a questa zincheria.
  // Se il DDT è di un'acciaieria, si escludono gli ordini con zincatura:
  // quelli arrivano tramite il DDT della zincheria, non dell'acciaieria.
  const ordiniList = fornitore.tipo === 'zincheria'
    ? await api.ordini.list(`?id_zincheria=${ddt.id_fornitore}&limit=500`)
    : (await api.ordini.list(`?id_fornitore=${ddt.id_fornitore}&limit=500`)).filter(o => !o.zincatura);

  const prodMap = Object.fromEntries(prodotti.map(p => [p.id, p.codice_prodotto]));

  // Fetch open orders with their lines for the cascading riga modal
  const ordiniAperti = ordiniList.filter(o => !['completato','annullato'].includes(o.stato));
  const ordiniConRighe = await Promise.all(ordiniAperti.map(o => api.ordini.get(o.id)));

  // ordiniPerDDT: selectable orders that have at least one open line
  // righePerOrdine: Map(ordine_id → [{value, label, id_prodotto}])
  const ordiniPerDDT = [];
  const righePerOrdine = new Map();
  ordiniConRighe.forEach(o => {
    const aperte = o.righe.filter(r => !['completa','annullata'].includes(r.stato_riga));
    if (!aperte.length) return;
    ordiniPerDDT.push({ value: o.id, label: o.riferimento_fornitore || o.codice_ordine });
    righePerOrdine.set(o.id, aperte.map(r => {
      const rimanenti  = (parseFloat(r.quantita_ordinata) - parseFloat(r.quantita_consegnata)).toFixed(2);
      const prodLabel  = prodMap[r.id_prodotto] || r.descrizione_libera || '—';
      const lungLabel  = r.lunghezza_mm ? ` ${Number(r.lunghezza_mm).toLocaleString('it-IT')}mm` : '';
      const qualLabel  = r.qualita_acciaio ? ` ${r.qualita_acciaio}` : '';
      return {
        value: r.id,
        label: `${prodLabel}${lungLabel}${qualLabel} — res. ${rimanenti} ${r.unita_misura}`,
        id_prodotto: r.id_prodotto || null,
      };
    }));
  });

  setTitle(`DDT: ${ddt.codice_ddt}`);
  setHeaderActions(`
    <a href="#/ddt" class="btn btn-sm btn-outline-secondary me-2"><i class="bi bi-arrow-left me-1"></i>Lista</a>
    <button class="btn btn-sm btn-outline-primary me-2" id="btn-edit-header"><i class="bi bi-pencil me-1"></i>Modifica Testata</button>
    <button class="btn btn-sm btn-primary" id="btn-add-riga"><i class="bi bi-plus-lg me-1"></i>Aggiungi Riga</button>`);

  container.innerHTML = ddtHeaderCard(ddt) + ddtRigheSection(ddt.righe, prodotti, ordiniList);

  document.getElementById('btn-edit-header').onclick = () => {
    const fields = [
      { name: 'stato',            label: 'Stato',           type: 'select', col: 3,
        options: STATI_DDT.map(v => ({ value: v, label: v })) },
      { name: 'data_ricezione',   label: 'Data Ricezione',  type: 'date',  col: 3 },
      { name: 'peso_lordo_kg',    label: 'Peso Lordo (kg)', type: 'decimal', col: 3 },
      { name: 'peso_netto_kg',    label: 'Peso Netto (kg)', type: 'decimal', col: 3 },
      { name: 'id_vettore',       label: 'Vettore',         type: 'select', col: 6,
        options: [{ value: '', label: '— nessuno —' }, ...vettori.filter(v => v.attivo).map(v => ({ value: v.id, label: v.ragione_sociale }))] },
      { name: 'targa',            label: 'Targa',           type: 'text',  col: 3 },
      { name: 'note',             label: 'Note',            type: 'textarea', col: 12 },
    ];
    showFormModal({
      title: 'Modifica Testata DDT', fields, values: ddt,
      onSave: async data => { await api.ddt.update(id, data); toast('DDT aggiornato'); renderDetail(container, id); },
    });
  };

  document.getElementById('btn-add-riga').onclick = () =>
    openRigaModal(null, null, id, ddt, prodotti, ordiniPerDDT, righePerOrdine, container);

  container.querySelectorAll('[data-riga-edit]').forEach(btn => {
    const rid = Number(btn.dataset.rigaEdit);
    const riga = ddt.righe.find(r => r.id === rid);
    btn.onclick = () => openRigaModal(rid, riga, id, ddt, prodotti, ordiniPerDDT, righePerOrdine, container);
  });
  container.querySelectorAll('[data-riga-delete]').forEach(btn => {
    const rid = Number(btn.dataset.rigaDelete);
    btn.onclick = () => deleteWithConfirm(`riga #${rid}`, () => api.ddt.righe.del(id, rid), () => renderDetail(container, id));
  });
}

function ddtHeaderCard(ddt) {
  const dl = (label, value, col = 3) => `<div class="col-md-${col}"><div class="detail-label">${label}</div><div class="detail-value">${value || '—'}</div></div>`;
  return `<div class="detail-header-card"><div class="row g-3">
    ${dl('Codice DDT', `<strong>${ddt.codice_ddt}</strong>`)}
    ${dl('Stato', fmt(ddt.stato, 'stato'))}
    ${dl('N° Fornitore', ddt.numero_ddt_fornitore)}
    ${dl('Data DDT', fmt(ddt.data_ddt, 'date'))}
    ${dl('Data Ricezione', fmt(ddt.data_ricezione, 'date'))}
    ${dl('N° Colli', ddt.numero_colli, 2)}
    ${dl('Peso Lordo', fmt(ddt.peso_lordo_kg, 'number') + ' kg', 2)}
    ${dl('Peso Netto', fmt(ddt.peso_netto_kg, 'number') + ' kg', 2)}
    ${dl('Vettore', ddt.nome_vettore, 5)}
    ${dl('Targa', ddt.targa, 2)}
    ${ddt.note ? dl('Note', ddt.note, 12) : ''}
  </div></div>`;
}

function ddtRigheSection(righe, prodotti, ordini) {
  const prodMap  = Object.fromEntries(prodotti.map(p => [p.id, { codice: p.codice_prodotto, desc: p.descrizione }]));
  const ordMap   = Object.fromEntries(ordini.map(o => [o.id, o.riferimento_fornitore || o.codice_ordine]));

  const tableRows = righe.map(r => {
    const prod = r.id_prodotto ? prodMap[r.id_prodotto] : null;
    const prodCell = prod
      ? `${prod.desc || prod.codice}${prod.desc && prod.codice ? `<br><small class="text-muted">${prod.codice}</small>` : ''}`
      : (r.descrizione_libera || '—');
    return `<tr>
    <td class="text-center">${r.numero_riga}</td>
    <td>${prodCell}</td>
    <td>${r.id_ordine ? `<a href="#/ordini/${r.id_ordine}" class="text-decoration-none">${ordMap[r.id_ordine] || r.id_ordine}</a>` : '—'}</td>
    <td>${qualitaBadge(r.qualita_acciaio)}</td>
    <td class="text-end">${r.lunghezza_mm ? Number(r.lunghezza_mm).toLocaleString('it-IT') : '<span class="text-muted">—</span>'}</td>
    <td class="text-end">${fmt(r.quantita_consegnata, 'number')}</td>
    <td><code>${r.unita_misura}</code></td>
    <td class="text-end">${fmt(r.quantita_kg, 'number')}</td>
    <td>${r.lotto || '—'}</td>
    <td>${r.numero_colata || '—'}</td>
    <td>${r.certificato_qualita || '—'}</td>
    <td>${r.fatturato ? '<span class="badge bg-success">sì</span>' : '<span class="badge bg-warning text-dark">no</span>'}</td>
    <td class="text-end">
      <button class="btn btn-outline-secondary btn-action me-1" data-riga-edit="${r.id}"><i class="bi bi-pencil"></i></button>
      <button class="btn btn-outline-danger btn-action" data-riga-delete="${r.id}"><i class="bi bi-trash"></i></button>
    </td>
  </tr>`;
  }).join('');

  return `<div class="table-card">
    <div class="table-toolbar fw-semibold small"><i class="bi bi-list-ul me-2"></i>Righe DDT</div>
    <table class="table table-hover">
      <thead><tr>
        <th class="text-center">#</th><th>Prodotto</th><th>Ordine</th><th>Qualità</th><th class="text-end">Lung. mm</th>
        <th class="text-end">Q.tà</th><th>U.M.</th><th class="text-end">kg</th>
        <th>Lotto</th><th>Colata</th><th>Certificato</th><th>Fatturato</th><th></th>
      </tr></thead>
      <tbody>${tableRows || '<tr><td colspan="13" class="text-center text-muted py-3">Nessuna riga</td></tr>'}</tbody>
    </table>
  </div>`;
}

function openRigaModal(rigaId, riga, ddtId, ddt, prodotti, ordiniPerDDT, righePerOrdine, container) {
  const nextNum = rigaId ? riga.numero_riga : (Math.max(0, ...ddt.righe.map(r => r.numero_riga)) + 1);
  const existingOrdineId = riga?.id_ordine ?? null;

  // For edit: pre-populate the riga select with lines from the existing order
  const righeOrdineIniziale = existingOrdineId ? (righePerOrdine.get(existingOrdineId) || []) : [];

  const fields = [
    { name: 'numero_riga',         label: 'N° Riga',      type: 'number',  required: true, col: 2 },
    { name: '_ordine_sel',         label: 'Ordine',        type: 'select',  col: 4,
      options: [{ value: '', label: '— seleziona ordine —' }, ...ordiniPerDDT] },
    { name: 'id_riga_ordine',      label: 'Riga ordine',   type: 'select',  col: 6,
      options: righeOrdineIniziale.length
        ? [{ value: '', label: '— seleziona riga —' }, ...righeOrdineIniziale]
        : [{ value: '', label: '— seleziona prima un ordine —' }] },
    { name: 'id_ordine',           type: 'hidden' },
    { name: 'id_prodotto',         label: 'Prodotto (se non da ordine)', type: 'select', col: 6,
      options: [{ value: '', label: '—' }, ...prodotti.map(p => ({ value: p.id, label: `${p.codice_prodotto} — ${p.descrizione}` }))] },
    { name: 'descrizione_libera',  label: 'Descrizione libera', type: 'text',    col: 6 },
    { name: 'quantita_consegnata', label: 'Q.tà Consegnata',    type: 'decimal', required: true, col: 3 },
    { name: 'unita_misura',        label: 'U.M.',               type: 'select',  required: true, col: 2,
      options: ['kg','t','m','pz','mq'].map(v => ({ value: v, label: v })) },
    { name: 'quantita_kg',         label: 'Q.tà in kg',         type: 'decimal', col: 3 },
    { name: 'lotto',               label: 'N° Lotto',           type: 'text',    col: 4 },
    { name: 'numero_colata',       label: 'N° Colata',          type: 'text',    col: 4 },
    { name: 'certificato_qualita', label: 'Certificato',        type: 'text',    col: 4, placeholder: 'EN 10204 3.1' },
    { name: 'note',                label: 'Note',               type: 'textarea', col: 12 },
  ];

  const values = { ...(riga || {}), numero_riga: nextNum, _ordine_sel: existingOrdineId ?? '' };

  showFormModal({
    title: rigaId ? `Modifica Riga #${riga.numero_riga}` : 'Aggiungi Riga DDT',
    fields,
    values,
    afterShow: body => {
      const ordSel    = body.querySelector('[name="_ordine_sel"]');
      const rigaSel   = body.querySelector('[name="id_riga_ordine"]');
      const ordInput  = body.querySelector('[name="id_ordine"]');
      const prodSel   = body.querySelector('[name="id_prodotto"]');

      function populateRighe(ordId) {
        const opzioni = ordId ? (righePerOrdine.get(ordId) || []) : [];
        rigaSel.innerHTML = opzioni.length
          ? '<option value="">— seleziona riga —</option>' +
            opzioni.map(o => `<option value="${o.value}">${o.label}</option>`).join('')
          : '<option value="">— nessuna riga aperta —</option>';
        rigaSel.disabled = !opzioni.length;
      }

      ordSel.addEventListener('change', e => {
        const ordId = parseInt(e.target.value) || null;
        ordInput.value = '';
        populateRighe(ordId);
        if (prodSel) prodSel.value = '';
      });

      rigaSel.addEventListener('change', e => {
        const rigaOrdId = parseInt(e.target.value) || null;
        const ordId = parseInt(ordSel.value) || null;
        ordInput.value = ordId || '';
        if (rigaOrdId && prodSel && !prodSel.value) {
          const found = (righePerOrdine.get(ordId) || []).find(o => o.value === rigaOrdId);
          if (found?.id_prodotto) prodSel.value = found.id_prodotto;
        }
      });

      // Pre-populate on edit
      if (existingOrdineId) {
        populateRighe(existingOrdineId);
        if (riga?.id_riga_ordine) rigaSel.value = riga.id_riga_ordine;
        ordInput.value = existingOrdineId;
      }
    },
    onSave: async data => {
      delete data._ordine_sel;
      if (data.id_riga_ordine) data.id_riga_ordine = parseInt(data.id_riga_ordine);
      if (data.id_ordine)      data.id_ordine      = parseInt(data.id_ordine);
      if (data.id_prodotto)    data.id_prodotto    = parseInt(data.id_prodotto) || null;
      if (rigaId) {
        await api.ddt.righe.update(ddtId, rigaId, data);
        toast('Riga aggiornata');
      } else {
        await api.ddt.righe.create(ddtId, data);
        toast('Riga aggiunta');
      }
      renderDetail(container, ddtId);
    },
  });
}
