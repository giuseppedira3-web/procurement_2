import { api } from '../api.js';
import { fmt, toast, setHeaderActions, setTitle } from '../utils.js';
import { renderTable, showFormModal, showImportModal, deleteWithConfirm } from '../components.js';
import { renderVettori } from './vettori.js';

const COLUMNS = [
  { key: 'codice_fornitore', label: 'Codice', width: '110px', fmt: v => `<span class="fw-mono fw-semibold">${v}</span>` },
  { key: 'ragione_sociale',  label: 'Ragione Sociale', fmt: (v,r) => `<strong>${v}</strong>` },
  { key: 'citta',            label: 'Città' },
  { key: 'telefono',         label: 'Telefono' },
  { key: 'email',            label: 'Email' },
  { key: 'condizioni_pagamento', label: 'Pagamento' },
  { key: 'attivo',           label: 'Attivo', width: '70px', fmt: v => fmt(v, 'bool') },
];

const FIELDS = [
  { name: 'codice_fornitore',   label: 'Codice Fornitore',  type: 'text',   required: true,  col: 3, placeholder: 'es. METAL01' },
  { name: 'ragione_sociale',    label: 'Ragione Sociale',   type: 'text',   required: true,  col: 9 },
  { name: 'partita_iva',        label: 'P.IVA',             type: 'text',   col: 4 },
  { name: 'codice_fiscale',     label: 'Codice Fiscale',    type: 'text',   col: 4 },
  { name: 'pec',                label: 'PEC',               type: 'text',   col: 4 },
  { name: 'indirizzo',          label: 'Indirizzo',         type: 'text',   col: 8 },
  { name: 'cap',                label: 'CAP',               type: 'text',   col: 2 },
  { name: 'citta',              label: 'Città',             type: 'text',   col: 5 },
  { name: 'provincia',          label: 'Prov.',             type: 'text',   col: 2, placeholder: 'BS' },
  { name: 'paese',              label: 'Paese',             type: 'text',   col: 3, value: 'IT' },
  { name: 'telefono',           label: 'Telefono',          type: 'text',   col: 4 },
  { name: 'email',              label: 'Email',             type: 'text',   col: 4 },
  { name: 'iban',               label: 'IBAN',              type: 'text',   col: 4 },
  { name: 'condizioni_pagamento', label: 'Cond. Pagamento', type: 'text',   col: 4, placeholder: '60gg DF' },
  { name: 'valuta',             label: 'Valuta',            type: 'text',   col: 2, value: 'EUR' },
  { name: 'attivo',             label: 'Attivo',            type: 'checkbox', col: 2, value: true },
  { name: 'note',               label: 'Note',              type: 'textarea', col: 12 },
];

// Shell a tab: Acciaierie / Vettori / Zincherie
export async function renderFornitori(container) {
  const TABS = [
    { key: 'acciaieria', label: 'Acciaierie', icon: 'building' },
    { key: 'vettori',    label: 'Vettori',    icon: 'truck' },
    { key: 'zincheria',  label: 'Zincherie',  icon: 'droplet-half' },
  ];

  container.innerHTML = `
    <ul class="nav nav-tabs mb-3">
      ${TABS.map((t, i) => `<li class="nav-item"><button type="button" class="nav-link ${i === 0 ? 'active' : ''}" data-anag="${t.key}"><i class="bi bi-${t.icon} me-1"></i>${t.label}</button></li>`).join('')}
    </ul>
    <div id="anag-pane"></div>`;

  const pane = container.querySelector('#anag-pane');
  const tabs = [...container.querySelectorAll('[data-anag]')];

  async function show(which) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.anag === which));
    document.getElementById('header-actions').innerHTML = '';
    pane.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
    if (which === 'vettori') await renderVettori(pane);
    else await renderFornitoriTipo(pane, which);
    setTitle(TABS.find(t => t.key === which).label);
  }

  tabs.forEach(t => t.addEventListener('click', () => show(t.dataset.anag)));
  await show('acciaieria');
}

