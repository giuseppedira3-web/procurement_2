import { api } from '../api.js';
import { fmt, toast, downloadCsv } from '../utils.js';
import { renderTable, showFormModal, showImportModal, deleteWithConfirm } from '../components.js';

const EXPORT_BTN = '<button class="btn btn-outline-success btn-sm me-1" data-action="export" title="Scarica i dati mostrati in CSV"><i class="bi bi-file-earmark-arrow-down me-1"></i>Scarica</button>';

export async function renderListino(container) {
  const [servizi, fornitori, prodotti, categorie, categorieServizio, conversioni, vettori] = await Promise.all([
    api.listinoServizi.list('?limit=1000'),
    api.fornitori.list('?limit=1000'),
    api.prodotti.list('?limit=3000'),
    api.categorie.list(),
    api.categorieServizio.list(),
    api.conversioni.list('?limit=3000'),
    api.vettori.list(),
  ]);

  const fornMap = Object.fromEntries(fornitori.map(f => [f.id, f.ragione_sociale]));
  const catMap  = Object.fromEntries(categorie.map(c => [c.id, c]));
  // La zincatura è eseguita dalle zincherie: il listino Zincatura usa queste.
  const zincherie = fornitori.filter(f => f.tipo === 'zincheria');
  const vetMap  = Object.fromEntries(vettori.map(v => [v.id, v.ragione_sociale]));

  container.innerHTML = `
    <ul class="nav nav-tabs mb-3">
      <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#lp-tab" type="button">
        <i class="bi bi-box-seam me-1"></i>Listino Prodotti</button></li>
      <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#ls-tab" type="button">
        <i class="bi bi-truck me-1"></i>Listino Servizi</button></li>
    </ul>
    <div class="tab-content">
      <div class="tab-pane fade show active" id="lp-tab"></div>
      <div class="tab-pane fade" id="ls-tab"></div>
    </div>`;

  renderListinoProdotti(container.querySelector('#lp-tab'), { prodotti, categorie, conversioni });
  renderListinoServizi(container.querySelector('#ls-tab'), { servizi, fornitori, zincherie, vettori, categorie, categorieServizio, fornMap, catMap, vetMap });
}

// ---------------------------------------------------------------------------
// LISTINO PRODOTTI — sub-tab per categoria merceologica
// Nessuna distinzione per fornitore: i prezzi di riferimento (listino madre /
// extra) sono comuni a tutti, gli unici valori "di intestazione" (sconto per
// il tubolare, base per mercantile/travi) sono persistiti su categorie_prodotto.
// ---------------------------------------------------------------------------

function renderListinoProdotti(container, { prodotti, categorie, conversioni }) {
  if (!categorie.length) {
    container.innerHTML = '<div class="text-center py-5 text-muted">Nessuna categoria prodotto definita</div>';
    return;
  }

  container.innerHTML = `
    <ul class="nav nav-pills mb-3">
      ${categorie.map((c, i) => `<li class="nav-item"><button class="nav-link ${i === 0 ? 'active' : ''}" data-bs-toggle="pill" data-bs-target="#lp-cat-${c.id}" type="button" title="${c.descrizione}">${c.codice}</button></li>`).join('')}
    </ul>
    <div class="tab-content">
      ${categorie.map((c, i) => `<div class="tab-pane fade ${i === 0 ? 'show active' : ''}" id="lp-cat-${c.id}"></div>`).join('')}
    </div>`;

  categorie.forEach(cat => {
    const pane = container.querySelector(`#lp-cat-${cat.id}`);
    if (cat.codice === 'TUBOLARE') {
      renderTubolare(pane, { cat, prodotti, conversioni });
    } else if (cat.codice === 'TRAVI') {
      renderTravi(pane, { cat, prodotti });
    } else if (['MERCANTILE', 'RETI', 'GRIGLIATI'].includes(cat.codice)) {
      renderExtraBase(pane, { cat, prodotti });
    } else {
      pane.innerHTML = '<div class="text-center py-5 text-muted">Vista non ancora disponibile per questa categoria</div>';
    }
  });
}

// --- TUBOLARE: listino madre + sconto + tolleranza + sub-tab per qualità ----

const QUALITA_TUBOLARE = [
  { key: 'prezzo_riferimento', label: 'S235JRH - DX51D', campoPrezzoImport: 'prezzo_riferimento' },
  { key: 'prezzo_s275j0h',    label: 'S275J0H',  campoPrezzoImport: 'prezzo_s275j0h' },
  { key: 'prezzo_s355j2h',    label: 'S355J2H',  campoPrezzoImport: 'prezzo_s355j2h' },
];

