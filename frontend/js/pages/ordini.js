import { api } from '../api.js';
import { fmt, toast, setHeaderActions, setTitle, qualitaBadge, QUALITA_ACCIAIO } from '../utils.js';
import { renderTable, showFormModal, deleteWithConfirm } from '../components.js';


function fmtSconto(v) {
  const n = Number(v);
  if (!n) return '<span class="text-muted">—</span>';
  return `<small class="${n < 0 ? 'text-success' : 'text-warning'}">${n > 0 ? '+' : ''}${n}%</small>`;
}

// ---------------------------------------------------------------------------
// LIST
// ---------------------------------------------------------------------------
const LIST_COLS = [
  { key: 'codice_ordine',         label: 'Codice',          fmt: v => `<span class="fw-semibold">${v}</span>` },
  { key: '_fornitore',            label: 'Fornitore' },
  { key: 'riferimento_fornitore', label: 'Rif. Fornitore' },
  { key: 'data_ordine',           label: 'Data',            fmt: v => fmt(v, 'date') },
  { key: 'data_consegna_prevista',label: 'Cons. Prevista',  fmt: v => fmt(v, 'date') },
  { key: 'stato',                 label: 'Stato',           fmt: v => fmt(v, 'stato') },
  { key: 'incoterm',              label: 'Incoterm' },
];

let _righeViewActive = false;

const STATI_ORDINE = ['confermato','parzialmente_consegnato','completato','annullato'];

// Categorie per cui la lunghezza è caratteristica determinante del prodotto
const CAT_CON_LUNGHEZZA = ['TRAVI', 'MERCANTILE', 'TUBOLARE'];

// Mostra/nasconde il selettore Zincheria in base al flag "Servizio di zincatura"
function toggleZincheria(body) {
  const chk = body.querySelector('[name="zincatura"]');
  const sel = body.querySelector('[name="id_zincheria"]');
  if (!chk || !sel) return;
  const col = sel.parentElement;
  const apply = () => {
    col.style.display = chk.checked ? '' : 'none';
    if (!chk.checked) sel.value = '';
  };
  chk.addEventListener('change', apply);
  apply();
}

