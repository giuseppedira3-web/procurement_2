import { api, getUtente } from '../api.js';
import { fmt } from '../utils.js';

// Raggruppa le righe (una per riga ordine) per ordine, mantenendo l'ordine
// di arrivo (già ordinato dal backend per data_ordine DESC).
function raggruppaPerOrdine(righe) {
  const mappa = new Map();
  for (const r of righe) {
    if (!mappa.has(r.id_ordine)) {
      mappa.set(r.id_ordine, {
        id_ordine: r.id_ordine,
        codice_ordine: r.codice_ordine,
        data_ordine: r.data_ordine,
        stato: r.stato,
        ditta: r.ditta,
        fornitore: r.fornitore,
        prezzo_cbam_ordine: r.prezzo_cbam_ordine,
        righe: [],
      });
    }
    mappa.get(r.id_ordine).righe.push(r);
  }
  return [...mappa.values()];
}

export async function renderCbam(container) {
  const utente = getUtente();
  if (!utente || utente.ruolo !== 'admin') {
    container.innerHTML = `<div class="alert alert-danger">
      <i class="bi bi-shield-lock me-2"></i>Sezione riservata agli amministratori.</div>`;
    return;
  }

  const righe = await api.dashboard.cbamOrdini();
  const ordini = raggruppaPerOrdine(righe);

  const numOrdini    = ordini.length;
  const totKg        = righe.reduce((s, r) => s + Number(r.quantita_kg || 0), 0);
  const totImportoCbam = righe.reduce((s, r) => s + Number(r.importo_cbam || 0), 0);

  container.innerHTML = `
  <div class="alert alert-secondary small mb-3">
    <i class="bi bi-info-circle me-2"></i>Ordini soggetti a CBAM (Carbon Border Adjustment Mechanism,
    fornitori extra-UE): la tariffa €/kg è impostata in testata ordine e si somma al prezzo materiale
    di ogni riga.
  </div>

  <div class="row g-3 mb-3">
    <div class="col-md-4">
      <div class="stat-card d-flex justify-content-between align-items-start">
        <div>
          <div class="stat-value text-primary">${numOrdini}</div>
          <div class="stat-label">Ordini con CBAM</div>
        </div>
        <i class="bi bi-globe-europe-africa stat-icon text-primary"></i>
      </div>
    </div>
    <div class="col-md-4">
      <div class="stat-card d-flex justify-content-between align-items-start">
        <div>
          <div class="stat-value text-dark">${fmt(totKg, 'peso_t')}</div>
          <div class="stat-label">Peso totale</div>
        </div>
        <i class="bi bi-box-seam stat-icon text-dark"></i>
      </div>
    </div>
    <div class="col-md-4">
      <div class="stat-card d-flex justify-content-between align-items-start">
        <div>
          <div class="stat-value text-warning">${fmt(totImportoCbam, 'currency')}</div>
          <div class="stat-label">Importo CBAM totale</div>
        </div>
        <i class="bi bi-currency-euro stat-icon text-warning"></i>
      </div>
    </div>
  </div>

  <div class="table-card">
    <div class="table-toolbar fw-semibold small">
      <i class="bi bi-globe-europe-africa me-2 text-primary"></i>Ordini CBAM — Dettaglio
    </div>
    ${ordini.length ? `
    <div class="accordion accordion-flush" id="cbam-accordion">
      ${ordini.map((o, i) => renderOrdineCbam(o, i)).join('')}
    </div>` : '<div class="text-center py-4 text-muted">Nessun ordine con CBAM attivo</div>'}
  </div>`;
}

function renderOrdineCbam(o, i) {
  const impOrdine = o.righe.reduce((s, r) => s + Number(r.importo_cbam || 0), 0);
  const kgOrdine  = o.righe.reduce((s, r) => s + Number(r.quantita_kg || 0), 0);
  const collapseId = `cbam-ordine-${o.id_ordine}`;
  return `
  <div class="accordion-item">
    <h2 class="accordion-header">
      <button class="accordion-button ${i === 0 ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}">
        <div class="d-flex justify-content-between align-items-center w-100 me-3">
          <span>
            <a href="#/ordini/${o.id_ordine}" class="fw-semibold text-decoration-none" onclick="event.stopPropagation()">${o.codice_ordine}</a>
            <span class="text-muted ms-2">${o.fornitore}</span>
          </span>
          <span class="d-flex align-items-center gap-3 small">
            <span>${fmt(o.data_ordine, 'date')}</span>
            <span class="badge bg-info text-dark">${fmt(o.prezzo_cbam_ordine, 'number')} €/kg</span>
            <span class="fw-semibold text-warning">${fmt(impOrdine, 'currency')}</span>
          </span>
        </div>
      </button>
    </h2>
    <div id="${collapseId}" class="accordion-collapse collapse ${i === 0 ? 'show' : ''}" data-bs-parent="#cbam-accordion">
      <div class="accordion-body p-0">
        <table class="table table-sm table-hover mb-0">
          <thead class="table-light"><tr>
            <th>#</th><th>Prodotto</th><th class="text-end">Qtà</th><th class="text-end">Kg</th>
            <th class="text-end">Prezzo €/kg</th><th class="text-end">Tariffa CBAM €/kg</th>
            <th class="text-end">Importo CBAM</th><th class="text-end">Importo riga</th>
          </tr></thead>
          <tbody>
            ${o.righe.map(r => `<tr>
              <td>${r.numero_riga}</td>
              <td>${r.codice_prodotto ? `${r.codice_prodotto} — ${r.descrizione_prodotto || ''}` : (r.descrizione_libera || '—')}</td>
              <td class="text-end">${fmt(r.quantita_ordinata, 'number')} ${r.unita_misura || ''}</td>
              <td class="text-end">${fmt(r.quantita_kg, 'number')}</td>
              <td class="text-end">${fmt(r.prezzo_unitario, 'eur_kg')}</td>
              <td class="text-end">${fmt(r.prezzo_cbam_kg, 'eur_kg')}</td>
              <td class="text-end fw-semibold text-warning">${fmt(r.importo_cbam, 'currency')}</td>
              <td class="text-end">${fmt(r.importo_riga, 'currency')}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr class="table-light fw-semibold">
              <td colspan="3"></td>
              <td class="text-end">${fmt(kgOrdine, 'number')}</td>
              <td colspan="2"></td>
              <td class="text-end text-warning">${fmt(impOrdine, 'currency')}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  </div>`;
}