function renderTubolare(container, { cat, prodotti, conversioni }) {
  const pesoMap = {};
  conversioni.forEach(c => {
    if (c.id_prodotto && c.da_unita === cat.unita_misura_base) pesoMap[c.id_prodotto] = Number(c.fattore_conversione);
  });

  const prodottiCat = prodotti.filter(p => p.id_categoria === cat.id);
  let qualitaAttiva = QUALITA_TUBOLARE[0];

  const wrap = document.createElement('div');
  wrap.className = 'table-card';
  wrap.innerHTML = `
    <div class="table-toolbar flex-wrap gap-2">
      <label class="small text-muted mb-0 me-1">Sconto</label>
      <div class="input-group input-group-sm" style="max-width:130px">
        <input type="number" step="0.01" class="form-control" data-f="sconto" value="${cat.parametro_prezzo != null ? Number(cat.parametro_prezzo) : ''}">
        <span class="input-group-text">%</span>
      </div>
      <label class="small text-muted mb-0 ms-2 me-1">Tolleranza</label>
      <div class="input-group input-group-sm" style="max-width:130px">
        <input type="number" step="0.01" min="-10" max="0" class="form-control" data-f="tolleranza"
          value="${cat.tolleranza_peso != null ? Number(cat.tolleranza_peso) : '0'}"
          title="Correzione peso teorico: tra -10% e 0%">
        <span class="input-group-text">%</span>
      </div>
      <div class="btn-group btn-group-sm ms-3" role="group" aria-label="Qualità acciaio">
        ${QUALITA_TUBOLARE.map((q, i) => `
          <input type="radio" class="btn-check" name="tub-qualita" id="tub-q-${i}" autocomplete="off" ${i === 0 ? 'checked' : ''}>
          <label class="btn btn-outline-secondary" for="tub-q-${i}">${q.label}</label>`).join('')}
      </div>
      <span class="ms-auto text-muted small me-2" data-count></span>
      ${EXPORT_BTN}
      <a href="${api.prodotti.prezzoRiferimentoTemplateUrl}" class="btn btn-outline-secondary btn-sm me-1" download title="Scarica template">
        <i class="bi bi-download me-1"></i>Template
      </a>
      <button class="btn btn-outline-primary btn-sm me-1" data-action="import"><i class="bi bi-upload me-1"></i>Importa</button>
      <button class="btn btn-primary btn-sm" data-action="new"><i class="bi bi-plus-lg me-1"></i>Nuovo Prodotto</button>
    </div>
    <div class="tbl-body"></div>`;
  container.innerHTML = '';
  container.appendChild(wrap);

  const columns = [
    { key: 'codice_prodotto', label: 'Codice' },
    { key: 'descrizione',     label: 'Descrizione' },
    { key: '_peso',           label: `Peso teorico (kg/${cat.unita_misura_base})`, fmt: v => v != null ? Number(v).toFixed(3) : '<span class="text-muted">n.d.</span>' },
    { key: '_pesoCorretto',   label: `Peso corretto (kg/${cat.unita_misura_base})`, fmt: v => v != null ? Number(v).toFixed(3) : '<span class="text-muted">n.d.</span>' },
    { key: '_listino',        label: `Listino €/${cat.unita_misura_base}`, fmt: v => fmt(v, 'currency') },
    { key: '_listinoTon',     label: 'Listino €/ton',  fmt: v => v != null ? fmt(v, 'currency') : '<span class="text-muted">—</span>' },
    { key: '_scontato',       label: `Scontato €/${cat.unita_misura_base}`, fmt: v => fmt(v, 'currency') },
    { key: '_scontatoTon',    label: 'Scontato €/ton', fmt: v => v != null ? fmt(v, 'currency') : '<span class="text-muted">—</span>' },
  ];

  function buildRows() {
    const sconto     = Number(cat.parametro_prezzo) || 0;
    const tolleranza = Number(cat.tolleranza_peso)  || 0;
    const campoPrezzo = qualitaAttiva.key;
    return prodottiCat
      .filter(p => p[campoPrezzo] != null)
      .map(p => {
        const listino    = Number(p[campoPrezzo]);
        const peso       = pesoMap[p.id] ?? null;
        const pesoCorretto = peso != null ? peso * (1 + tolleranza / 100) : null;
        const scontato   = listino * (1 + sconto / 100);
        return {
          ...p,
          _peso: peso,
          _pesoCorretto: pesoCorretto,
          _listino: listino,
          _scontato: scontato,
          _listinoTon:  pesoCorretto ? (listino   / pesoCorretto) * 1000 : null,
          _scontatoTon: pesoCorretto ? (scontato  / pesoCorretto) * 1000 : null,
        };
      });
  }

  function refresh() {
    const rows = buildRows();
    wrap.querySelector('[data-count]').textContent = `${rows.length} prodotti`;
    renderTable(wrap.querySelector('.tbl-body'), {
      columns, rows, actions: { onEdit: openEdit },
      emptyMsg: `Nessun prezzo ${qualitaAttiva.label} registrato`,
    });
  }

  // Cambio qualità
  QUALITA_TUBOLARE.forEach((q, i) => {
    wrap.querySelector(`#tub-q-${i}`).addEventListener('change', () => {
      qualitaAttiva = q;
      refresh();
    });
  });

  wrap.querySelector('[data-f="sconto"]').addEventListener('change', async e => {
    const val = e.target.value === '' ? null : Number(e.target.value);
    try {
      const updated = await api.categorie.update(cat.id, { parametro_prezzo: val ?? 0 });
      cat.parametro_prezzo = updated.parametro_prezzo;
      toast('Sconto aggiornato');
      refresh();
    } catch (err) { toast(err.message, 'danger'); }
  });

  wrap.querySelector('[data-f="tolleranza"]').addEventListener('change', async e => {
    let val = e.target.value === '' ? 0 : Number(e.target.value);
    if (val > 0) val = 0;
    if (val < -10) val = -10;
    e.target.value = val;
    try {
      const updated = await api.categorie.update(cat.id, { tolleranza_peso: val });
      cat.tolleranza_peso = updated.tolleranza_peso;
      toast('Tolleranza aggiornata');
      refresh();
    } catch (err) { toast(err.message, 'danger'); }
  });

  wrap.querySelector('[data-action="export"]').onclick = () =>
    downloadCsv(`listino_TUBOLARE_${qualitaAttiva.label}.csv`, columns, buildRows());

  wrap.querySelector('[data-action="import"]').onclick = () => showImportModal({
    title: `Importa Listino — TUBOLARE ${qualitaAttiva.label}`,
    templateUrl: api.prodotti.prezzoRiferimentoTemplateUrl,
    importFn: file => api.prodotti.importPrezzoRiferimento(cat.id, file, qualitaAttiva.campoPrezzoImport),
    onSuccess: () => location.reload(),
    helpHtml: `<p class="small text-muted">
      Una riga per prodotto. Campi: <code>codice_prodotto</code>, <code>descrizione</code>
      (obbligatoria solo per prodotti nuovi — solo per S235JRH), <code>prezzo_riferimento</code>
      — prezzo di listino in €/${cat.unita_misura_base}.<br>
      ${qualitaAttiva.key !== 'prezzo_riferimento' ? '<strong>Nota:</strong> per questa qualità il prodotto deve già esistere in anagrafica.' : ''}
    </p>`,
  });

  // Campi form per la qualità attiva
  function getFields() {
    const isDefault = qualitaAttiva.key === 'prezzo_riferimento';
    return [
      { name: 'codice_prodotto', label: 'Codice Prodotto', type: isDefault ? 'text' : 'text', required: true, col: 6 },
      { name: 'descrizione',     label: 'Descrizione',     type: 'text', required: isDefault, col: 6 },
      { name: qualitaAttiva.key, label: `Prezzo Listino ${qualitaAttiva.label} (€/${cat.unita_misura_base})`, type: 'decimal', required: true, col: 6, step: '0.0001' },
    ];
  }

  wrap.querySelector('[data-action="new"]').onclick = () => {
    const isDefault = qualitaAttiva.key === 'prezzo_riferimento';
    showFormModal({
      title: `Nuovo Prodotto — TUBOLARE ${qualitaAttiva.label}`, fields: getFields(), values: {},
      onSave: async data => {
        if (isDefault) {
          await api.prodotti.create({ ...data, id_categoria: cat.id, unita_misura_acquisto: cat.unita_misura_base });
        } else {
          const existing = prodottiCat.find(p => p.codice_prodotto === data.codice_prodotto);
          if (!existing) { toast('Prodotto non trovato in anagrafica TUBOLARE', 'danger'); return; }
          await api.prodotti.update(existing.id, { [qualitaAttiva.key]: data[qualitaAttiva.key] });
        }
        toast('Prodotto aggiornato'); location.reload();
      },
    });
  };

  function openEdit(id, row) {
    const isDefault = qualitaAttiva.key === 'prezzo_riferimento';
    const editFields = getFields().map(f => f.name === 'codice_prodotto' ? { ...f, type: 'hidden' } : f);
    showFormModal({
      title: `Modifica — ${row.codice_prodotto} (${qualitaAttiva.label})`,
      fields: editFields, values: row,
      onSave: async data => {
        const patch = { [qualitaAttiva.key]: data[qualitaAttiva.key] };
        if (isDefault) patch.descrizione = data.descrizione;
        await api.prodotti.update(id, patch);
        toast('Prodotto aggiornato'); location.reload();
      },
    });
  }

  refresh();
}