export async function renderOrdini(container, id) {
  if (id) return renderDetail(container, id);

  const [rows, fornitori, vettori] = await Promise.all([
    api.ordini.list('?limit=500'), api.fornitori.list('?limit=500'), api.vettori.list(),
  ]);
  // fornMap da tutti i fornitori (per la visualizzazione), ma gli ordini di
  // acciaio si fanno solo alle acciaierie → il dropdown propone solo quelle.
  const fornMap = Object.fromEntries(fornitori.map(f => [f.id, f.ragione_sociale]));
  const acciaierie = fornitori.filter(f => f.tipo === 'acciaieria');
  const zincherie  = fornitori.filter(f => f.tipo === 'zincheria');
  rows.forEach(r => r._fornitore = fornMap[r.id_fornitore] || '—');

  const vettoriOptions = [{ value: '', label: '— nessuno —' }, ...vettori.filter(v => v.attivo).map(v => ({ value: v.id, label: v.ragione_sociale }))];
  const zincherieOptions = [{ value: '', label: '— seleziona zincheria —' }, ...zincherie.filter(z => z.attivo).map(z => ({ value: z.id, label: z.ragione_sociale }))];

  const headerFields = [
    { name: 'id_fornitore',           label: 'Fornitore',         type: 'select', required: true, col: 6,
      options: acciaierie.map(f => ({ value: f.id, label: f.ragione_sociale })) },
    { name: 'data_ordine',            label: 'Data Ordine',       type: 'date',   required: true, col: 3 },
    { name: 'data_consegna_prevista', label: 'Cons. Prevista',    type: 'date',   col: 3 },
    { name: 'riferimento_fornitore',  label: 'Rif. Fornitore',    type: 'text',   col: 4 },
    { name: 'incoterm',               label: 'Incoterm',          type: 'select', col: 4,
      options: ['EXW','FOB','CIF','Reso','Partenza'].map(v=>({value:v,label:v})) },
    { name: 'valuta',                 label: 'Valuta',            type: 'text',   col: 2, value: 'EUR' },
    { name: 'stato',                  label: 'Stato',             type: 'select', col: 3,
      options: STATI_ORDINE.map(v => ({ value: v, label: v.replace(/_/g,' ') })) },
    { name: 'id_magazzino_origine',   label: 'Origine (magazzino fornitore)', type: 'select', col: 4,
      options: [{ value: '', label: '— seleziona prima il fornitore —' }] },
    { name: 'comune_destinazione',    label: 'Destinazione (comune)',          type: 'text',   col: 4, value: 'Belpasso (CT)' },
    { name: 'id_vettore',             label: 'Vettore',           type: 'select', col: 4,
      options: vettoriOptions },
    { name: 'zincatura',              label: 'Servizio di zincatura', type: 'checkbox', col: 3, value: false },
    { name: 'id_zincheria',           label: 'Zincheria',         type: 'select', col: 5,
      options: zincherieOptions },
    { name: 'luogo_consegna',         label: 'Luogo Consegna',    type: 'text',   col: 12 },
    { name: 'note',                   label: 'Note',              type: 'textarea', col: 12 },
  ];

  function renderHeader() {
    setHeaderActions(`
      <div class="btn-group btn-group-sm me-2" role="group">
        <button class="btn ${!_righeViewActive ? 'btn-secondary' : 'btn-outline-secondary'}" id="btn-view-ordini">
          <i class="bi bi-list-ul me-1"></i>Ordini
        </button>
        <button class="btn ${_righeViewActive ? 'btn-secondary' : 'btn-outline-secondary'}" id="btn-view-righe">
          <i class="bi bi-table me-1"></i>Righe
        </button>
      </div>
      <button class="btn btn-primary btn-sm" id="btn-new"><i class="bi bi-plus-lg me-1"></i>Nuovo Ordine</button>`);
    document.getElementById('btn-view-ordini').onclick = () => { _righeViewActive = false; renderOrdini(container); };
    document.getElementById('btn-view-righe').onclick  = () => { _righeViewActive = true;  renderOrdini(container); };
    document.getElementById('btn-new').onclick = () => showFormModal({
      title: 'Nuovo Ordine di Acquisto', fields: headerFields, values: { stato: 'confermato' },
      afterShow: body => {
        const fornSel = body.querySelector('[name="id_fornitore"]');
        const origSel = body.querySelector('[name="id_magazzino_origine"]');
        fornSel.addEventListener('change', async e => {
          const idForn = parseInt(e.target.value) || null;
          origSel.innerHTML = '<option value="">— carico... —</option>';
          origSel.disabled = true;
          if (!idForn) { origSel.innerHTML = '<option value="">— seleziona prima il fornitore —</option>'; return; }
          const mags = await api.magazzini.listByFornitore(idForn);
          const attivi = mags.filter(m => m.attivo);
          origSel.innerHTML = '<option value="">— nessuna —</option>' +
            attivi.map(m => `<option value="${m.id}">${m.comune}</option>`).join('');
          origSel.disabled = false;
        });
        toggleZincheria(body);
      },
      onSave: async data => {
        const ord = await api.ordini.create(data);
        toast('Ordine creato: ' + ord.codice_ordine);
        window.location.hash = `#/ordini/${ord.id}`;
      },
    });
  }

  if (_righeViewActive) {
    renderHeader();
    return renderRigheView(container, fornitori, fornMap);
  }

  renderHeader();

  const wrap = document.createElement('div');
  wrap.className = 'table-card';
  wrap.innerHTML = `
    <div class="table-toolbar">
      <span class="text-muted small">${rows.length} ordini</span>
    </div>
    <div id="tbl-body"></div>`;
  container.innerHTML = '';
  container.appendChild(wrap);

  function refresh() {
    renderTable(wrap.querySelector('#tbl-body'), {
      columns: LIST_COLS, rows,
      defaultSort: { key: 'data_ordine', dir: 'desc' },
      actions: {
        onDetail: id => { window.location.hash = `#/ordini/${id}`; },
        onEdit: openEdit,
        onDelete: doDelete,
      },
    });
  }

  function openEdit(id, row) {
    showFormModal({
      title: `Modifica: ${row.codice_ordine}`, fields: headerFields.slice(1), values: row,
      onSave: async data => { await api.ordini.update(id, data); toast('Ordine aggiornato'); location.reload(); },
    });
  }

  async function doDelete(id, row) {
    await deleteWithConfirm(row.codice_ordine, () => api.ordini.del(id), () => location.reload());
  }

  refresh();
}

