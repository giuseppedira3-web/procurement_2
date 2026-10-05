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
  TRAVI: `Stessa struttura del Mercantile: base di mercato più extra di
    lavorazione per profilo/qualità (prodotti.prezzo_riferimento), ma la base
    (categorie_prodotto.base_cat_0…5) varia per 6 classi di profilo (Cat 0-5)
    invece che un unico valore. La media ponderata (per kg) sottrae l'extra dal
    prezzo netto (+ trasporto) per isolare la base — la componente che si
    muove nel tempo, quindi comparabile mese su mese. Le prime 2 tabelle sono
    aggregate su tutte le categorie insieme; le altre 2 separano per Cat 0-5,
    dato che la base cambia parecchio da una classe all'altra.`,
  TUBOLARE: `Ogni profilo ha un prezzo di listino assoluto (materiale + grado di
    lavorazione), senza una scomposizione base/extra come Mercantile/Travi: non
    c'è un'unica componente "comparabile" da isolare. Si normalizza quindi ogni
    acquisto rispetto al profilo di riferimento del settore — Tubo Quadro 40x40x3
    (Q403 grezzo, Q403Z zincato) — sottraendo il delta di listino fra il profilo
    comprato e il riferimento (entrambi in €/kg, convertiti con conversioni_peso;
    prezzo di listino = base + extra).
    Il listino usato è quello in vigore alla data di ciascun ordine, secondo la
    decorrenza impostata in Listino Prezzi; ordini fuori da qualunque decorrenza,
    o profili privi di prezzo/conversione, sono esclusi dalla media del prezzo
    ma restano nelle quantità.`,
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

  const RENDER_PANE = { MERCANTILE: renderMercantilePane, TRAVI: renderTraviPane, TUBOLARE: renderTubolarePane };
  CATEGORIE_CORE.forEach(c => {
    const pane = container.querySelector(`#prezzi-${c.key}`);
    (RENDER_PANE[c.key] || renderCategoriaPane)(pane, c);
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

// Somma dei kg e media ponderata del prezzo (per kg) di un gruppo, su un
// sottoinsieme di mesi — tipicamente i 12 mesi completi (esclude il corrente,
// parziale). Pesare per i kg del mese evita che un mese con pochi acquisti
// conti quanto uno con acquisti massicci.
function totaliPesati(datiQta, datiPrezzo, mesiSet, chiave) {
  let sumKg = 0, sumNum = 0;
  for (const m of mesiSet) {
    const kg = datiQta[m.key]?.[chiave] || 0;
    const prezzo = datiPrezzo[m.key]?.[chiave];
    sumKg += kg;
    if (prezzo != null) sumNum += kg * prezzo;
  }
  return { totKg: sumKg, mediaPrezzo: sumKg > 0 ? sumNum / sumKg : null };
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
    type: 'line',
  });

  // 12 mesi completi: esclude l'ultimo (mese corrente, parziale).
  const meseCorrente = mesi[mesi.length - 1].key;
  const mesiCompleti = mesi.filter(m => m.key !== meseCorrente);

  for (const [tipo, idTot, idPrezzo] of [
    ['GREZZO', 'mercantile-tot-grezzo', 'mercantile-prezzo-grezzo'],
    ['ZINCATO', 'mercantile-tot-zincato', 'mercantile-prezzo-zincato'],
  ]) {
    const { totKg, mediaPrezzo } = totaliPesati(datiQta, datiPrezzo, mesiCompleti, tipo);
    pane.querySelector(`#${idTot}`).innerHTML = fmt(totKg, 'peso_t');
    pane.querySelector(`#${idPrezzo}`).innerHTML = mediaPrezzo != null ? fmt(mediaPrezzo, 'eur_kg') : '—';
  }
}

// --- Travi: quantità e prezzo medio ponderato per mese (13 mesi) — 2      ---
// --- tabelle aggregate + 2 divise per classe di profilo (Cat 0-5),       ---
// --- filtrabili per ditta.                                              ---

const CAT_TRAVI = [
  { key: 0, label: 'Cat 0', color: '#2a78d6' },
  { key: 1, label: 'Cat 1', color: '#eb6834' },
  { key: 2, label: 'Cat 2', color: '#1baf7a' },
  { key: 3, label: 'Cat 3', color: '#eda100' },
  { key: 4, label: 'Cat 4', color: '#e87ba4' },
  { key: 5, label: 'Cat 5', color: '#008300' },
];

