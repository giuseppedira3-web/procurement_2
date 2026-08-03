import { renderDashboard }    from './pages/dashboard.js';
import { renderPrezzi }       from './pages/prezzi.js';
import { renderFornitori }    from './pages/fornitori.js';
import { renderCategorie }    from './pages/categorie.js';
import { renderProdotti }     from './pages/prodotti.js';
import { renderConversioni }  from './pages/conversioni.js';
import { renderListino }      from './pages/listino.js';
import { renderOrdini }       from './pages/ordini.js';
import { renderDdt }          from './pages/ddt.js';
import { renderFatture }      from './pages/fatture.js';
import { renderVettori }      from './pages/vettori.js';
import { renderLogAttivita }  from './pages/log_attivita.js';
import { renderTickets }      from './pages/tickets.js';
import { setTitle, loading, toast, USER_COLORS } from './utils.js';
import { api, getUtente, setUtente, getDitta, setDitta } from './api.js';

const ROUTES = {
  '/':           { title: 'Dashboard',        render: renderDashboard },
  '/prezzi':     { title: 'Prezzi',           render: renderPrezzi },
  '/fornitori':  { title: 'Fornitori',        render: renderFornitori },
  '/categorie':  { title: 'Categorie Prodotto', render: renderCategorie },
  '/prodotti':   { title: 'Prodotti',         render: renderProdotti },
  '/conversioni':{ title: 'Conversioni Peso', render: renderConversioni },
  '/listino':    { title: 'Listino Prezzi',   render: renderListino },
  '/vettori':    { title: 'Vettori',           render: renderVettori },
  '/ordini':     { title: 'Ordini',           render: renderOrdini },
  '/ddt':        { title: 'DDT',              render: renderDdt },
  '/fatture':    { title: 'Fatture',          render: renderFatture },
  '/log-attivita': { title: 'Log Attività',   render: renderLogAttivita },
  '/tickets':       { title: 'Ticket',           render: renderTickets },
};

const content = document.getElementById('main-content');

async function handleRoute() {
  const hash = window.location.hash.replace('#', '') || '/';

  // Parse base path and optional id: /ordini/42 → base=/ordini, id=42
  const parts = hash.split('/').filter(Boolean);
  const base = '/' + (parts[0] || '');
  const id   = parts[1] ? (isNaN(parts[1]) ? parts[1] : Number(parts[1])) : null;

  // Update nav active state
  document.querySelectorAll('#sidebar .nav-link').forEach(a => {
    const r = a.dataset.route;
    a.classList.toggle('active', r === base || (r !== '/' && hash.startsWith(r)));
  });

  const route = ROUTES[base];
  if (!route) {
    content.innerHTML = '<div class="text-center py-5 text-muted"><h3>404</h3><p>Pagina non trovata</p></div>';
    return;
  }

  setTitle(route.title);
  loading(content);
  document.getElementById('header-actions').innerHTML = '';

  try {
    await route.render(content, id);
  } catch (e) {
    content.innerHTML = `<div class="alert alert-danger"><i class="bi bi-exclamation-triangle me-2"></i>${e.message}</div>`;
  }
}

// ── Login (senza password: solo rete locale) ──────────────────────────────
function applicaUtente() {
  const u = getUtente();
  const box = document.getElementById('utente-box');
  box.classList.toggle('d-none', !u);
  box.classList.toggle('d-flex', !!u);
  document.getElementById('nav-admin').classList.toggle('d-none', !u || u.ruolo !== 'admin');
  document.getElementById('nav-prezzi').classList.toggle('d-none', !u || u.ruolo !== 'admin');
  if (u) {
    document.getElementById('utente-nome').textContent = u.nome_completo || u.username;
    document.getElementById('utente-ruolo').textContent = u.ruolo;
    document.getElementById('utente-ruolo').className =
      `badge ${u.ruolo === 'admin' ? 'text-bg-primary' : 'text-bg-secondary'}`;
  }
  const color = u ? USER_COLORS[u.username] : null;
  box.style.setProperty('--user-color', color || '');
  box.classList.toggle('utente-tinted', !!color);
}

// ── Ditta attiva (Ditta1 / Ditta2) ──────────────────────────────────────────
function applicaDitta() {
  const attiva = getDitta();
  document.querySelectorAll('#ditta-switch button').forEach(b => {
    b.classList.toggle('active', b.dataset.ditta === attiva);
  });
  document.body.dataset.ditta = attiva;
}

const ROUTE_DOCUMENTI = ['/ordini', '/ddt', '/fatture'];