// ---------------------------------------------------------------------------
// RIGHE VIEW (flat view across all orders)
// ---------------------------------------------------------------------------
async function renderRigheView(container, fornitori, fornMap) {
  const righe = await api.ordini.listAllRighe();

  // Augment rows with computed + display fields
  const rows = righe.map(r => {
    const residuo = Number(r.quantita_ordinata) - Number(r.quantita_consegnata);
    const pct     = Number(r.quantita_ordinata) > 0
      ? Math.round(Number(r.quantita_consegnata) / Number(r.quantita_ordinata) * 100) : 0;
    const barColor = pct >= 100 ? 'bg-success' : pct > 0 ? 'bg-warning' : 'bg-secondary';
    return {
      ...r,
      _fornitore: fornMap[r.id_fornitore] || '—',
      _prodotto:  r.codice_prodotto
        ? (r.descrizione_prodotto || r.codice_prodotto)
        : (r.descrizione_libera || '—'),
      _prodottoCodice: r.codice_prodotto && r.descrizione_prodotto ? r.codice_prodotto : null,
      _residuo:   residuo,
      _avanz: `<div class="progress" style="height:6px;min-width:60px" title="${pct}%">
                 <div class="progress-bar ${barColor}" style="width:${Math.min(pct,100)}%"></div>
               </div>`,
    };
  });

  const columns = [
    { key: 'codice_ordine',         label: 'Ordine',
      fmt: (v, r) => `<a href="#/ordini/${r.id_ordine}" class="fw-semibold text-decoration-none">${v}</a>` },
    { key: 'riferimento_fornitore', label: 'Rif. Forn.' },
    { key: 'data_ordine',           label: 'Data Ordine', fmt: v => fmt(v, 'date') },
    { key: '_fornitore',            label: 'Fornitore' },
    { key: '_prodotto',             label: 'Prodotto',
      fmt: (v, r) => r._prodottoCodice ? `${v}<br><small class="text-muted">${r._prodottoCodice}</small>` : v },
    { key: 'qualita_acciaio',       label: 'Qualità',  fmt: v => qualitaBadge(v) },
    { key: 'lunghezza_mm',          label: 'Lung. mm', class: 'text-end', fmt: v => v ? Number(v).toLocaleString('it-IT') : '<span class="text-muted">—</span>' },
    { key: 'quantita_ordinata',     label: 'Ord.',     class: 'text-end', fmt: v => fmt(v, 'number') },
    { key: 'unita_misura',          label: 'U.M.',     fmt: v => `<code>${v}</code>` },
    { key: 'quantita_consegnata',   label: 'Arr.',     class: 'text-end',
      fmt: v => `<span class="text-info">${fmt(v, 'number')}</span>` },
    { key: '_residuo',              label: 'Residuo',  class: 'text-end',
      fmt: (v, r) => `<span class="${Number(v) > 0 ? 'fw-semibold' : 'text-muted'}">${fmt(v, 'number')}</span>` },
    { key: '_avanz',                label: 'Avanz.', sortable: false, filterable: false },
    { key: 'stato_riga',            label: 'Stato',    fmt: v => fmt(v, 'stato') },
  ];

  const wrap = document.createElement('div');
  wrap.className = 'table-card';
  wrap.innerHTML = `
    <div class="table-toolbar">
      <div class="form-check form-switch mb-0">
        <input class="form-check-input" type="checkbox" role="switch" id="flt-in-arrivo">
        <label class="form-check-label small" for="flt-in-arrivo">In Arrivo <span class="text-muted">(solo righe aperte o parziali)</span></label>
      </div>
      <span class="ms-auto text-muted small" data-count>${rows.length} righe</span>
    </div>
    <div id="rq-body"></div>`;
  container.innerHTML = '';
  container.appendChild(wrap);

  const IN_ARRIVO = ['aperta', 'parziale'];
  function refresh() {
    const inArrivo = wrap.querySelector('#flt-in-arrivo').checked;
    const shown = inArrivo ? rows.filter(r => IN_ARRIVO.includes(r.stato_riga)) : rows;
    wrap.querySelector('[data-count]').textContent = `${shown.length} righe`;
    renderTable(wrap.querySelector('#rq-body'), {
      columns,
      rows: shown,
      defaultSort: { key: 'data_ordine', dir: 'desc' },
      actions: {
        onDetail: (id, row) => { window.location.hash = `#/ordini/${row.id_ordine}`; },
      },
      emptyMsg: 'Nessuna riga ordine trovata',
    });
  }

  wrap.querySelector('#flt-in-arrivo').addEventListener('change', refresh);
  refresh();
}