function renderTraviPane(pane, categoria) {
  const serieAggregata = [{ key: 'TOT', label: categoria.label, color: categoria.color }];

  const chartBlock = (chartId, titolo, statHtml) => `
    <div class="row g-3 mb-3">
      <div class="col-lg-9">
        <div class="table-card p-3">
          <div class="fw-semibold small mb-2">
            <i class="bi ${categoria.icon} me-2" style="color:${categoria.color}"></i>${titolo}
          </div>
          <div id="${chartId}"></div>
          <div class="small text-muted mt-2">Il mese corrente è parziale.</div>
        </div>
      </div>
      <div class="col-lg-3">${statHtml}</div>
    </div>`;

  const statAggregata = idValue => `
    <div class="stat-card h-100 d-flex flex-column justify-content-center">
      <div class="stat-value text-dark fs-5" id="${idValue}">—</div>
      <div class="stat-label">Totale/media 12 mesi</div>
    </div>`;

  pane.innerHTML = `
    <div class="alert alert-secondary small mb-3">
      <i class="bi bi-info-circle me-2"></i>${NOTE_LOGICA[categoria.key]}
    </div>
    <div class="d-flex align-items-center gap-2 mb-3">
      <label class="small fw-semibold mb-0" for="travi-ditta">Ditta</label>
      <select class="form-select form-select-sm w-auto" id="travi-ditta">
        <option value="">1 + 2</option>
        <option value="ditta1">Ditta 1</option>
        <option value="ditta2">Ditta 2</option>
      </select>
    </div>
    ${chartBlock('travi-chart-qta-agg', 'Quantità Acquistate — Travi, tutte le categorie (t/mese)', statAggregata('travi-tot-qta'))}
    ${chartBlock('travi-chart-prezzo-agg', 'Prezzo Medio Ponderato — Travi, tutte le categorie (€/kg, netto − extra)', statAggregata('travi-tot-prezzo'))}
    <div class="table-card p-3 mb-3">
      <div class="fw-semibold small mb-2">
        <i class="bi ${categoria.icon} me-2" style="color:${categoria.color}"></i>Quantità Acquistate — Travi per Categoria (t/mese)
      </div>
      <div id="travi-chart-qta-cat"></div>
      <div class="small text-muted mt-2">Il mese corrente è parziale.</div>
    </div>
    <div class="table-card p-3">
      <div class="fw-semibold small mb-2">
        <i class="bi ${categoria.icon} me-2" style="color:${categoria.color}"></i>Prezzo Medio Ponderato — Travi per Categoria (€/kg, netto − extra)
      </div>
      <div id="travi-chart-prezzo-cat"></div>
      <div class="small text-muted mt-2">Il mese corrente è parziale.</div>
    </div>`;

  const select = pane.querySelector('#travi-ditta');
  const carica = () => caricaTravi(pane, serieAggregata, select.value || undefined);
  select.addEventListener('change', carica);
  carica();
}

async function caricaTravi(pane, serieAggregata, ditta) {
  const mesi = ultimiMesi(13);
  const [righeAgg, righeCat] = await Promise.all([
    api.dashboard.quantitaPrezzoMensile({ categoria: 'TRAVI', raggruppaPer: 'nessuno', mesi: 13, ditta }),
    api.dashboard.quantitaPrezzoMensile({ categoria: 'TRAVI', raggruppaPer: 'categoria_trave', mesi: 13, ditta }),
  ]);

  const datiQtaAgg = {}, datiPrezzoAgg = {};
  for (const r of righeAgg) {
    (datiQtaAgg[r.mese] ??= {}).TOT = Number(r.peso_kg);
    (datiPrezzoAgg[r.mese] ??= {}).TOT = Number(r.prezzo_medio_kg);
  }
  const datiQtaCat = {}, datiPrezzoCat = {};
  for (const r of righeCat) {
    (datiQtaCat[r.mese] ??= {})[r.categoria_trave] = Number(r.peso_kg);
    (datiPrezzoCat[r.mese] ??= {})[r.categoria_trave] = Number(r.prezzo_medio_kg);
  }

  renderGroupedBarChart(pane.querySelector('#travi-chart-qta-agg'), {
    series: serieAggregata, xValues: mesi, data: datiQtaAgg,
    formatValue: v => fmt(v, 'peso_t'), showValues: true,
  });
  renderGroupedBarChart(pane.querySelector('#travi-chart-prezzo-agg'), {
    series: serieAggregata, xValues: mesi, data: datiPrezzoAgg,
    formatValue: v => fmt(v, 'eur_kg'), showValues: true, type: 'line',
  });
  renderGroupedBarChart(pane.querySelector('#travi-chart-qta-cat'), {
    series: CAT_TRAVI, xValues: mesi, data: datiQtaCat,
    formatValue: v => fmt(v, 'peso_t'),
  });
  renderGroupedBarChart(pane.querySelector('#travi-chart-prezzo-cat'), {
    series: CAT_TRAVI, xValues: mesi, data: datiPrezzoCat,
    formatValue: v => fmt(v, 'eur_kg'), type: 'line',
  });

  const meseCorrente = mesi[mesi.length - 1].key;
  const mesiCompleti = mesi.filter(m => m.key !== meseCorrente);
  const { totKg, mediaPrezzo } = totaliPesati(datiQtaAgg, datiPrezzoAgg, mesiCompleti, 'TOT');
  pane.querySelector('#travi-tot-qta').innerHTML = fmt(totKg, 'peso_t');
  pane.querySelector('#travi-tot-prezzo').innerHTML = mediaPrezzo != null ? fmt(mediaPrezzo, 'eur_kg') : '—';
}

