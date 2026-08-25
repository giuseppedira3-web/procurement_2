import { api, getUtente } from '../api.js';
import { fmt } from '../utils.js';
import { renderGroupedBarChart } from '../components.js';

// Le 4 categorie merceologiche core, stesso ordine/colore della dashboard.
const CATEGORIE_CORE = [
  { key: 'LAMIERA',    label: 'Lamiera',    icon: 'bi-square',                  color: '#2a78d6' },
  { key: 'MERCANTILE', label: 'Mercantile', icon: 'bi-bricks',                  color: '#eb6834' },
  { key: 'TRAVI',       label: 'Travi',      icon: 'bi-distribute-vertical',    color: '#1baf7a' },
  { key: 'TUBOLARE',   label: 'Tubolare',   icon: 'bi-record-circle',           color: '#eda100' },
];

// Ultimi n mesi, mese corrente incluso, dal più vecchio al più recente.
function ultimiMesi(n) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' }).replace('.', '');
    return { key, label };
  });
}

// Nota sulla logica di calcolo prevista per ciascuna categoria: ogni prodotto
// core ha una struttura di prezzo diversa, quindi la media ponderata degli
// ultimi 12 mesi non può limitarsi a mediare prezzo_unitario così com'è.
const NOTE_LOGICA = {
  LAMIERA: `Il prezzo di acquisto è negoziato direttamente per prodotto, senza
    scomposizione base/extra. La media ponderata (per kg) del prezzo_unitario
    è quindi già rappresentativa.`,
  MERCANTILE: `Il prezzo di acquisto è "base di mercato + extra di lavorazione"
    (extra specifico per prodotto/qualità, prodotti.prezzo_riferimento), a cui si
    aggiungono zincatura e trasporto quando presenti. La media ponderata (per kg)
    è calcolata sul prezzo netto (base + extra + zincatura/trasporto) meno l'extra —
    l'unica componente non comparabile fra prodotti diversi — e separa gli ordini
    zincati dai grezzi (ordini.zincatura), poiché il costo di zincatura non è
    confrontabile con quello del grezzo. Le varianti zincate, essendo lo stesso
    profilo del gemello grezzo, ereditano l'extra da quest'ultimo se non ne hanno
    uno proprio a listino; se manca anche quello, la riga è esclusa dalla media
    (ma resta nelle quantità).`,
  TRAVI: `Stessa struttura del Mercantile: base di mercato comune (€/kg) più
    extra di lavorazione per profilo/qualità. La media ponderata va calcolata
    sulla componente base, non sul prezzo pieno.`,
  TUBOLARE: `Il listino è espresso a tonnellata, ma le righe ordine sono spesso
    in metri o kg. Prima di mediare occorre riportare ogni riga a €/t tramite
    il peso unitario del profilo (conversioni_peso), altrimenti profili con
    peso/metro diverso non sono confrontabili.`,
};

export async function renderPrezzi(container) {
  const utente = getUtente();
  if (!utente || utente.ruolo !== 'admin') {
    container.innerHTML = `<div class="alert alert-danger">
      <i class="bi bi-shield-lock me-2"></i>Sezione riservata agli amministratori.</div>`;
    return;
  }

  container.innerHTML = `
    <ul class="nav nav-tabs mb-3">
      ${CATEGORIE_CORE.map((c, i) => `
        <li class="nav-item">
          <button class="nav-link ${i === 0 ? 'active' : ''}" data-bs-toggle="tab" data-bs-target="#prezzi-${c.key}" type="button">
            <i class="bi ${c.icon} me-1"></i>${c.label}
          </button>
        </li>`).join('')}
    </ul>
    <div class="tab-content">
      ${CATEGORIE_CORE.map((c, i) => `
        <div class="tab-pane fade ${i === 0 ? 'show active' : ''}" id="prezzi-${c.key}"></div>`).join('')}
    </div>`;

  CATEGORIE_CORE.forEach(c => {
    const pane = container.querySelector(`#prezzi-${c.key}`);
    if (c.key === 'MERCANTILE') renderMercantilePane(pane, c);
    else renderCategoriaPane(pane, c);
  });
}

function renderCategoriaPane(pane, categoria) {
  pane.innerHTML = `
    <div class="alert alert-secondary small mb-3">
      <i class="bi bi-info-circle me-2"></i>${NOTE_LOGICA[categoria.key]}
    </div>
    ${prezzoMedioPlaceholder(categoria)}`;
}

function prezzoMedioPlaceholder(categoria) {
  return `
    <div class="table-card">
      <div class="table-toolbar fw-semibold small">
        <i class="bi ${categoria.icon} me-2"></i>${categoria.label} — Prezzo Medio Ponderato (ultimi 12 mesi)
      </div>
      <div class="text-center py-5 text-muted">
        <i class="bi bi-hourglass-split fs-3 d-block mb-2"></i>
        Logica di calcolo da definire per questa categoria
      </div>
    </div>`;
}

// --- Mercantile: quantità e prezzo medio ponderato per mese (13 mesi), ---
// --- separati per grezzo/zincato, filtrabili per ditta.                ---

const ZINCATO_SERIES = [
  { key: 'GREZZO',  label: 'Grezzo',  color: '#eb6834' },
  { key: 'ZINCATO', label: 'Zincato', color: '#9aa5b1' },
];