// --- TRAVI: extra per profilo + 6 basi per categoria (Cat 0 … Cat 5) --------

function renderTravi(container, { cat, prodotti }) {
  const prodottiCat = prodotti.filter(p => p.id_categoria === cat.id);
  const CATS = [0, 1, 2, 3, 4, 5];

  function baseOf(n) { return cat[`base_cat_${n}`] != null ? Number(cat[`base_cat_${n}`]) : null; }

  const wrap = document.createElement('div');
  wrap.className = 'table-card';
  wrap.innerHTML = `
    <div class="table-toolbar flex-wrap gap-2">
      ${CATS.map(n => `
        <div class="d-flex align-items-center gap-1">
          <label class="small text-muted mb-0 text-nowrap">Cat ${n}</label>
          <div class="input-group input-group-sm" style="max-width:110px">
            <input type="number" step="0.0001" class="form-control" data-base="${n}" value="${baseOf(n) ?? ''}">
            <span class="input-group-text">€/ton</span>
          </div>
        </div>`).join('')}
      <div class="d-flex align-items-center gap-1 ms-2">
        <label class="small text-muted mb-0 text-nowrap">Extra qualità</label>
        <div class="input-group input-group-sm" style="max-width:120px">
          <input type="number" step="0.01" class="form-control" data-f="extra-qualita" value="${cat.extra_qualita != null ? Number(cat.extra_qualita) : '0'}" title="Supplemento qualità superiore a S275JRH (€/ton)">
          <span class="input-group-text">€/ton</span>
        </div>
      </div>
      <span class="ms-auto text-muted small me-2">${prodottiCat.length} prodotti</span>
      ${EXPORT_BTN}
      <a href="${api.prodotti.prezzoRiferimentoTemplateUrl}" class="btn btn-outline-secondary btn-sm" download title="Template"><i class="bi bi-download me-1"></i>Template</a>
      <button class="btn btn-outline-primary btn-sm" data-action="import"><i class="bi bi-upload me-1"></i>Importa</button>
      <button class="btn btn-primary btn-sm" data-action="new"><i class="bi bi-plus-lg me-1"></i>Nuovo</button>
    </div>
    <div class="tbl-body"></div>`;
  container.innerHTML = '';
  container.appendChild(wrap);

  const BADGE_COLORS = ['primary','success','warning','danger','info','secondary'];

  const columns = [
    { key: 'codice_prodotto',  label: 'Codice' },
    { key: 'descrizione',      label: 'Descrizione' },
    { key: '_cat',             label: 'Cat.',
      fmt: v => v != null
        ? `<span class="badge bg-${BADGE_COLORS[v]}">Cat ${v}</span>`
        : '<span class="text-muted">—</span>' },
    { key: '_extra',           label: 'Extra (€/ton)',         fmt: v => v != null ? fmt(v, 'currency') : '<span class="text-muted">—</span>' },
    { key: '_base',            label: 'Base (€/ton)',          fmt: v => v != null ? fmt(v, 'currency') : '<span class="text-muted">n.d.</span>' },
    { key: '_extraQualita',    label: 'Extra qualità (€/ton)', fmt: v => v ? fmt(v, 'currency') : '<span class="text-muted">—</span>' },
    { key: '_totale',          label: 'Totale (€/ton)',        fmt: v => v != null ? fmt(v, 'currency') : '<span class="text-muted">—</span>' },
  ];

  function buildRows() {
    const extraQualita = Number(cat.extra_qualita) || 0;
    return prodottiCat
      .filter(p => p.prezzo_riferimento != null)
      .map(p => {
        const extra = Number(p.prezzo_riferimento);
        const catN  = p.categoria_trave;
        const base  = catN != null ? baseOf(catN) : null;
        return { ...p, _cat: catN, _extra: extra, _base: base, _extraQualita: extraQualita,
          _totale: base != null ? extra + base + extraQualita : null };
      });
  }

  function refresh() {
    renderTable(wrap.querySelector('.tbl-body'), {
      columns, rows: buildRows(), actions: { onEdit: openEdit },
      emptyMsg: `Nessun extra registrato per TRAVI`,
    });
  }

  // Save a single base_cat_N when its input changes
  CATS.forEach(n => {
    wrap.querySelector(`[data-base="${n}"]`).addEventListener('change', async e => {
      const val = e.target.value === '' ? null : Number(e.target.value);
      try {
        const updated = await api.categorie.update(cat.id, { [`base_cat_${n}`]: val ?? 0 });
        cat[`base_cat_${n}`] = updated[`base_cat_${n}`];
        toast(`Base Cat ${n} aggiornata`);
        refresh();
      } catch (err) { toast(err.message, 'danger'); }
    });
  });

  wrap.querySelector('[data-f="extra-qualita"]').addEventListener('change', async e => {
    const val = e.target.value === '' ? 0 : Number(e.target.value);
    try {
      const updated = await api.categorie.update(cat.id, { extra_qualita: val });
      cat.extra_qualita = updated.extra_qualita;
      toast('Extra qualità aggiornato');
      refresh();
    } catch (err) { toast(err.message, 'danger'); }
  });

  wrap.querySelector('[data-action="export"]').onclick = () =>
    downloadCsv('listino_TRAVI.csv', columns, buildRows());

  wrap.querySelector('[data-action="import"]').onclick = () => showImportModal({
    title: `Importa Extra — TRAVI`,
    templateUrl: api.prodotti.prezzoRiferimentoTemplateUrl,
    importFn: file => api.prodotti.importPrezzoRiferimento(cat.id, file),
    onSuccess: () => location.reload(),
    helpHtml: `<p class="small text-muted">
      Campi: <code>codice_prodotto</code>, <code>descrizione</code> (per nuovi profili),
      <code>prezzo_riferimento</code> — extra in €/ton.
    </p>`,
  });

  const fields = [
    { name: 'codice_prodotto',  label: 'Codice',          type: 'text',    required: true, col: 5 },
    { name: 'descrizione',      label: 'Descrizione',     type: 'text',    required: true, col: 7 },
    { name: 'prezzo_riferimento', label: 'Extra (€/ton)', type: 'decimal', required: true, col: 4, step: '0.0001' },
    { name: 'categoria_trave',  label: 'Categoria',      type: 'select',  col: 4,
      options: CATS.map(n => ({ value: n, label: `Cat ${n}` })) },
  ];

  wrap.querySelector('[data-action="new"]').onclick = () => showFormModal({
    title: `Nuovo Profilo — TRAVI`, fields, values: {},
    onSave: async data => {
      await api.prodotti.create({ ...data, id_categoria: cat.id, unita_misura_acquisto: cat.unita_misura_base });
      toast('Profilo creato'); location.reload();
    },
  });

  function openEdit(id, row) {
    showFormModal({
      title: `Modifica — ${row.codice_prodotto}`,
      fields: fields.map(f => f.name === 'codice_prodotto' ? { ...f, type: 'hidden' } : f),
      values: row,
      onSave: async data => {
        await api.prodotti.update(id, { descrizione: data.descrizione, prezzo_riferimento: data.prezzo_riferimento, categoria_trave: data.categoria_trave });
        toast('Profilo aggiornato'); location.reload();
      },
    });
  }

  refresh();
}

