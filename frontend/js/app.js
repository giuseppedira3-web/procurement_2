import { renderDashboard }    from './pages/dashboard.js';
import { renderFornitori }    from './pages/fornitori.js';
import { renderCategorie }    from './pages/categorie.js';
import { renderProdotti }     from './pages/prodotti.js';
import { renderConversioni }  from './pages/conversioni.js';
import { renderListino }      from './pages/listino.js';
import { renderOrdini }       from './pages/ordini.js';
import { renderDdt }          from './pages/ddt.js';
import { renderFatture }      from './pages/fatture.js';
import { renderVettori }      from './pages/vettori.js';
import { setTitle, loading }  from './utils.js';

const ROUTES = {
  '/':           { title: 'Dashboard',        render: renderDashboard },
  '/fornitori':  { title: 'Fornitori',        render: renderFornitori },
  '/categorie':  { title: 'Categorie Prodotto', render: renderCategorie },
  '/prodotti':   { title: 'Prodotti',         render: renderProdotti },
  '/conversioni':{ title: 'Conversioni Peso', render: renderConversioni },
  '/listino':    { title: 'Listino Prezzi',   render: renderListino },
  '/vettori':    { title: 'Vettori',           render: renderVettori },
  '/ordini':     { title: 'Ordini',           render: renderOrdini },
  '/ddt':        { title: 'DDT',              render: renderDdt },
  '/fatture':    { title: 'Fatture',          render: renderFatture },
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

window.addEventListener('hashchange', handleRoute);
handleRoute();

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