// ---------------------------------------------------------------------------
// DETAIL
// ---------------------------------------------------------------------------
async function renderDetail(container, id) {
  const ord = await api.ordini.get(id);
  const [prodotti, conversioni, categorie, vettori, magFornitore, zincherie, zincVoci] = await Promise.all([
    api.prodotti.list('?limit=10000'), api.conversioni.list('?limit=10000'),
    api.categorie.list(), api.vettori.list(),
    api.magazzini.listByFornitore(ord.id_fornitore),
    api.fornitori.list('?tipo=zincheria&limit=500'),
    ord.zincatura && ord.id_zincheria
      ? api.listinoServizi.list(`?id_fornitore=${ord.id_zincheria}&limit=500`)
      : Promise.resolve([]),
  ]);
  const catById = Object.fromEntries(categorie.map(c => [c.id, c]));

  setTitle(`Ordine: ${ord.codice_ordine}`);
  setHeaderActions(`
    <a href="#/ordini" class="btn btn-sm btn-outline-secondary me-2"><i class="bi bi-arrow-left me-1"></i>Lista</a>
    <button class="btn btn-sm btn-outline-primary me-2" id="btn-edit-header"><i class="bi bi-pencil me-1"></i>Modifica Testata</button>
    <button class="btn btn-sm btn-primary" id="btn-add-riga"><i class="bi bi-plus-lg me-1"></i>Aggiungi Riga</button>`);

  container.innerHTML = headerCard(ord);

  // Prepara righe con campi calcolati
  const prodMap = Object.fromEntries(prodotti.map(p => [p.id, { codice: p.codice_prodotto, desc: p.descrizione }]));
  const detailRows = ord.righe.map(r => {
    const s1 = Number(r.sconto_percentuale   || 0);
    const s2 = Number(r.sconto_2_percentuale || 0);
    const s3 = Number(r.sconto_3_percentuale || 0);
    const s4 = Number(r.sconto_4_percentuale || 0);
    const prod = r.id_prodotto ? prodMap[r.id_prodotto] : null;
    const zinc = r.prezzo_zincatura != null ? Number(r.prezzo_zincatura) : 0;
    const netMat = Number(r.prezzo_unitario) * (1+s1/100) * (1+s2/100) * (1+s3/100) * (1+s4/100);
    return {
      ...r,
      _prodotto:      prod ? (prod.desc || prod.codice) : (r.descrizione_libera || '—'),
      _prodottoCodice: prod && prod.desc && prod.codice ? prod.codice : null,
      _s1: s1, _s2: s2, _s3: s3, _s4: s4,
      _zinc: zinc || null,
      _prezzoNetto: netMat + zinc,
    };
  });

  const DETAIL_COLS = [
    { key: 'numero_riga',         label: '#',          class: 'text-center' },
    { key: '_prodotto',           label: 'Prodotto',
      fmt: (v, r) => r._prodottoCodice ? `${v}<br><small class="text-muted">${r._prodottoCodice}</small>` : v },
    { key: 'qualita_acciaio',     label: 'Qualità',    fmt: v => qualitaBadge(v) },
    { key: 'lunghezza_mm',        label: 'Lung. mm',   class: 'text-end',
      fmt: v => v ? Number(v).toLocaleString('it-IT') : '<span class="text-muted">—</span>' },
    { key: 'quantita_ordinata',   label: 'Q.tà Ord.',  class: 'text-end', fmt: v => fmt(v, 'number') },
    { key: 'unita_misura',        label: 'U.M.',       fmt: v => `<code>${v}</code>` },
    { key: 'prezzo_unitario',     label: 'Listino',    class: 'text-end', fmt: v => fmt(v, 'number') },
    { key: '_s1', label: 'Sc.1',  class: 'text-end', filterable: false, fmt: v => fmtSconto(v) },
    { key: '_s2', label: 'Sc.2',  class: 'text-end', filterable: false, fmt: v => fmtSconto(v) },
    { key: '_s3', label: 'Sc.3',  class: 'text-end', filterable: false, fmt: v => fmtSconto(v) },
    { key: '_s4', label: 'Sc.4',  class: 'text-end', filterable: false, fmt: v => fmtSconto(v) },
    { key: '_zinc', label: 'Zinc.', class: 'text-end', filterable: false,
      fmt: v => v ? `<span class="text-primary">+${fmt(v, 'number')}</span>` : '<span class="text-muted">—</span>' },
    { key: '_prezzoNetto',        label: 'P.Netto',    class: 'text-end', filterable: false,
      fmt: v => `<strong>${fmt(v, 'number')}</strong>` },
    { key: 'importo_riga',        label: 'Importo',    class: 'text-end', fmt: v => fmt(v, 'currency') },
    { key: 'quantita_consegnata', label: 'Consegnato', class: 'text-end',
      fmt: v => `<span class="text-info">${fmt(v, 'number')}</span>` },
    { key: 'quantita_fatturata',  label: 'Fatturato',  class: 'text-end',
      fmt: v => `<span class="text-success">${fmt(v, 'number')}</span>` },
    { key: 'stato_riga', label: 'Stato',
      fmt: (v, r) => `${fmt(v, 'stato')} <button class="btn btn-link btn-sm p-0 ms-1 text-muted" data-riga-stato="${r.id}" title="Cambia stato"><i class="bi bi-arrow-repeat"></i></button>` },
  ];

  const righeWrap = document.createElement('div');
  righeWrap.className = 'table-card';
  righeWrap.innerHTML = `<div class="table-toolbar fw-semibold small"><i class="bi bi-list-ul me-2"></i>Righe Ordine</div><div id="righe-tbl"></div>`;
  container.appendChild(righeWrap);

  const cols = ord.zincatura ? DETAIL_COLS : DETAIL_COLS.filter(c => c.key !== '_zinc');
  renderTable(righeWrap.querySelector('#righe-tbl'), {
    columns: cols,
    rows: detailRows,
    actions: {
      onEdit:   (rid, row) => openRigaModal(rid, row, id, ord, prodotti, conversioni, catById, container, zincVoci),
      onDelete: (rid)      => deleteWithConfirm(`riga #${rid}`, () => api.ordini.righe.del(id, rid), () => renderDetail(container, id)),
    },
    emptyMsg: 'Nessuna riga',
  });

  // Edit header
  document.getElementById('btn-edit-header').onclick = () => {
    const magOpts = [{ value: '', label: '— nessuna —' }, ...magFornitore.filter(m => m.attivo).map(m => ({ value: m.id, label: m.comune }))];
    const vettOpts = [{ value: '', label: '— nessuno —' }, ...vettori.filter(v => v.attivo).map(v => ({ value: v.id, label: v.ragione_sociale }))];
    const zincOpts = [{ value: '', label: '— seleziona zincheria —' }, ...zincherie.filter(z => z.attivo).map(z => ({ value: z.id, label: z.ragione_sociale }))];
    const fields = [
      { name: 'stato',                  label: 'Stato',          type: 'select', col: 3,
        options: STATI_ORDINE.map(v => ({ value: v, label: v.replace(/_/g,' ') })) },
      { name: 'data_consegna_prevista', label: 'Cons. Prevista', type: 'date',   col: 3 },
      { name: 'riferimento_fornitore',  label: 'Rif. Fornitore', type: 'text',   col: 3 },
      { name: 'incoterm',               label: 'Incoterm',       type: 'text',   col: 3 },
      { name: 'id_magazzino_origine',   label: 'Origine',        type: 'select', col: 4, options: magOpts },
      { name: 'comune_destinazione',    label: 'Destinazione',   type: 'text',   col: 4 },
      { name: 'id_vettore',             label: 'Vettore',        type: 'select', col: 4, options: vettOpts },
      { name: 'zincatura',              label: 'Servizio di zincatura', type: 'checkbox', col: 3, value: ord.zincatura },
      { name: 'id_zincheria',           label: 'Zincheria',      type: 'select', col: 5, options: zincOpts },
      { name: 'luogo_consegna',         label: 'Luogo Consegna', type: 'text',   col: 12 },
      { name: 'note',                   label: 'Note',           type: 'textarea', col: 12 },
    ];
    showFormModal({
      title: 'Modifica Testata Ordine', fields, values: ord,
      afterShow: body => toggleZincheria(body),
      onSave: async data => { await api.ordini.update(id, data); toast('Ordine aggiornato'); renderDetail(container, id); },
    });
  };

  // Add riga
  document.getElementById('btn-add-riga').onclick = () => openRigaModal(null, null, id, ord, prodotti, conversioni, catById, container, zincVoci);

  // Stato via event delegation — sopravvive ai re-render di sort/filtro
  const STATI_RIGA = ['aperta','parziale','completa','annullata'];
  righeWrap.addEventListener('click', e => {
    const btn = e.target.closest('[data-riga-stato]');
    if (!btn) return;
    const rid = Number(btn.dataset.rigaStato);
    const riga = ord.righe.find(r => r.id === rid);
    showFormModal({
      title: `Stato Riga #${riga.numero_riga}`,
      fields: [{ name: 'stato_riga', label: 'Stato', type: 'select', required: true, col: 12,
        options: STATI_RIGA.map(s => ({ value: s, label: s })) }],
      values: { stato_riga: riga.stato_riga },
      onSave: async data => {
        await api.ordini.righe.update(id, rid, { stato_riga: data.stato_riga });
        toast('Stato aggiornato');
        renderDetail(container, id);
      },
    });
  });
}

