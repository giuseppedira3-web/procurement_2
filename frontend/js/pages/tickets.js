import { api, getUtente } from '../api.js';
import { setHeaderActions, loading, toast, fmt } from '../utils.js';

export async function renderTickets(container) {
  const utente = getUtente();
  const isAdmin = utente?.ruolo === 'admin';

  setHeaderActions(`
    <button class="btn btn-primary btn-sm" id="btn-nuovo-ticket">
      <i class="bi bi-plus-lg me-1"></i>Nuovo Ticket
    </button>`);

  await disegna(container, isAdmin);
  document.getElementById('btn-nuovo-ticket').onclick = () => mostraForm(container, isAdmin);
}

async function disegna(container, isAdmin) {
  loading(container);
  try {
    const tutti = await api.get('/tickets/');
    const aperti = tutti.filter(t => t.status === 'aperto');
    const chiusi = tutti.filter(t => t.status === 'chiuso');

    container.innerHTML = `
      <h6 class="text-uppercase text-muted small fw-semibold mb-3">
        <i class="bi bi-ticket me-1"></i>Ticket Aperti
        <span class="badge text-bg-danger ms-1">${aperti.length}</span>
      </h6>
      ${aperti.length
        ? aperti.map(t => cardAperto(t, isAdmin)).join('')
        : '<p class="text-muted small">Nessun ticket aperto.</p>'}
      <hr class="my-4">
      <h6 class="text-uppercase text-muted small fw-semibold mb-3">
        <i class="bi bi-check2-all me-1"></i>Ticket Chiusi
        <span class="badge text-bg-secondary ms-1">${chiusi.length}</span>
      </h6>
      ${chiusi.length
        ? chiusi.map(t => cardChiuso(t)).join('')
        : '<p class="text-muted small">Nessun ticket chiuso.</p>'}`;

    if (isAdmin) {
      container.querySelectorAll('[data-chiudi]').forEach(btn => {
        btn.onclick = async () => {
          btn.disabled = true;
          try {
            await api.patch(`/tickets/${btn.dataset.chiudi}`, { status: 'chiuso' });
            toast('Ticket chiuso');
            await disegna(container, isAdmin);
          } catch (e) { toast(e.message, 'danger'); btn.disabled = false; }
        };
      });
    }
  } catch (e) {
    container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
  }
}

function cardAperto(t, isAdmin) {
  const btnChiudi = isAdmin
    ? `<button class="btn btn-outline-success btn-sm flex-shrink-0" data-chiudi="${t.id}"><i class="bi bi-check-lg me-1"></i>Chiudi</button>`
    : '<span class="badge text-bg-warning align-self-start">aperto</span>';
  return `
    <div class="card mb-2">
      <div class="card-body py-2 px-3">
        <div class="d-flex justify-content-between align-items-start gap-3">
          <div class="flex-grow-1">
            <div class="fw-semibold">${t.titolo}</div>
            <div class="text-muted small mt-1" style="white-space:pre-wrap">${t.testo}</div>
            <div class="text-muted small mt-2">
              <i class="bi bi-person me-1"></i>${t.username || 'Anonimo'}
              &middot; ${fmt(t.created_at, 'datetime')}
            </div>
          </div>
          ${btnChiudi}
        </div>
      </div>
    </div>`;
}

function cardChiuso(t) {
  return `
    <div class="card mb-2 border-0 bg-light">
      <div class="card-body py-2 px-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
        <span class="text-muted">${t.titolo}</span>
        <div class="d-flex align-items-center gap-2">
          <span class="text-muted small">
            <i class="bi bi-person me-1"></i>${t.username || 'Anonimo'}
            &middot; ${fmt(t.created_at, 'datetime')}
          </span>
          <span class="badge text-bg-secondary">chiuso</span>
        </div>
      </div>
    </div>`;
}

function mostraForm(container, isAdmin) {
  if (document.getElementById('ticket-form-inline')) return;
  const wrap = document.createElement('div');
  wrap.id = 'ticket-form-inline';
  wrap.innerHTML = `
    <div class="card mb-4 border-primary">
      <div class="card-body">
        <h6 class="card-title mb-3"><i class="bi bi-pencil me-2"></i>Nuovo Ticket</h6>
        <div class="mb-2">
          <input type="text" class="form-control form-control-sm" id="tk-titolo" placeholder="Titolo" maxlength="200" />
        </div>
        <div class="mb-3">
          <textarea class="form-control form-control-sm" id="tk-testo" rows="3"
                    placeholder="Descrivi la richiesta o il suggerimento…"></textarea>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-primary btn-sm" id="tk-submit">
            <i class="bi bi-send me-1"></i>Invia
          </button>
          <button class="btn btn-outline-secondary btn-sm" id="tk-annulla">Annulla</button>
        </div>
      </div>
    </div>`;

  container.prepend(wrap);
  document.getElementById('tk-titolo').focus();
  document.getElementById('tk-annulla').onclick = () => wrap.remove();

  const doSubmit = async () => {
    const titolo = document.getElementById('tk-titolo').value.trim();
    const testo  = document.getElementById('tk-testo').value.trim();
    if (!titolo) { toast('Inserisci un titolo', 'warning'); return; }
    if (!testo)  { toast('Inserisci una descrizione', 'warning'); return; }
    const btn = document.getElementById('tk-submit');
    btn.disabled = true;
    try {
      await api.post('/tickets/', { titolo, testo });
      wrap.remove();
      toast('Ticket inviato');
      await disegna(container, isAdmin);
    } catch (e) { toast(e.message, 'danger'); btn.disabled = false; }
  };
  document.getElementById('tk-submit').onclick = doSubmit;
}
