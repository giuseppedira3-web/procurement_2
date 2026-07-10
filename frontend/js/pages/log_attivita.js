import { api, getUtente } from '../api.js';
import { fmt, setHeaderActions } from '../utils.js';

const BADGE_AZIONE = {
  login:        'text-bg-info',
  creazione:    'text-bg-success',
  modifica:     'text-bg-warning',
  eliminazione: 'text-bg-danger',
};

export async function renderLogAttivita(container) {
  const utente = getUtente();
  if (!utente || utente.ruolo !== 'admin') {
    container.innerHTML = `<div class="alert alert-danger">
      <i class="bi bi-shield-lock me-2"></i>Sezione riservata agli amministratori.</div>`;
    return;
  }

  setHeaderActions(`
    <button class="btn btn-outline-primary btn-sm" id="btn-refresh-log">
      <i class="bi bi-arrow-clockwise me-1"></i>Aggiorna
    </button>`);
  document.getElementById('btn-refresh-log').onclick = () => renderLogAttivita(container);

  const logs = await api.logAttivita('?limit=300');

  container.innerHTML = `
    <div class="card">
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table table-hover table-sm align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th class="ps-3">Data e ora</th>
                <th>Utente</th>
                <th>Azione</th>
                <th>Percorso</th>
                <th class="pe-3">Esito</th>
              </tr>
            </thead>
            <tbody>
              ${logs.map(l => `
              <tr>
                <td class="ps-3 text-nowrap">${fmt(l.created_at, 'datetime')}</td>
                <td>${l.username ? `<span class="fw-semibold">${l.username}</span>` : fmt(null)}</td>
                <td><span class="badge ${BADGE_AZIONE[l.azione] || 'text-bg-secondary'}">${l.azione}</span></td>
                <td class="text-muted small font-monospace">${l.metodo} ${l.percorso}</td>
                <td class="pe-3"><span class="badge ${l.codice_stato < 400 ? 'text-bg-success' : 'text-bg-danger'}">${l.codice_stato}</span></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div class="card-footer text-muted small">${logs.length} operazioni registrate (max 300)</div>
    </div>`;
}