// --- MERCANTILE: extra di prodotto + base di intestazione -------------------

function renderExtraBase(container, { cat, prodotti }) {
  const prodottiCat = prodotti.filter(p => p.id_categoria === cat.id);

  const wrap = document.createElement('div');
  wrap.className = 'table-card';
  wrap.innerHTML = `
    <div class="table-toolbar flex-wrap gap-2">
      <label class="small text-muted mb-0 me-1">Base</label>
      <div class="input-group input-group-sm" style="max-width:150px">
        <input type="number" step="0.01" class="form-control" data-f="base" value="${cat.parametro_prezzo != null ? Number(cat.parametro_prezzo) : ''}">
        <span class="input-group-text">€/ton</span>
      </div>
      <label class="small text-muted mb-0 ms-2 me-1">Extra qualità</label>
      <div class="input-group input-group-sm" style="max-width:150px">
        <input type="number" step="0.01" class="form-control" data-f="extra-qualita" value="${cat.extra_qualita != null ? Number(cat.extra_qualita) : '0'}" title="Supplemento qualità superiore a S275JRH (€/ton)">
        <span class="input-group-text">€/ton</span>
      </div>
      <span class="ms-auto text-muted small me-2">${prodottiCat.length} prodotti</span>
      ${EXPORT_BTN}
      <a href="${api.prodotti.prezzoRiferimentoTemplateUrl}" class="btn btn-outline-secondary btn-sm me-2" download title="Scarica template per import massivo">
        <i class="bi bi-download me-1"></i>Template
      </a>
      <button class="btn btn-outline-primary btn-sm me-2" data-action="import"><i class="bi bi-upload me-1"></i>Importa</button>
      <button class="btn btn-primary btn-sm" data-action="new"><i class="bi bi-plus-lg me-1"></i>Nuovo Prodotto</button>
    </div>
    <div class="tbl-body"></div>`;
  container.innerHTML = '';
  container.appendChild(wrap);

  const columns = [
    { key: 'codice_prodotto', label: 'Codice' },
    { key: 'descrizione',     label: 'Descrizione' },
    { key: '_extra',          label: 'Extra (€/ton)',         fmt: v => fmt(v, 'currency') },
    { key: '_base',           label: 'Base (€/ton)',          fmt: v => fmt(v, 'currency') },
    { key: '_extraQualita',   label: 'Extra qualità (€/ton)', fmt: v => v ? fmt(v, 'currency') : '<span class="text-muted">—</span>' },
    { key: '_totale',         label: 'Totale (€/ton)',        fmt: v => fmt(v, 'currency') },
  ];

  function buildRows() {
    const base         = Number(cat.parametro_prezzo) || 0;
    const extraQualita = Number(cat.extra_qualita)    || 0;
    return prodottiCat
      .filter(p => p.prezzo_riferimento != null)
      .map(p => {
        const extra = Number(p.prezzo_riferimento);
        return { ...p, _extra: extra, _base: base, _extraQualita: extraQualita, _totale: extra + base + extraQualita };
      });
  }

  function refresh() {
    renderTable(wrap.querySelector('.tbl-body'), {
      columns, rows: buildRows(), actions: { onEdit: openEdit },
      emptyMsg: `Nessun extra registrato per ${cat.codice}`,
    });
  }

  wrap.querySelector('[data-f="base"]').addEventListener('change', async e => {
    const val = e.target.value === '' ? null : Number(e.target.value);
    try {
      const updated = await api.categorie.update(cat.id, { parametro_prezzo: val ?? 0 });
      cat.parametro_prezzo = updated.parametro_prezzo;
      toast('Base aggiornata');
      refresh();
    } catch (err) {
      toast(err.message, 'danger');
    }
  });

  wrap.querySelector('[data-f="extra-qualita"]').addEventListener('change', async e => {
    const val = e.target.value === '' ? 0 : Number(e.target.value);
    try {
      const updated = await api.categorie.update(cat.id, { extra_qualita: val });
      cat.extra_qualita = updated.extra_qualita;
      toast('Extra qualità aggiornato');
      refresh();
    } catch (err) {
      toast(err.message, 'danger');
    }
  });

  wrap.querySelector('[data-action="export"]').onclick = () =>
    downloadCsv(`listino_${cat.codice}.csv`, columns, buildRows());

  wrap.querySelector('[data-action="import"]').onclick = () => showImportModal({
    title: `Importa Extra — ${cat.codice}`,
    templateUrl: api.prodotti.prezzoRiferimentoTemplateUrl,
    importFn: file => api.prodotti.importPrezzoRiferimento(cat.id, file),
    onSuccess: () => location.reload(),
    helpHtml: `<p class="small text-muted">
      Una riga per profilo. Campi: <code>codice_prodotto</code> (se già presente in anagrafica
      viene aggiornato, altrimenti viene creato in questa categoria), <code>descrizione</code>
      (obbligatoria per i nuovi prodotti), <code>prezzo_riferimento</code> — extra di lavorazione
      in €/ton, comune a tutti i fornitori e stabile nel tempo.
    </p>`,
  });

  const fields = [
    { name: 'codice_prodotto', label: 'Codice Prodotto', type: 'text', required: true, col: 6 },
    { name: 'descrizione', label: 'Descrizione', type: 'text', required: true, col: 6 },
    { name: 'prezzo_riferimento', label: 'Extra (€/ton)', type: 'decimal', required: true, col: 6, step: '0.0001' },
  ];

  wrap.querySelector('[data-action="new"]').onclick = () => showFormModal({
    title: `Nuovo Prodotto — ${cat.codice}`, fields, values: {},
    onSave: async data => {
      await api.prodotti.create({ ...data, id_categoria: cat.id, unita_misura_acquisto: cat.unita_misura_base });
      toast('Prodotto creato'); location.reload();
    },
  });

  function openEdit(id, row) {
    showFormModal({
      title: `Modifica — ${row.codice_prodotto}`,
      fields: fields.map(f => f.name === 'codice_prodotto' ? { ...f, type: 'hidden' } : f),
      values: row,
      onSave: async data => {
        await api.prodotti.update(id, { descrizione: data.descrizione, prezzo_riferimento: data.prezzo_riferimento });
        toast('Prodotto aggiornato'); location.reload();
      },
    });
  }

  refresh();
}

