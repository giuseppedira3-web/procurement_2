import { getUtente } from '../api.js';

// Le 4 categorie merceologiche core, stesso ordine/colore della dashboard.
const CATEGORIE_CORE = [
  { key: 'LAMIERA',    label: 'Lamiera',    icon: 'bi-square' },
  { key: 'MERCANTILE', label: 'Mercantile', icon: 'bi-bricks' },
  { key: 'TRAVI',       label: 'Travi',      icon: 'bi-distribute-vertical' },
  { key: 'TUBOLARE',   label: 'Tubolare',   icon: 'bi-record-circle' },
];

// Nota sulla logica di calcolo prevista per ciascuna categoria: ogni prodotto
// core ha una struttura di prezzo diversa, quindi la media ponderata degli
// ultimi 12 mesi non può limitarsi a mediare prezzo_unitario così com'è.
const NOTE_LOGICA = {
  LAMIERA: `Il prezzo di acquisto è negoziato direttamente per prodotto, senza
    scomposizione base/extra. La media ponderata (per kg) del prezzo_unitario
    è quindi già rappresentativa.`,
  MERCANTILE: `Il prezzo di acquisto è "base di mercato + extra di lavorazione"
    (extra specifico per prodotto/qualità, prodotti.prezzo_riferimento). Mediare
    il prezzo pieno mescolerebbe prodotti con extra diversi: la media ponderata
    va calcolata sulla sola componente base (prezzo_unitario − extra).`,
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

  CATEGORIE_CORE.forEach(c => renderCategoriaPane(container.querySelector(`#prezzi-${c.key}`), c));
}

function renderCategoriaPane(pane, categoria) {
  pane.innerHTML = `
    <div class="alert alert-secondary small mb-3">
      <i class="bi bi-info-circle me-2"></i>${NOTE_LOGICA[categoria.key]}
    </div>
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