// Anagrafica fornitori filtrata per tipo (acciaieria | zincheria)
async function renderFornitoriTipo(container, tipo) {
  const isZinc  = tipo === 'zincheria';
  const singolare = isZinc ? 'Zincheria' : 'Acciaieria';
  const plurale   = isZinc ? 'zincherie' : 'acciaierie';

  // Carico tutti i fornitori: 'rows' filtrato per tipo (visualizzazione),
  // 'all' per calcolare il prossimo codice libero (univoco sull'intera tabella).
  const all  = await api.fornitori.list('?limit=500');
  const rows = all.filter(r => r.tipo === tipo);

  const bulkBtns = isZinc ? '' : `
    <a href="${api.fornitori.templateUrl}" class="btn btn-outline-secondary btn-sm me-2" download title="Scarica template per import massivo">
      <i class="bi bi-download me-1"></i>Template
    </a>
    <a href="${api.fornitori.exportUrl}" class="btn btn-outline-secondary btn-sm me-2" download title="Scarica i fornitori esistenti in CSV (stesso formato del template)">
      <i class="bi bi-file-earmark-arrow-down me-1"></i>Esporta
    </a>
    <button class="btn btn-outline-primary btn-sm me-2" id="btn-import"><i class="bi bi-upload me-1"></i>Importa</button>`;

  setHeaderActions(`${bulkBtns}
    <button class="btn btn-primary btn-sm" id="btn-new"><i class="bi bi-plus-lg me-1"></i>Nuova ${singolare}</button>`);

  const wrap = document.createElement('div');
  wrap.className = 'table-card';
  wrap.innerHTML = `<div class="table-toolbar">
    <input class="form-control form-control-sm" style="max-width:250px" id="search-q" placeholder="Cerca...">
    <span class="ms-auto text-muted small">${rows.length} ${plurale}</span>
  </div><div id="tbl-body"></div>`;
  container.innerHTML = '';
  container.appendChild(wrap);

  let filtered = rows;

  function refresh() {
    renderTable(wrap.querySelector('#tbl-body'), {
      columns: COLUMNS, rows: filtered,
      actions: {
        onEdit:   openEdit,
        onDelete: doDelete,
        extra: row => `<button class="btn btn-sm btn-outline-info btn-action me-1" data-magazzini="${row.id}" title="Magazzini"><i class="bi bi-geo-alt"></i></button>`,
      },
    });
  }

  wrap.addEventListener('click', e => {
    const btn = e.target.closest('[data-magazzini]');
    if (!btn) return;
    const id = Number(btn.dataset.magazzini);
    const row = filtered.find(r => r.id === id);
    gestisciMagazzini(id, row?.ragione_sociale || '');
  });

  wrap.querySelector('#search-q').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    filtered = rows.filter(r => r.ragione_sociale.toLowerCase().includes(q) || r.codice_fornitore.toLowerCase().includes(q));
    refresh();
  });

  document.getElementById('btn-new').onclick = () => openCreate();
  const importBtn = document.getElementById('btn-import');
  if (importBtn) importBtn.onclick = () => showImportModal({
    title: 'Importa Fornitori da CSV/XLSX',
    templateUrl: api.fornitori.templateUrl,
    importFn: file => api.fornitori.importFile(file),
    onSuccess: () => renderFornitoriTipo(container, tipo),
    helpHtml: `<p class="small text-muted">
      Campi obbligatori: <code>codice_fornitore</code>, <code>ragione_sociale</code>.<br>
      Colonne opzionali riconosciute: partita_iva, codice_fiscale, indirizzo, cap, citta, provincia,
      paese, telefono, email, pec, iban, condizioni_pagamento, valuta, attivo, note.<br>
      Per modifiche massive: usa il pulsante <strong>Esporta</strong> per scaricare i fornitori
      esistenti nello stesso formato del template, modificali e ricaricali da qui.
    </p>`,
  });
  refresh();

  function nextCodiceFree() {
    const used = new Set(
      all.map(r => r.codice_fornitore.match(/^(\d{3})$/)?.[1]).filter(Boolean).map(Number)
    );
    for (let i = 1; i <= 999; i++) if (!used.has(i)) return String(i).padStart(3, '0');
    return '';
  }

  function openCreate() {
    showFormModal({
      title: `Nuova ${singolare}`, fields: FIELDS, values: { codice_fornitore: nextCodiceFree() },
      onSave: async data => {
        await api.fornitori.create({ ...data, tipo });
        toast(`${singolare} creata`); renderFornitoriTipo(container, tipo);
      },
    });
  }

  function openEdit(id, row) {
    showFormModal({
      title: `Modifica: ${row.ragione_sociale}`, fields: FIELDS, values: row,
      onSave: async data => {
        await api.fornitori.update(id, data);
        toast('Anagrafica aggiornata'); renderFornitoriTipo(container, tipo);
      },
    });
  }

  async function doDelete(id, row) {
    await deleteWithConfirm(row.ragione_sociale, () => api.fornitori.del(id), () => renderFornitoriTipo(container, tipo));
  }
}