// ---------------------------------------------------------------------------
// LISTINO SERVIZI — sub-tab per categoria di servizio
// ---------------------------------------------------------------------------

function renderListinoServizi(container, { servizi, fornitori, zincherie, vettori, categorie, categorieServizio, fornMap, catMap, vetMap }) {
  if (!categorieServizio.length) {
    container.innerHTML = '<div class="text-center py-5 text-muted">Nessuna categoria servizio definita</div>';
    return;
  }

  container.innerHTML = `
    <ul class="nav nav-pills mb-3">
      ${categorieServizio.map((c, i) => `<li class="nav-item"><button class="nav-link ${i === 0 ? 'active' : ''}" data-bs-toggle="pill" data-bs-target="#ls-cat-${c.id}" type="button" title="${c.descrizione}">${c.codice}</button></li>`).join('')}
    </ul>
    <div class="tab-content">
      ${categorieServizio.map((c, i) => `<div class="tab-pane fade ${i === 0 ? 'show active' : ''}" id="ls-cat-${c.id}"></div>`).join('')}
    </div>`;

  categorieServizio.forEach(cat => {
    const pane = container.querySelector(`#ls-cat-${cat.id}`);
    if (cat.tipo_tariffa === 'tratta') {
      renderServiziTratta(pane, { cat, servizi, vettori, vetMap });
    } else {
      // I servizi parametrici (Zincatura) sono forniti dalle zincherie
      renderServiziParametrici(pane, { cat, servizi, fornitori: zincherie, categorie, fornMap, catMap });
    }
  });
}