document.querySelectorAll('#ditta-switch button').forEach(btn => {
  btn.onclick = () => {
    if (btn.dataset.ditta === getDitta()) return;
    setDitta(btn.dataset.ditta);
    applicaDitta();
    const hash = window.location.hash.replace('#', '') || '/';
    const parts = hash.split('/').filter(Boolean);
    const base = '/' + (parts[0] || '');
    if (ROUTE_DOCUMENTI.includes(base) && parts[1]) {
      window.location.hash = '#' + base; // dettaglio documento: torna alla lista (hashchange → handleRoute)
    } else {
      handleRoute();
    }
    toast(`Passato a ${btn.textContent.trim()}`);
  };
});
applicaDitta();

async function mostraLogin() {
  const overlay = document.getElementById('login-overlay');
  overlay.classList.remove('d-none');
  const box = document.getElementById('login-utenti');
  box.innerHTML = '<div class="text-muted small">Caricamento utenti…</div>';
  try {
    const utenti = await api.auth.utenti();
    box.innerHTML = utenti.map(u => {
      const color = USER_COLORS[u.username];
      const cls = color ? 'btn login-user-btn' : 'btn btn-outline-primary';
      const style = color ? ` style="--user-color:${color};border-color:${color};color:${color}"` : '';
      return `
      <button class="${cls} d-flex justify-content-between align-items-center" data-username="${u.username}"${style}>
        <span><i class="bi bi-person me-2"></i>${u.nome_completo || u.username}</span>
        <span class="badge ${u.ruolo === 'admin' ? 'text-bg-primary' : 'text-bg-secondary'}">${u.ruolo}</span>
      </button>`;
    }).join('');
    const eseguiLogin = async (username, pwd) => {
      const utente = await api.auth.login(username, pwd);
      setUtente(utente);
      overlay.classList.add('d-none');
      applicaUtente();
      handleRoute();
      toast(`Benvenuto, ${utente.nome_completo || utente.username}`);
    };
    box.querySelectorAll('button[data-username]').forEach((btn, i) => {
      const utente = utenti[i];
      btn.onclick = () => {
        const username = btn.dataset.username;
        const nome = btn.querySelector('span').textContent.trim();
        if (!utente.richiede_password) {
          eseguiLogin(username, '').catch(e => toast(e.message, 'danger'));
          return;
        }
        box.innerHTML = `
          <p class="text-muted small mb-2">Password per <strong>${nome}</strong></p>
          <input type="password" class="form-control form-control-sm mb-2" id="pwd-input" placeholder="Password" />
          <div class="d-grid gap-2">
            <button class="btn btn-primary btn-sm" id="btn-pwd-ok">
              <i class="bi bi-box-arrow-in-right me-1"></i>Accedi
            </button>
            <button class="btn btn-link btn-sm text-muted p-0" id="btn-pwd-back">← Torna alla scelta utente</button>
          </div>
          <div id="pwd-error" class="alert alert-danger small mt-2 py-1 d-none"></div>`;
        document.getElementById('pwd-input').focus();
        document.getElementById('btn-pwd-back').onclick = () => mostraLogin();
        const doLogin = async () => {
          const pwd = document.getElementById('pwd-input').value;
          try {
            await eseguiLogin(username, pwd);
          } catch (e) {
            const err = document.getElementById('pwd-error');
            err.textContent = e.message;
            err.classList.remove('d-none');
          }
        };
        document.getElementById('btn-pwd-ok').onclick = doLogin;
        document.getElementById('pwd-input').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
      };
    });
  } catch (e) {
    box.innerHTML = `<div class="alert alert-danger small mb-0">${e.message}</div>`;
  }
}

document.getElementById('btn-logout').onclick = () => {
  setUtente(null);
  window.location.hash = '#/';
  applicaUtente();
  mostraLogin();
};

// ── Avvio ──────────────────────────────────────────────────────────────────
window.addEventListener('hashchange', handleRoute);
if (getUtente()) {
  applicaUtente();
  handleRoute();
} else {
  mostraLogin();
}

// Alt+A → Aggiungi Riga   Alt+S → Salva (modal)
document.addEventListener('keydown', e => {
  if (!e.altKey) return;
  if (e.key === 'a' || e.key === 'A') {
    const btn = document.getElementById('btn-add-riga');
    if (btn) { e.preventDefault(); btn.click(); }
  } else if (e.key === 's' || e.key === 'S') {
    const btn = document.getElementById('modal-save-btn');
    if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
  }
});