// --- Tubolare: quantità e prezzo medio ponderato per mese (13 mesi), ---
// --- normalizzati su Q403/Q403Z, separati per grezzo/zincato.         ---

function renderTubolarePane(pane, categoria) {
  pane.innerHTML = `
    <div class="alert alert-secondary small mb-3">
      <i class="bi bi-info-circle me-2"></i>${NOTE_LOGICA[categoria.key]}
    </div>
    <div class="d-flex align-items-center gap-2 mb-3">
      <label class="small fw-semibold mb-0" for="tubolare-ditta">Ditta</label>
      <select class="form-select form-select-sm w-auto" id="tubolare-ditta">
        <option value="">1 + 2</option>
        <option value="ditta1">Ditta 1</option>
        <option value="ditta2">Ditta 2</option>
      </select>
    </div>
    <div class="row g-3 mb-3">
      <div class="col-lg-9">
        <div class="table-card p-3">
          <div class="fw-semibold small mb-2">
            <i class="bi ${categoria.icon} me-2" style="color:${categoria.color}"></i>Quantità Acquistate — Tubolare (t/mese)
          </div>
          <div id="tubolare-chart-qta"></div>
          <div class="small text-muted mt-2">Il mese corrente è parziale.</div>
        </div>
      </div>
      <div class="col-lg-3">
        <div class="stat-card h-100 d-flex flex-column justify-content-center gap-3">
          <div>
            <div class="stat-value text-dark fs-5" id="tubolare-tot-grezzo">—</div>
            <div class="stat-label">Grezzo — tot. 12 mesi</div>
          </div>
          <div>
            <div class="stat-value text-dark fs-5" id="tubolare-tot-zincato">—</div>
            <div class="stat-label">Zincato — tot. 12 mesi</div>
          </div>
        </div>
      </div>
    </div>
    <div class="row g-3 mb-3">
      <div class="col-lg-9">
        <div class="table-card p-3">
          <div class="fw-semibold small mb-2">
            <i class="bi ${categoria.icon} me-2" style="color:${categoria.color}"></i>Prezzo Medio Ponderato — Tubolare (€/kg, normalizzato su Q403/Q403Z)
          </div>
          <div id="tubolare-chart-prezzo"></div>
          <div class="small text-muted mt-2">Il mese corrente è parziale.</div>
        </div>
      </div>
      <div class="col-lg-3">
        <div class="stat-card h-100 d-flex flex-column justify-content-center gap-3">
          <div>
            <div class="stat-value text-dark fs-5" id="tubolare-prezzo-grezzo">—</div>
            <div class="stat-label">Grezzo — media 12 mesi</div>
          </div>
          <div>
            <div class="stat-value text-dark fs-5" id="tubolare-prezzo-zincato">—</div>
            <div class="stat-label">Zincato — media 12 mesi</div>
          </div>
        </div>
      </div>
    </div>`;

  const select = pane.querySelector('#tubolare-ditta');
  const carica = () => caricaTubolare(pane, select.value || undefined);
  select.addEventListener('change', carica);
  carica();
}

async function caricaTubolare(pane, ditta) {
  const mesi = ultimiMesi(13);
  const rows = await api.dashboard.tubolareMensile({ mesi: 13, ditta });

  const datiQta = {}, datiPrezzo = {};
  for (const r of rows) {
    const tipo = r.zincato ? 'ZINCATO' : 'GREZZO';
    (datiQta[r.mese] ??= {})[tipo] = Number(r.peso_kg);
    (datiPrezzo[r.mese] ??= {})[tipo] = Number(r.prezzo_medio_kg);
  }

  renderGroupedBarChart(pane.querySelector('#tubolare-chart-qta'), {
    series: ZINCATO_SERIES,
    xValues: mesi,
    data: datiQta,
    formatValue: v => fmt(v, 'peso_t'),
    showValues: true,
  });
  renderGroupedBarChart(pane.querySelector('#tubolare-chart-prezzo'), {
    series: ZINCATO_SERIES,
    xValues: mesi,
    data: datiPrezzo,
    formatValue: v => fmt(v, 'eur_kg'),
    showValues: true,
    type: 'line',
  });

  const meseCorrente = mesi[mesi.length - 1].key;
  const mesiCompleti = mesi.filter(m => m.key !== meseCorrente);

  for (const [tipo, idTot, idPrezzo] of [
    ['GREZZO', 'tubolare-tot-grezzo', 'tubolare-prezzo-grezzo'],
    ['ZINCATO', 'tubolare-tot-zincato', 'tubolare-prezzo-zincato'],
  ]) {
    const { totKg, mediaPrezzo } = totaliPesati(datiQta, datiPrezzo, mesiCompleti, tipo);
    pane.querySelector(`#${idTot}`).innerHTML = fmt(totKg, 'peso_t');
    pane.querySelector(`#${idPrezzo}`).innerHTML = mediaPrezzo != null ? fmt(mediaPrezzo, 'eur_kg') : '—';
  }
}