// --- Servizi a tratta (es. Trasporti) ---------------------------------------

function renderServiziTratta(container, { cat, servizi, vettori, vetMap }) {
  const rows = servizi.filter(r => r.id_categoria_servizio === cat.id);
  rows.forEach(r => r._vettore = vetMap[r.id_vettore] || '—');

  const columns = [
    { key: '_vettore',              label: 'Vettore' },
    { key: 'localita_origine',      label: 'Origine' },
    { key: 'localita_destinazione', label: 'Destinazione' },
    { key: 'prezzo_unitario',       label: 'Prezzo', fmt: v => fmt(v, 'currency') },
    { key: 'unita_misura_prezzo',   label: 'U.M.',   fmt: v => `<code>${v}</code>` },
    { key: 'data_inizio',           label: 'Da',     fmt: v => fmt(v, 'date') },
    { key: 'data_fine',             label: 'A',      fmt: v => v ? fmt(v, 'date') : '<span class="text-muted">aperto</span>' },
    { key: 'attivo',                label: 'Attivo', fmt: v => fmt(v, 'bool') },
  ];

  const wrap = document.createElement('div');
  wrap.className = 'table-card';
  wrap.innerHTML = `
    <div class="table-toolbar">
      <select class="form-select form-select-sm" style="max-width:220px" data-f="vet">
        <option value="">Tutti i vettori</option>
        ${vettori.map(v => `<option value="${v.id}">${v.ragione_sociale}</option>`).join('')}
      </select>
      <span class="ms-auto text-muted small me-2">${rows.length} tariffe</span>
      ${EXPORT_BTN}
      <button class="btn btn-primary btn-sm" data-action="new"><i class="bi bi-plus-lg me-1"></i>Nuova Tariffa</button>
    </div>
    <div class="tbl-body"></div>`;
  container.innerHTML = '';
  container.appendChild(wrap);

  let filtered = rows;
  function refresh() {
    renderTable(wrap.querySelector('.tbl-body'), {
      columns, rows: filtered, actions: { onEdit: openEdit, onDelete: doDelete },
      emptyMsg: 'Nessuna tariffa di trasporto registrata',
    });
  }

  wrap.querySelector('[data-action="export"]').onclick = () =>
    downloadCsv(`listino_servizi_${cat.codice}.csv`, columns, filtered);

  wrap.querySelector('[data-f="vet"]').addEventListener('change', e => {
    const v = e.target.value;
    filtered = v ? rows.filter(r => String(r.id_vettore) === v) : rows;
    refresh();
  });

  const fields = [
    { name: 'id_vettore', label: 'Vettore', type: 'select', required: true, col: 12,
      options: vettori.map(v => ({ value: v.id, label: v.ragione_sociale })) },
    { name: 'localita_origine',      label: 'Origine',      type: 'text', required: true, col: 6, placeholder: 'es. Belpasso' },
    { name: 'localita_destinazione', label: 'Destinazione', type: 'text', required: true, col: 6, placeholder: 'es. Viterbo' },
    { name: 'prezzo_unitario', label: 'Prezzo', type: 'decimal', required: true, col: 4, step: '0.01' },
    { name: 'valuta', label: 'Valuta', type: 'text', col: 2, value: 'EUR' },
    { name: 'unita_misura_prezzo', label: 'U.M.', type: 'text', col: 2, value: cat.unita_misura_prezzo },
    { name: 'data_inizio', label: 'Valido Da', type: 'date', required: true, col: 4 },
    { name: 'data_fine', label: 'Valido A', type: 'date', col: 4 },
    { name: 'attivo', label: 'Attivo', type: 'checkbox', col: 4, value: true },
    { name: 'note', label: 'Note', type: 'textarea', col: 12 },
  ];

  wrap.querySelector('[data-action="new"]').onclick = () => showFormModal({
    title: `Nuova Tariffa — ${cat.codice}`, fields, values: {},
    onSave: async data => {
      await api.listinoServizi.create({ ...data, id_categoria_servizio: cat.id });
      toast('Tariffa creata'); location.reload();
    },
  });

  function openEdit(id, row) {
    showFormModal({
      title: `Modifica Tariffa — ${cat.codice}`, fields, values: row,
      onSave: async data => {
        await api.listinoServizi.update(id, data);
        toast('Tariffa aggiornata'); location.reload();
      },
    });
  }

  async function doDelete(id, row) {
    await deleteWithConfirm(`${row._vettore}: ${row.localita_origine} → ${row.localita_destinazione}`, () => api.listinoServizi.del(id), () => location.reload());
  }

  refresh();
}

