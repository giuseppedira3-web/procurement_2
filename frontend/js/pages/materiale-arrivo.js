import { api, getUtente } from '../api.js';
import { fmt } from '../utils.js';

// Le 4 categorie merceologiche core, stesso ordine/colore di dashboard/prezzi.
const CATEGORIE_CORE = [
  { key: 'LAMIERA',    label: 'Lamiera',    icon: 'bi-square',                 color: '#2a78d6' },
  { key: 'MERCANTILE', label: 'Mercantile', icon: 'bi-bricks',                 color: '#eb6834' },
  { key: 'TRAVI',      label: 'Travi',      icon: 'bi-distribute-vertical',    color: '#1baf7a' },
  { key: 'TUBOLARE',   label: 'Tubolare',   icon: 'bi-record-circle',          color: '#eda100' },
];

export async function renderMaterialeArrivo(container) {
  const utente = getUtente();
  if (!utente || utente.ruolo !== 'admin') {
    container.innerHTML = `<div class="alert alert-danger">
      <i class="bi bi-shield-lock me-2"></i>Sezione riservata agli amministratori.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="alert alert-secondary small mb-3">
      <i class="bi bi-info-circle me-2"></i>Righe ordine non ancora completamente consegnate, aggregate
      per prodotto (peso residuo in arrivo). Click su un prodotto per il dettaglio ordine/fornitore/quantità/prezzo netto.
    </div>
    <ul class="nav nav-tabs mb-3">
      ${CATEGORIE_CORE.map((c, i) => `
        <li class="nav-item">
          <button class="nav-link ${i === 0 ? 'active' : ''}" data-bs-toggle="tab" data-bs-target="#arrivo-${c.key}" type="button">
            <i class="bi ${c.icon} me-1"></i>${c.label}
          </button>
        </li>`).join('')}
    </ul>
    <div class="tab-content">
      ${CATEGORIE_CORE.map((c, i) => `
        <div class="tab-pane fade ${i === 0 ? 'show active' : ''}" id="arrivo-${c.key}"></div>`).join('')}
    </div>`;

  CATEGORIE_CORE.forEach(c => {
    renderMaterialeArrivoPane(container.querySelector(`#arrivo-${c.key}`), c);
  });
}

// --- Materiale in arrivo per prodotto: righe ordine non ancora consegnate, ---
// --- aggregate per prodotto (ordine alfabetico) con dettaglio ordine/       ---
// --- fornitore/quantità/prezzo netto a tendina.                            ---

function raggruppaPerProdotto(righe) {
  const mappa = new Map();
  for (const r of righe) {
    if (!mappa.has(r.id_prodotto)) {
      mappa.set(r.id_prodotto, {
        id_prodotto: r.id_prodotto,
        codice_prodotto: r.codice_prodotto,
        descrizione_prodotto: r.descrizione_prodotto,
        righe: [],
      });
    }
    mappa.get(r.id_prodotto).righe.push(r);
  }
  return [...mappa.values()].sort((a, b) =>
    (a.codice_prodotto || '').localeCompare(b.codice_prodotto || '', 'it', { numeric: true, sensitivity: 'base' }));
}

function pesoProdotto(p) {
  return p.righe.reduce((s, r) => s + Number(r.quantita_residua_kg || 0), 0);
}

async function renderMaterialeArrivoPane(pane, categoria) {
  pane.innerHTML = `<div class="text-center py-4 text-muted"><i class="bi bi-hourglass-split"></i> Caricamento…</div>`;
  const righe = await api.dashboard.materialeInArrivo({ categoria: categoria.key }).catch(() => null);
  if (righe === null) {
    pane.innerHTML = `<div class="alert alert-warning small mb-0"><i class="bi bi-exclamation-triangle me-1"></i>Impossibile caricare il materiale in arrivo.</div>`;
    return;
  }

  const prodotti = raggruppaPerProdotto(righe);
  const totKg = righe.reduce((s, r) => s + Number(r.quantita_residua_kg || 0), 0);

  pane.innerHTML = `
    <div class="table-card">
      <div class="table-toolbar fw-semibold small">
        <i class="bi ${categoria.icon} me-2" style="color:${categoria.color}"></i>${categoria.label} — Materiale in Arrivo per Prodotto
        <span class="ms-auto text-muted">${prodotti.length} prodott${prodotti.length === 1 ? 'o' : 'i'}</span>
        <span class="ms-3 fw-bold">${fmt(totKg, 'peso_t')}</span>
      </div>
      ${prodotti.length ? `
      <div class="accordion accordion-flush" id="arrivo-accordion-${categoria.key}">
        ${prodotti.map((p, i) => renderProdottoArrivo(p, i, categoria)).join('')}
      </div>` : '<div class="text-center py-4 text-muted">Nessun materiale in arrivo</div>'}
    </div>`;
}

function renderProdottoArrivo(p, i, categoria) {
  const peso = pesoProdotto(p);
  const numOrdini = new Set(p.righe.map(r => r.id_ordine)).size;
  const collapseId = `arrivo-prodotto-${categoria.key}-${p.id_prodotto}`;
  return `
  <div class="accordion-item">
    <h2 class="accordion-header">
      <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}">
        <div class="d-flex justify-content-between align-items-center w-100 me-3">
          <span>
            <span class="fw-semibold">${p.codice_prodotto || '—'}</span>
            <span class="text-muted ms-2">${p.descrizione_prodotto || ''}</span>
          </span>
          <span class="d-flex align-items-center gap-3 small">
            <span class="text-muted">${numOrdini} ordin${numOrdini === 1 ? 'e' : 'i'}</span>
            <span class="fw-semibold" style="color:${categoria.color}">${peso > 0 ? fmt(peso, 'peso_t') : '—'}</span>
          </span>
        </div>
      </button>
    </h2>
    <div id="${collapseId}" class="accordion-collapse collapse" data-bs-parent="#arrivo-accordion-${categoria.key}">
      <div class="accordion-body p-0">
        <table class="table table-sm table-hover mb-0">
          <thead class="table-light"><tr>
            <th>Ordine</th><th>Fornitore</th><th>Data</th>
            <th class="text-end">Quantità</th><th class="text-end">Prezzo netto</th>
          </tr></thead>
          <tbody>
            ${p.righe.map(r => `<tr>
              <td><a href="#/ordini/${r.id_ordine}" class="fw-semibold text-decoration-none">${r.codice_ordine}</a></td>
              <td>${r.fornitore}</td>
              <td>${fmt(r.data_ordine, 'date')}</td>
              <td class="text-end">${fmt(r.quantita_residua, 'number')} ${r.unita_misura || ''}</td>
              <td class="text-end">${r.prezzo_netto_unitario != null ? `${fmt(r.prezzo_netto_unitario, 'number')} €/${r.unita_misura || ''}` : '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}