function renderMercantilePane(pane, categoria) {
  pane.innerHTML = `
    <div class="alert alert-secondary small mb-3">
      <i class="bi bi-info-circle me-2"></i>${NOTE_LOGICA[categoria.key]}
    </div>
    <div class="d-flex align-items-center gap-2 mb-3">
      <label class="small fw-semibold mb-0" for="mercantile-ditta">Ditta</label>
      <select class="form-select form-select-sm w-auto" id="mercantile-ditta">
        <option value="">1 + 2</option>
        <option value="ditta1">Ditta 1</option>
        <option value="ditta2">Ditta 2</option>
      </select>
    </div>
    <div class="row g-3 mb-3">
      <div class="col-lg-9">
        <div class="table-card p-3">
          <div class="fw-semibold small mb-2">
            <i class="bi ${categoria.icon} me-2" style="color:${categoria.color}"></i>Quantità Acquistate — Mercantile (t/mese)
          </div>
          <div id="mercantile-chart-qta"></div>
          <div class="small text-muted mt-2">Il mese corrente è parziale.</div>
        </div>
      </div>
      <div class="col-lg-3">
        <div class="stat-card h-100 d-flex flex-column justify-content-center gap-3">
          <div>
            <div class="stat-value text-dark fs-5" id="mercantile-tot-grezzo">—</div>
            <div class="stat-label">Grezzo — tot. 12 mesi</div>
          </div>
          <div>
            <div class="stat-value text-dark fs-5" id="mercantile-tot-zincato">—</div>
            <div class="stat-label">Zincato — tot. 12 mesi</div>
          </div>
        </div>
      </div>
    </div>
    <div class="row g-3 mb-3">
      <div class="col-lg-9">
        <div class="table-card p-3">
          <div class="fw-semibold small mb-2">
            <i class="bi ${categoria.icon} me-2" style="color:${categoria.color}"></i>Prezzo Medio Ponderato — Mercantile (€/kg, netto − extra)
          </div>
          <div id="mercantile-chart-prezzo"></div>
          <div class="small text-muted mt-2">Il mese corrente è parziale.</div>
        </div>
      </div>
      <div class="col-lg-3">
        <div class="stat-card h-100 d-flex flex-column justify-content-center gap-3">
          <div>
            <div class="stat-value text-dark fs-5" id="mercantile-prezzo-grezzo">—</div>
            <div class="stat-label">Grezzo — media 12 mesi</div>
          </div>
          <div>
            <div class="stat-value text-dark fs-5" id="mercantile-prezzo-zincato">—</div>
            <div class="stat-label">Zincato — media 12 mesi</div>
          </div>
        </div>
      </div>
    </div>`;

  const select = pane.querySelector('#mercantile-ditta');
  const carica = () => caricaMercantile(pane, select.value || undefined);
  select.addEventListener('change', carica);
  carica();
}

async function caricaMercantile(pane, ditta) {
  const mesi = ultimiMesi(13);
  const rows = await api.dashboard.quantitaPrezzoMensile({ categoria: 'MERCANTILE', mesi: 13, ditta });

  const datiQta = {}, datiPrezzo = {};
  for (const r of rows) {
    const tipo = r.zincato ? 'ZINCATO' : 'GREZZO';
    (datiQta[r.mese] ??= {})[tipo] = Number(r.peso_kg);
    (datiPrezzo[r.mese] ??= {})[tipo] = Number(r.prezzo_medio_kg);
  }

  renderGroupedBarChart(pane.querySelector('#mercantile-chart-qta'), {
    series: ZINCATO_SERIES,
    xValues: mesi,
    data: datiQta,
    formatValue: v => fmt(v, 'peso_t'),
    showValues: true,
  });
  renderGroupedBarChart(pane.querySelector('#mercantile-chart-prezzo'), {
    series: ZINCATO_SERIES,
    xValues: mesi,
    data: datiPrezzo,
    formatValue: v => fmt(v, 'eur_kg'),
    showValues: true,
  });

  // 12 mesi completi: esclude l'ultimo (mese corrente, parziale). Il prezzo medio
  // si ricostruisce pesando i prezzi mensili per i kg del mese (non la semplice
  // media dei 13 valori mensili), altrimenti mesi con pochi acquisti pesano quanto
  // mesi con acquisti massicci.
  const meseCorrente = mesi[mesi.length - 1].key;
  const mesiCompleti = mesi.filter(m => m.key !== meseCorrente);

  for (const [tipo, idTot, idPrezzo] of [
    ['GREZZO', 'mercantile-tot-grezzo', 'mercantile-prezzo-grezzo'],
    ['ZINCATO', 'mercantile-tot-zincato', 'mercantile-prezzo-zincato'],
  ]) {
    let sumKg = 0, sumNum = 0;
    for (const m of mesiCompleti) {
      const kg = datiQta[m.key]?.[tipo] || 0;
      const prezzo = datiPrezzo[m.key]?.[tipo];
      sumKg += kg;
      if (prezzo != null) sumNum += kg * prezzo;
    }
    pane.querySelector(`#${idTot}`).innerHTML = fmt(sumKg, 'peso_t');
    pane.querySelector(`#${idPrezzo}`).innerHTML = sumKg > 0 ? fmt(sumNum / sumKg, 'eur_kg') : '—';
  }
}