function headerCard(ord) {
  const dl = (label, value, col = 3) => `
    <div class="col-md-${col}">
      <div class="detail-label">${label}</div>
      <div class="detail-value">${value || '<span class="text-muted">—</span>'}</div>
    </div>`;
  return `
  <div class="detail-header-card">
    <div class="row g-3">
      ${dl('Codice', `<strong>${ord.codice_ordine}</strong>`)}
      ${dl('Stato', fmt(ord.stato, 'stato'))}
      ${dl('Data Ordine', fmt(ord.data_ordine, 'date'))}
      ${dl('Cons. Prevista', fmt(ord.data_consegna_prevista, 'date'))}
      ${dl('Rif. Fornitore', ord.riferimento_fornitore, 3)}
      ${dl('Incoterm', ord.incoterm, 2)}
      ${dl('Valuta', ord.valuta, 1)}
      ${dl('Origine', ord.comune_origine, 3)}
      ${dl('Destinazione', ord.comune_destinazione, 3)}
      ${dl('Vettore', ord.nome_vettore, 3)}
      ${ord.zincatura ? dl('Zincatura', `<span class="badge bg-primary">${ord.nome_zincheria || 'sì'}</span>`, 3) : ''}
      ${dl('Luogo Consegna', ord.luogo_consegna, 3)}
      ${ord.note ? dl('Note', ord.note, 12) : ''}
    </div>
  </div>`;
}