async function gestisciMagazzini(fornitoreId, ragioneSociale) {
  const modalEl  = document.getElementById('main-modal');
  const saveBtn  = document.getElementById('modal-save-btn');
  const titleEl  = document.getElementById('modal-title');
  const bodyEl   = document.getElementById('modal-body');

  saveBtn.style.display = 'none';
  modalEl.addEventListener('hidden.bs.modal', () => { saveBtn.style.display = ''; }, { once: true });

  titleEl.textContent = `Magazzini — ${ragioneSociale}`;

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

  async function render() {
    const lista = await api.magazzini.listByFornitore(fornitoreId);
    bodyEl.innerHTML = `
      <table class="table table-sm mb-3">
        <thead><tr><th>Comune</th><th>Indirizzo</th><th class="text-center">Attivo</th><th></th></tr></thead>
        <tbody>
          ${lista.length ? lista.map(m => `
            <tr>
              <td class="fw-semibold">${m.comune}</td>
              <td class="text-muted small">${m.indirizzo || '—'}</td>
              <td class="text-center">${fmt(m.attivo, 'bool')}</td>
              <td class="text-end">
                <button class="btn btn-sm btn-outline-danger btn-action" data-del="${m.id}"><i class="bi bi-trash"></i></button>
              </td>
            </tr>`).join('') : '<tr><td colspan="4" class="text-center text-muted py-2">Nessun magazzino</td></tr>'}
        </tbody>
      </table>
      <hr class="my-2">
      <div class="fw-semibold small mb-2">Aggiungi magazzino</div>
      <div class="row g-2 align-items-end">
        <div class="col-4"><label class="form-label small mb-1">Comune <span class="text-danger">*</span></label>
          <input class="form-control form-control-sm" id="new-comune" placeholder="es. Brescia"></div>
        <div class="col-6"><label class="form-label small mb-1">Indirizzo</label>
          <input class="form-control form-control-sm" id="new-indirizzo" placeholder="Via..."></div>
        <div class="col-2"><button class="btn btn-primary btn-sm w-100" id="btn-add-mag"><i class="bi bi-plus-lg"></i> Aggiungi</button></div>
      </div>`;

    bodyEl.querySelectorAll('[data-del]').forEach(btn => {
      btn.onclick = async () => {
        btn.disabled = true;
        await api.magazzini.del(fornitoreId, Number(btn.dataset.del));
        await render();
      };
    });

    bodyEl.querySelector('#btn-add-mag').onclick = async () => {
      const comune = bodyEl.querySelector('#new-comune').value.trim();
      if (!comune) { bodyEl.querySelector('#new-comune').classList.add('is-invalid'); return; }
      const indirizzo = bodyEl.querySelector('#new-indirizzo').value.trim() || null;
      await api.magazzini.create(fornitoreId, { comune, indirizzo });
      await render();
    };
  }

  await render();
  modal.show();
}
