import { api } from '../api.js';
import { fmt } from '../utils.js';

export async function renderDashboard(container) {
  const [ordini, ddt, esposizione] = await Promise.all([
    api.dashboard.statoOrdini('?limit=1000'),
    api.dashboard.ddtNonFatturati(),
    api.dashboard.esposizione(),
  ]);

  const totOrdini    = ordini.length;
  const inCorso      = ordini.filter(o => o.stato !== 'completato' && o.stato !== 'annullato').length;
  const ddtAperti    = ddt.length;
  const scadute      = esposizione.filter(e => e.urgenza === 'scaduta');
  const totDaPagare  = esposizione.reduce((s, e) => s + Number(e.totale_da_pagare || 0), 0);

  // Ordini non totalmente evasi: né annullati, né consegnati+fatturati al 100%
  const ordiniAperti = ordini.filter(o =>
    o.stato !== 'annullato' &&
    (Number(o.perc_consegnato || 0) < 100 || Number(o.perc_fatturato || 0) < 100)
  );

  container.innerHTML = `
  <div class="row g-3 mb-4">
    <div class="col-md-3">
      <div class="stat-card d-flex justify-content-between align-items-start">
        <div>
          <div class="stat-value text-primary">${totOrdini}</div>
          <div class="stat-label">Ordini totali</div>
        </div>
        <i class="bi bi-clipboard-check stat-icon text-primary"></i>
      </div>
    </div>
    <div class="col-md-3">
      <div class="stat-card d-flex justify-content-between align-items-start">
        <div>
          <div class="stat-value text-warning">${inCorso}</div>
          <div class="stat-label">Ordini aperti</div>
        </div>
        <i class="bi bi-hourglass-split stat-icon text-warning"></i>
      </div>
    </div>
    <div class="col-md-3">
      <div class="stat-card d-flex justify-content-between align-items-start">
        <div>
          <div class="stat-value text-info">${ddtAperti}</div>
          <div class="stat-label">DDT da fatturare</div>
        </div>
        <i class="bi bi-truck stat-icon text-info"></i>
      </div>
    </div>
    <div class="col-md-3">
      <div class="stat-card d-flex justify-content-between align-items-start">
        <div>
          <div class="stat-value ${scadute.length ? 'text-danger' : 'text-success'}">${scadute.length}</div>
          <div class="stat-label">Fatture scadute</div>
        </div>
        <i class="bi bi-exclamation-triangle stat-icon ${scadute.length ? 'text-danger' : 'text-success'}"></i>
      </div>
    </div>
  </div>

  <div class="row g-3">
    <!-- Stato ordini -->
    <div class="col-lg-7">
      <div class="table-card">
        <div class="table-toolbar fw-semibold small">
          <i class="bi bi-clipboard-check me-2 text-primary"></i>Avanzamento Ordini
          <span class="ms-auto text-muted">${ordiniAperti.length} non evasi</span>
        </div>
        ${ordiniAperti.length ? `
        <div style="max-height:460px; overflow-y:auto">
        <table class="table table-hover mb-0">
          <thead class="table-light" style="position:sticky; top:0; z-index:1"><tr>
            <th>Codice</th><th>Fornitore</th><th>Stato</th>
            <th>Consegnato</th><th>Fatturato</th>
          </tr></thead>
          <tbody>
            ${ordiniAperti.map(o => `<tr>
              <td><a href="#/ordini/${o.codice_ordine}" class="fw-semibold text-decoration-none">${o.codice_ordine}</a></td>
              <td>${o.fornitore}</td>
              <td>${fmt(o.stato, 'stato')}</td>
              <td>
                <div class="progress mb-1"><div class="progress-bar bg-info" style="width:${o.perc_consegnato||0}%"></div></div>
                <small>${o.perc_consegnato||0}%</small>
              </td>
              <td>
                <div class="progress mb-1"><div class="progress-bar bg-success" style="width:${o.perc_fatturato||0}%"></div></div>
                <small>${o.perc_fatturato||0}%</small>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
        </div>` : '<div class="text-center py-4 text-muted">Nessun ordine da evadere</div>'}
      </div>
    </div>

    <!-- Esposizione fornitori -->
    <div class="col-lg-5">
      <div class="table-card">
        <div class="table-toolbar fw-semibold small">
          <i class="bi bi-receipt me-2 text-danger"></i>Esposizione Fornitori
          <span class="ms-auto fw-bold">${fmt(totDaPagare, 'currency')}</span>
        </div>
        ${esposizione.length ? `
        <table class="table table-hover">
          <thead><tr><th>Fornitore</th><th>Urgenza</th><th class="text-end">Importo</th></tr></thead>
          <tbody>
            ${esposizione.slice(0,10).map(e => `<tr>
              <td>${e.ragione_sociale}</td>
              <td>${fmt(e.urgenza, 'stato')}</td>
              <td class="text-end fw-semibold">${fmt(e.totale_da_pagare, 'currency')}</td>
            </tr>`).join('')}
          </tbody>
        </table>` : '<div class="text-center py-4 text-muted">Nessuna fattura aperta</div>'}
      </div>
    </div>

    <!-- DDT non fatturati -->
    ${ddt.length ? `
    <div class="col-12">
      <div class="table-card">
        <div class="table-toolbar fw-semibold small">
          <i class="bi bi-truck me-2 text-warning"></i>DDT da Fatturare
        </div>
        <table class="table table-hover">
          <thead><tr><th>Codice DDT</th><th>Fornitore</th><th>Data</th><th>Righe aperte</th></tr></thead>
          <tbody>
            ${ddt.map(d => `<tr>
              <td><a href="#/ddt" class="fw-semibold text-decoration-none">${d.codice_ddt}</a></td>
              <td>${d.fornitore}</td>
              <td>${fmt(d.data_ricezione, 'date')}</td>
              <td><span class="badge bg-warning text-dark">${d.righe_non_fatturate}/${d.righe_totali}</span></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}
  </div>`;
}