function zincVoceLabel(v) {
  let range = '';
  if (v.parametro_rif) {
    if (v.parametro_min != null && v.parametro_max != null) range = ` [${v.parametro_min}–${v.parametro_max}]`;
    else if (v.parametro_max != null) range = ` [≤${v.parametro_max}]`;
    else if (v.parametro_min != null) range = ` [≥${v.parametro_min}]`;
  }
  const prezzo = Number(v.prezzo_unitario).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return `${v.descrizione_voce || 'voce'}${range} — ${prezzo} €/${v.unita_misura_prezzo}`;
}

function openRigaModal(rigaId, riga, ordineId, ord, prodotti, conversioni, catById, container, zincVoci = []) {
  const nextNum = rigaId ? riga.numero_riga : (Math.max(0, ...ord.righe.map(r => r.numero_riga)) + 1);
  const prodByCode = Object.fromEntries(prodotti.map(p => [p.codice_prodotto.toUpperCase(), p]));
  const prodById   = Object.fromEntries(prodotti.map(p => [p.id, p]));
  const zincById   = Object.fromEntries(zincVoci.map(v => [v.id, v]));

  // Map: prodotto_id -> { da_unita: fattore_conversione } — fallback per prodotti senza peso_unitario_kg
  const convByProd = {};
  conversioni.forEach(c => {
    if (c.id_prodotto) {
      if (!convByProd[c.id_prodotto]) convByProd[c.id_prodotto] = {};
      convByProd[c.id_prodotto][c.da_unita] = Number(c.fattore_conversione);
    }
  });
  const codiceIniziale = rigaId && riga.id_prodotto ? (prodById[riga.id_prodotto]?.codice_prodotto ?? '') : '';

  const fields = [
    { name: 'numero_riga',        label: 'N° Riga',              type: 'number',  required: true, col: 2, value: nextNum },
    { name: 'codice_prodotto',    label: 'Codice Prodotto',       type: 'text',    col: 5, placeholder: 'es. Q151' },
    { name: 'id_prodotto',        type: 'hidden' },
    { name: 'descrizione_libera', label: 'Descrizione libera (se fuori catalogo)', type: 'text', col: 5 },
    { name: 'quantita_ordinata',  label: 'Q.tà Ordinata',         type: 'decimal', required: true, col: 3 },
    { name: 'unita_misura',       label: 'U.M.',                  type: 'select',  required: true, col: 2,
      options: ['kg','t','m','pz','mq'].map(v => ({ value: v, label: v })) },
    { name: 'quantita_kg',        label: 'Q.tà (kg)',             type: 'decimal', col: 3 },
    { name: 'prezzo_unitario',      label: 'Prezzo Unitario',    type: 'decimal', required: true, col: 4, step: '0.000001' },
    { name: 'valuta',               label: 'Valuta',             type: 'text',    col: 2, value: 'EUR' },
    { name: 'sconto_percentuale',   label: 'Sc.1% (−=sconto)',   type: 'decimal', col: 3, value: 0, step: '0.01', placeholder: 'es. -27' },
    { name: 'sconto_2_percentuale', label: 'Sc.2%',              type: 'decimal', col: 3, value: 0, step: '0.01', placeholder: 'es. +5' },
    { name: 'sconto_3_percentuale', label: 'Sc.3%',              type: 'decimal', col: 3, value: 0, step: '0.01', placeholder: 'es. -1' },
    { name: 'sconto_4_percentuale', label: 'Sc.4%',              type: 'decimal', col: 3, value: 0, step: '0.01' },
    { name: 'qualita_acciaio',    label: 'Qualità acciaio',  type: 'select', col: 4,
      options: QUALITA_ACCIAIO.map(v => ({ value: v, label: v || '— non specificata —' })) },
    { name: 'lunghezza_mm',       label: 'Lunghezza (mm)',   type: 'decimal', col: 3, value: 6000 },
    { name: 'data_consegna_prevista', label: 'Cons. Prevista', type: 'date', col: 5 },
    { name: 'note',               label: 'Note',             type: 'textarea', col: 12 },
  ];

  // Se l'ordine prevede la zincatura, il compilatore sceglie manualmente la
  // voce di listino della zincheria (il prezzo si somma al prezzo materiale).
  if (ord.zincatura) {
    const idx = fields.findIndex(f => f.name === 'valuta');
    fields.splice(idx + 1, 0,
      { name: 'id_listino_zincatura', label: 'Voce zincatura (listino zincheria)', type: 'select', col: 6,
        options: [{ value: '', label: '— nessuna —' }, ...zincVoci.map(v => ({ value: v.id, label: zincVoceLabel(v) }))] },
      { name: 'prezzo_zincatura', type: 'hidden' },
    );
  }

  const values = { ...(riga || {}), codice_prodotto: codiceIniziale };

  showFormModal({
    title: rigaId ? `Modifica Riga #${riga.numero_riga}` : 'Aggiungi Riga',
    fields,
    values,
    afterShow: body => {
      const inputCodice   = body.querySelector('[name="codice_prodotto"]');
      const inputIdProd   = body.querySelector('[name="id_prodotto"]');
      const inputQty      = body.querySelector('[name="quantita_ordinata"]');
      const inputQtyKg    = body.querySelector('[name="quantita_kg"]');
      const inputPrezzo   = body.querySelector('[name="prezzo_unitario"]');
      const inputUm       = body.querySelector('[name="unita_misura"]');
      const inputQualita  = body.querySelector('[name="qualita_acciaio"]');
      const inputLunghezza = body.querySelector('[name="lunghezza_mm"]');

      let currentProd = null;

      function showFeedback(msg, ok) {
        body.querySelector('.prod-feedback')?.remove();
        inputCodice.classList.toggle('is-invalid', !ok);
        inputCodice.classList.toggle('is-valid', ok);
        if (!msg) return;
        const fb = document.createElement('div');
        fb.className = ok ? 'valid-feedback prod-feedback d-block text-muted small' : 'invalid-feedback prod-feedback';
        fb.textContent = msg;
        inputCodice.after(fb);
      }

      function recalcKg() {
        if (!currentProd) return;
        const qty = parseFloat(inputQty.value);
        if (isNaN(qty) || qty <= 0) return;
        const um = inputUm.value;

        // Use peso_unitario_kg from product first; fall back to conversioni_peso
        let pesoPerUm = currentProd.peso_unitario_kg ? parseFloat(currentProd.peso_unitario_kg) : null;
        if (!pesoPerUm) pesoPerUm = convByProd[currentProd.id]?.[um] ?? null;
        if (!pesoPerUm && um === 'kg') pesoPerUm = 1;
        if (!pesoPerUm && um === 't')  pesoPerUm = 1000;

        if (pesoPerUm) inputQtyKg.value = (qty * pesoPerUm).toFixed(3);
      }

      // Mostra/nasconde il campo lunghezza in base alla categoria del prodotto.
      // Rilevante solo per TRAVI, MERCANTILE, TUBOLARE (default 6000);
      // per le altre categorie (lamiera, reti, grigliati…) la lunghezza è irrilevante.
      function setLunghezza(prod, isInit) {
        if (!inputLunghezza) return;
        const catCode  = prod ? catById[prod.id_categoria]?.codice : null;
        const richiede = !prod || CAT_CON_LUNGHEZZA.includes(catCode);
        inputLunghezza.parentElement.style.display = richiede ? '' : 'none';
        if (!richiede) { inputLunghezza.value = ''; return; }
        if (!isInit && !inputLunghezza.value)
          inputLunghezza.value = (prod && prod.lunghezza_mm) ? prod.lunghezza_mm : 6000;
      }

      function applyProdotto(codice, isInit) {
        if (!codice.trim()) {
          currentProd = null;
          inputIdProd.value = '';
          showFeedback(null, false);
          setLunghezza(null, isInit);
          return;
        }
        const prod = prodByCode[codice.trim().toUpperCase()];
        if (!prod) {
          currentProd = null;
          inputIdProd.value = '';
          showFeedback(`Prodotto "${codice}" non trovato in anagrafica`, false);
          setLunghezza(null, isInit);
          return;
        }
        currentProd = prod;
        inputIdProd.value = prod.id;
        showFeedback(prod.descrizione, true);
        setLunghezza(prod, isInit);

        if (!isInit) {
          // Auto-fill U.M. if not yet set
          if (prod.unita_misura_acquisto && !inputUm.value)
            inputUm.value = prod.unita_misura_acquisto;
          // Auto-fill prezzo: Mercantile/Travi listino in €/ton → convert to €/kg
          if (prod.prezzo_riferimento) {
            const cat = catById[prod.id_categoria];
            if (cat && (cat.codice === 'MERCANTILE' || cat.codice === 'TRAVI')) {
              const base = cat.codice === 'TRAVI'
                ? Number(cat[`base_cat_${prod.categoria_trave}`] ?? 0)
                : Number(cat.parametro_prezzo ?? 0);
              inputPrezzo.value = ((Number(prod.prezzo_riferimento) + base) / 1000).toFixed(4);
            } else {
              inputPrezzo.value = prod.prezzo_riferimento;
            }
          }
          // Auto-fill qualità dal prodotto (se non già impostata)
          if (inputQualita && prod.qualita_acciaio && !inputQualita.value)
            inputQualita.value = prod.qualita_acciaio;
          recalcKg();
        }
      }

      inputCodice.addEventListener('blur',    e => applyProdotto(e.target.value, false));
      inputCodice.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyProdotto(e.target.value, false); } });
      inputQty.addEventListener('input', recalcKg);
      inputUm.addEventListener('change', recalcKg);

      // On edit: show description without overwriting existing field values
      if (codiceIniziale) applyProdotto(codiceIniziale, true);

      // Zincatura: alla scelta della voce, memorizza il prezzo (snapshot) e
      // mostra l'effetto sul prezzo materiale.
      const inputZinc       = body.querySelector('[name="id_listino_zincatura"]');
      const inputPrezzoZinc = body.querySelector('[name="prezzo_zincatura"]');
      if (inputZinc && inputPrezzoZinc) {
        const applyZinc = () => {
          const v = zincById[parseInt(inputZinc.value)];
          inputPrezzoZinc.value = v ? v.prezzo_unitario : '';
          body.querySelector('.zinc-feedback')?.remove();
          if (v) {
            const fb = document.createElement('div');
            fb.className = 'zinc-feedback text-primary small mt-1';
            fb.innerHTML = `<i class="bi bi-plus-circle me-1"></i>Zincatura +${Number(v.prezzo_unitario).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:4})} €/${v.unita_misura_prezzo} sul prezzo materiale`;
            inputZinc.after(fb);
          }
        };
        inputZinc.addEventListener('change', applyZinc);
        applyZinc();
      }

      document.getElementById('main-modal').addEventListener(
        'shown.bs.modal', () => inputCodice.focus(), { once: true }
      );
    },
    onSave: async data => {
      if (data.codice_prodotto && !data.id_prodotto)
        throw new Error(`Prodotto "${data.codice_prodotto}" non trovato — correggi il codice prima di salvare`);
      const sendData = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== ''));
      delete sendData.codice_prodotto;
      if (sendData.id_prodotto) sendData.id_prodotto = parseInt(sendData.id_prodotto);
      if (sendData.id_listino_zincatura) sendData.id_listino_zincatura = parseInt(sendData.id_listino_zincatura);
      if (rigaId) {
        await api.ordini.righe.update(ordineId, rigaId, sendData);
        toast('Riga aggiornata');
      } else {
        await api.ordini.righe.create(ordineId, sendData);
        toast('Riga aggiunta');
      }
      renderDetail(container, ordineId);
    },
  });
}