// --- Servizi parametrici (es. Zincatura) -------------------------------------

function renderServiziParametrici(container, { cat, servizi, fornitori, categorie, fornMap, catMap }) {
  const rows = servizi.filter(r => r.id_categoria_servizio === cat.id);
  rows.forEach(r => {
    r._fornitore = fornMap[r.id_fornitore] || '—';
    r._categoria = r.id_categoria_prodotto ? (catMap[r.id_categoria_prodotto]?.codice || '—') : '<span class="text-muted">—</span>';
    r._range = formatRange(r);
  });

  const columns = [
    { key: '_fornitore',       label: 'Zincheria' },
    { key: '_categoria',       label: 'Categoria Prodotto' },
    { key: 'descrizione_voce', label: 'Descrizione' },
    { key: '_range',           label: 'Parametro' },
    { key: 'prezzo_unitario',  label: 'Prezzo', fmt: v => fmt(v, 'currency') },
    { key: 'unita_misura_prezzo', label: 'U.M.', fmt: v => `<code>${v}</code>` },
    { key: 'data_inizio',      label: 'Da', fmt: v => fmt(v, 'date') },
    { key: 'data_fine',        label: 'A',  fmt: v => v ? fmt(v, 'date') : '<span class="text-muted">aperto</span>' },
    { key: 'attivo',           label: 'Attivo', fmt: v => fmt(v, 'bool') },
  ];

  const wrap = document.createElement('div');
  wrap.className = 'table-card';
  wrap.innerHTML = `
    <div class="table-toolbar">
      <select class="form-select form-select-sm" style="max-width:220px" data-f="forn">
        <option value="">Tutte le zincherie</option>
        ${fornitori.map(f => `<option value="${f.id}">${f.ragione_sociale}</option>`).join('')}
      </select>
      <span class="ms-auto text-muted small me-2">${rows.length} tariffe</span>
      ${EXPORT_BTN}
      <button class="btn btn-primary btn-sm" data-action="new"><i class="bi bi-plus-lg me-1"></i>Nuova Tariffa</button>
    </div>
    <div class="tbl-body"></div>`;
  container.innerHTML = '';
  container.appendChild(wrap);

  let filtered = rows;
  function refresh() {
    renderTable(wrap.querySelector('.tbl-body'), {
      columns, rows: filtered, actions: { onEdit: openEdit, onDelete: doDelete },
      emptyMsg: `Nessuna tariffa registrata per ${cat.codice}`,
    });
  }

  wrap.querySelector('[data-action="export"]').onclick = () =>
    downloadCsv(`listino_servizi_${cat.codice}.csv`, columns, filtered);

  wrap.querySelector('[data-f="forn"]').addEventListener('change', e => {
    const v = e.target.value;
    filtered = v ? rows.filter(r => String(r.id_fornitore) === v) : rows;
    refresh();
  });

  const fields = [
    { name: 'id_fornitore', label: 'Zincheria', type: 'select', required: true, col: 12,
      options: fornitori.map(f => ({ value: f.id, label: f.ragione_sociale })) },
    { name: 'id_categoria_prodotto', label: 'Categoria Prodotto', type: 'select', col: 6,
      options: categorie.map(c => ({ value: c.id, label: c.codice })) },
    { name: 'descrizione_voce', label: 'Descrizione voce', type: 'text', col: 6, placeholder: 'es. Piatti larghezza fino a 50mm' },
    { name: 'parametro_rif', label: 'Parametro di riferimento', type: 'text', col: 4, placeholder: 'es. larghezza_mm' },
    { name: 'parametro_min', label: 'Da (escluso)', type: 'decimal', col: 4 },
    { name: 'parametro_max', label: 'A (incluso)', type: 'decimal', col: 4 },
    { name: 'prezzo_unitario', label: 'Prezzo', type: 'decimal', required: true, col: 4, step: '0.0001' },
    { name: 'valuta', label: 'Valuta', type: 'text', col: 2, value: 'EUR' },
    { name: 'unita_misura_prezzo', label: 'U.M.', type: 'text', col: 2, value: cat.unita_misura_prezzo },
    { name: 'data_inizio', label: 'Valido Da', type: 'date', required: true, col: 4 },
    { name: 'data_fine', label: 'Valido A', type: 'date', col: 4 },
    { name: 'attivo', label: 'Attivo', type: 'checkbox', col: 4, value: true },
    { name: 'note', label: 'Note', type: 'textarea', col: 12 },
  ];

  wrap.querySelector('[data-action="new"]').onclick = () => showFormModal({
    title: `Nuova Tariffa — ${cat.codice}`, fields, values: {},
    onSave: async data => {
      await api.listinoServizi.create({ ...data, id_categoria_servizio: cat.id });
      toast('Tariffa creata'); location.reload();
    },
  });

  function openEdit(id, row) {
    showFormModal({
      title: `Modifica Tariffa — ${cat.codice}`, fields, values: row,
      onSave: async data => {
        await api.listinoServizi.update(id, data);
        toast('Tariffa aggiornata'); location.reload();
      },
    });
  }

  async function doDelete(id, row) {
    await deleteWithConfirm(`${row._fornitore}: ${row.descrizione_voce || `tariffa #${id}`}`, () => api.listinoServizi.del(id), () => location.reload());
  }

  refresh();
}

function formatRange(r) {
  if (!r.parametro_rif) return '<span class="text-muted">—</span>';
  let range = '';
  if (r.parametro_min != null && r.parametro_max != null) range = `${r.parametro_min} – ${r.parametro_max}`;
  else if (r.parametro_max != null) range = `fino a ${r.parametro_max}`;
  else if (r.parametro_min != null) range = `da ${r.parametro_min}`;
  return `<code>${r.parametro_rif}</code> ${range}`;
}
