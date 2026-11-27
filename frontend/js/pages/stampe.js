import { api, getUtente, getDitta } from '../api.js';

// jsPDF + autoTable si caricano solo alla prima generazione di una stampa.
const JSPDF_URL     = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const AUTOTABLE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';

const NOME_DITTA = { ditta1: 'ILF', ditta2: 'SRL' };

const nTon = v => new Intl.NumberFormat('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(Number(v || 0) / 1000);
const nEur = v => new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v || 0));
const nNum = v => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 3 }).format(Number(v || 0));
const dataIt = d => (d ? new Date(d + 'T00:00:00').toLocaleDateString('it-IT') : '');

// ── Definizione delle stampe ────────────────────────────────────────────────
// filtri: quali filtri sono applicabili; build(dati) → { head, body, foot, align, stili }
function colonneTotali() {
  return ['Arrivato (t)', 'Ordinato tot. (t)', 'Residuo (t)', 'Arrivato (€)', 'Ordinato tot. (€)', 'Residuo (€)'];
}

function celleTotali(r) {
  const pa = Number(r.peso_arrivato_kg), pr = Number(r.peso_residuo_kg);
  const ia = Number(r.importo_arrivato), ir = Number(r.importo_residuo);
  return [nTon(pa), nTon(pa + pr), nTon(pr), nEur(ia), nEur(ia + ir), nEur(ir)];
}

function sommaTotali(righe) {
  const t = { peso_arrivato_kg: 0, peso_residuo_kg: 0, importo_arrivato: 0, importo_residuo: 0 };
  for (const r of righe) for (const k of Object.keys(t)) t[k] += Number(r[k] || 0);
  return t;
}

const STAMPE = {
  'riepilogo-fornitore': {
    titolo: 'Riepilogo per fornitore',
    descrizione: 'Materiale arrivato, ordinato totale (arrivato + da arrivare) e residuo ordini, per fornitore.',
    filtri: ['fornitore', 'categoria', 'date'],
    landscape: true,
    async carica(f) {
      const righe = await api.dashboard.reportOrdini({ raggruppa_per: 'fornitore', ...f });
      const tot = sommaTotali(righe);
      return {
        head: ['Fornitore', 'Ordini', ...colonneTotali()],
        body: righe.map(r => [r.fornitore, r.num_ordini, ...celleTotali(r)]),
        foot: ['TOTALE', '', ...celleTotali(tot)],
        numeriDa: 1,
      };
    },
  },
  'riepilogo-categoria': {
    titolo: 'Riepilogo per categoria',
    descrizione: 'Arrivato / ordinato totale / residuo per categoria merceologica.',
    filtri: ['fornitore', 'date'],
    landscape: true,
    async carica(f) {
      const righe = await api.dashboard.reportOrdini({ raggruppa_per: 'categoria', ...f });
      const tot = sommaTotali(righe);
      return {
        head: ['Categoria', 'Ordini', ...colonneTotali()],
        body: righe.map(r => [r.categoria, r.num_ordini, ...celleTotali(r)]),
        foot: ['TOTALE', '', ...celleTotali(tot)],
        numeriDa: 1,
      };
    },
  },
  'fornitore-categoria': {
    titolo: 'Dettaglio fornitore per categoria',
    descrizione: 'Per ogni fornitore, arrivato / ordinato totale / residuo suddivisi per categoria, con subtotale.',
    filtri: ['fornitore', 'categoria', 'date'],
    landscape: true,
    async carica(f) {
      const righe = await api.dashboard.reportOrdini({ raggruppa_per: 'fornitore_categoria', ...f });
      const body = [];
      const perFornitore = new Map();
      for (const r of righe) {
        if (!perFornitore.has(r.fornitore)) perFornitore.set(r.fornitore, []);
        perFornitore.get(r.fornitore).push(r);
      }
      for (const [fornitore, rr] of perFornitore) {
        rr.forEach((r, i) => body.push([i === 0 ? fornitore : '', r.categoria, r.num_ordini, ...celleTotali(r)]));
        if (rr.length > 1) body.push({ subtotale: true, celle: ['', 'Subtotale', '', ...celleTotali(sommaTotali(rr))] });
      }
      return {
        head: ['Fornitore', 'Categoria', 'Ordini', ...colonneTotali()],
        body,
        foot: ['TOTALE', '', '', ...celleTotali(sommaTotali(righe))],
        numeriDa: 2,
      };
    },
  },
  'residuo-dettaglio': {
    titolo: 'Residuo ordini — dettaglio righe',
    descrizione: 'Elenco delle righe ordine ancora da ricevere, raggruppate per fornitore, con data consegna prevista.',
    filtri: ['fornitore', 'categoria', 'date'],
    landscape: true,
    async carica(f) {
      const righe = await api.dashboard.reportResiduoRighe(f);
      const body = [];
      const perFornitore = new Map();
      for (const r of righe) {
        if (!perFornitore.has(r.fornitore)) perFornitore.set(r.fornitore, []);
        perFornitore.get(r.fornitore).push(r);
      }
      for (const [fornitore, rr] of perFornitore) {
        body.push({ gruppo: true, celle: [fornitore] });
        for (const r of rr) {
          body.push([
            r.codice_ordine, dataIt(r.data_ordine), dataIt(r.data_consegna_prevista),
            r.categoria, `${r.codice_prodotto || ''} ${r.descrizione_prodotto || ''}`.trim(),
            `${nNum(r.quantita_residua)} ${r.unita_misura || ''}`.trim(), nTon(r.peso_residuo_kg), nEur(r.importo_residuo),
          ]);
        }
        const kg = rr.reduce((s, r) => s + Number(r.peso_residuo_kg || 0), 0);
        const eur = rr.reduce((s, r) => s + Number(r.importo_residuo || 0), 0);
        body.push({ subtotale: true, celle: ['', '', '', '', 'Subtotale', '', nTon(kg), nEur(eur)] });
      }
      return {
        head: ['Ordine', 'Data ord.', 'Consegna prev.', 'Categoria', 'Prodotto', 'Q.tà residua', 'Residuo (t)', 'Residuo (€)'],
        body,
        foot: ['TOTALE', '', '', '', '', '',
          nTon(righe.reduce((s, r) => s + Number(r.peso_residuo_kg || 0), 0)),
          nEur(righe.reduce((s, r) => s + Number(r.importo_residuo || 0), 0))],
        numeriDa: 5,
      };
    },
  },
  'esposizione': {
    titolo: 'Fatture da pagare per fornitore',
    descrizione: 'Esposizione verso i fornitori: fatture non ancora pagate, per scadenza.',
    filtri: ['fornitore'],
    landscape: false,
    async carica(f) {
      const righe = await api.dashboard.esposizioneFornitore(f.id_fornitore);
      const urg = { scaduta: 'Scaduta', in_scadenza: 'In scadenza', futura: 'Futura' };
      return {
        head: ['Fornitore', 'Scadenza', 'Urgenza', 'N. fatture', 'Totale (€)'],
        body: righe.map(r => [r.ragione_sociale, dataIt(r.data_scadenza), urg[r.urgenza] || r.urgenza, r.num_fatture, nEur(r.totale_da_pagare)]),
        foot: ['TOTALE', '', '', righe.reduce((s, r) => s + Number(r.num_fatture || 0), 0),
          nEur(righe.reduce((s, r) => s + Number(r.totale_da_pagare || 0), 0))],
        numeriDa: 3,
      };
    },
  },
  'ddt-da-fatturare': {
    titolo: 'DDT da fatturare',
    descrizione: 'DDT ricevuti con righe non ancora fatturate.',
    filtri: ['fornitore'],
    landscape: false,
    async carica(f) {
      const righe = await api.dashboard.ddtNonFatturatiFornitore(f.id_fornitore);
      return {
        head: ['Fornitore', 'DDT', 'Data ricezione', 'Righe da fatturare'],
        body: righe.map(r => [r.fornitore, r.codice_ddt, dataIt(r.data_ricezione), `${r.righe_non_fatturate} / ${r.righe_totali}`]),
        foot: [`${righe.length} DDT`, '', '', ''],
        numeriDa: 99,
      };
    },
  },
};

// ── Pagina ──────────────────────────────────────────────────────────────────
let urlPdfCorrente = null;
let nomeFileCorrente = 'stampa.pdf';

export async function renderStampe(container) {
  const utente = getUtente();
  if (!utente || utente.ruolo !== 'admin') {
    container.innerHTML = `<div class="alert alert-danger">
      <i class="bi bi-shield-lock me-2"></i>Sezione riservata agli amministratori.</div>`;
    return;
  }

  const [fornitori, categorie] = await Promise.all([
    api.fornitori.list('?limit=1000').catch(() => []),
    api.categorie.list('?limit=1000').catch(() => []),
  ]);
  fornitori.sort((a, b) => a.ragione_sociale.localeCompare(b.ragione_sociale, 'it', { sensitivity: 'base' }));

  container.innerHTML = `
    <div class="table-card p-3 mb-3">
      <div class="row g-3 align-items-end">
        <div class="col-lg-4">
          <label class="form-label small mb-1">Stampa</label>
          <select id="st-tipo" class="form-select form-select-sm">
            ${Object.entries(STAMPE).map(([k, s]) => `<option value="${k}">${s.titolo}</option>`).join('')}
          </select>
        </div>
        <div class="col-lg-3" data-filtro="fornitore">
          <label class="form-label small mb-1">Fornitore</label>
          ${multiSelect('st-fornitore', 'Tutti i fornitori', fornitori.map(f => ({ value: f.id, label: f.ragione_sociale })))}
        </div>
        <div class="col-lg-2" data-filtro="categoria">
          <label class="form-label small mb-1">Categoria</label>
          ${multiSelect('st-categoria', 'Tutte', categorie.map(c => ({ value: c.codice, label: c.codice })))}
        </div>
        <div class="col-lg-3" data-filtro="date">
          <label class="form-label small mb-1">Ordini dal / al</label>
          <div class="input-group input-group-sm">
            <input type="date" id="st-da" class="form-control" />
            <input type="date" id="st-a" class="form-control" />
          </div>
        </div>
      </div>
      <div id="st-descrizione" class="text-muted small mt-2"></div>
      <div class="mt-3 d-flex flex-wrap gap-2">
        <button id="st-genera" class="btn btn-primary btn-sm"><i class="bi bi-file-earmark-pdf me-1"></i>Genera PDF</button>
        <button id="st-salva" class="btn btn-outline-secondary btn-sm d-none"><i class="bi bi-download me-1"></i>Salva PDF</button>
        <button id="st-stampa" class="btn btn-outline-secondary btn-sm d-none"><i class="bi bi-printer me-1"></i>Stampa</button>
        <button id="st-apri" class="btn btn-outline-secondary btn-sm d-none"><i class="bi bi-box-arrow-up-right me-1"></i>Apri in nuova scheda</button>
      </div>
    </div>
    <div id="st-anteprima"></div>`;

  const $ = id => container.querySelector(id);
  const tipo = $('#st-tipo');
  attivaMultiSelect($('#st-fornitore'));
  attivaMultiSelect($('#st-categoria'));

  const aggiornaFiltri = () => {
    const s = STAMPE[tipo.value];
    container.querySelectorAll('[data-filtro]').forEach(el => {
      el.classList.toggle('d-none', !s.filtri.includes(el.dataset.filtro));
    });
    $('#st-descrizione').textContent = s.descrizione;
  };
  tipo.onchange = aggiornaFiltri;
  aggiornaFiltri();

  $('#st-genera').onclick = async () => {
    const s = STAMPE[tipo.value];
    const btn = $('#st-genera');
    btn.disabled = true;
    $('#st-anteprima').innerHTML = `<div class="text-center py-4 text-muted"><i class="bi bi-hourglass-split"></i> Generazione in corso…</div>`;
    try {
      const filtri = {};
      const filtroAttivo = n => s.filtri.includes(n);
      if (filtroAttivo('fornitore')) filtri.id_fornitore = valoriSelezionati($('#st-fornitore'));
      if (filtroAttivo('categoria')) filtri.categoria = valoriSelezionati($('#st-categoria'));
      if (filtroAttivo('date')) { filtri.data_da = $('#st-da').value; filtri.data_a = $('#st-a').value; }

      const [dati] = await Promise.all([s.carica(filtri), caricaLibreriePdf()]);
      const riepilogoFiltri = descriviFiltri(s, filtri, fornitori);
      const doc = costruisciPdf(s, dati, riepilogoFiltri);
      mostraPdf(container, doc, tipo.value);
    } catch (e) {
      $('#st-anteprima').innerHTML = `<div class="alert alert-danger small"><i class="bi bi-exclamation-triangle me-1"></i>${e.message}</div>`;
    } finally {
      btn.disabled = false;
    }
  };
}

function descriviFiltri(s, f, fornitori) {
  const parti = [];
  if (f.id_fornitore?.length) {
    const nomi = f.id_fornitore.map(id => fornitori.find(x => String(x.id) === id)?.ragione_sociale || id);
    parti.push(`Fornitor${nomi.length === 1 ? 'e' : 'i'}: ${nomi.join(', ')}`);
  }
  if (f.categoria?.length) parti.push(`Categori${f.categoria.length === 1 ? 'a' : 'e'}: ${f.categoria.join(', ')}`);
  if (f.data_da || f.data_a) parti.push(`Ordini ${f.data_da ? 'dal ' + dataIt(f.data_da) : ''} ${f.data_a ? 'al ' + dataIt(f.data_a) : ''}`.replace(/\s+/g, ' ').trim());
  return parti.length ? parti.join('  ·  ') : 'Nessun filtro (tutti i dati)';
}

// ── Multiselezione (dropdown con checkbox) ──────────────────────────────────
function multiSelect(id, etichettaTutti, opzioni) {
  return `
    <div class="dropdown" id="${id}" data-tutti="${etichettaTutti}">
      <button type="button" class="btn btn-outline-secondary btn-sm w-100 text-start text-truncate dropdown-toggle"
              data-bs-toggle="dropdown" data-bs-auto-close="outside">${etichettaTutti}</button>
      <div class="dropdown-menu p-2 shadow" style="max-height:320px; overflow-y:auto; z-index:1080">
        <button type="button" class="btn btn-link btn-sm p-0 mb-1" data-azzera>Deseleziona tutto</button>
        ${opzioni.map(o => `
        <label class="dropdown-item d-flex align-items-center gap-2 small text-wrap">
          <input type="checkbox" class="form-check-input mt-0" value="${o.value}" data-label="${o.label}" /> ${o.label}
        </label>`).join('')}
      </div>
    </div>`;
}

function valoriSelezionati(box) {
  return [...box.querySelectorAll('input:checked')].map(i => i.value);
}

function attivaMultiSelect(box) {
  const btn = box.querySelector('button.dropdown-toggle');
  // Posizione "fixed": il menu esce dalla cornice della scheda (overflow) e va in sovraimpressione.
  new bootstrap.Dropdown(btn, { autoClose: 'outside', popperConfig: c => ({ ...c, strategy: 'fixed' }) });
  // Menu largo quanto il campo (con "fixed" le % si riferirebbero alla finestra), allineato a sinistra.
  btn.addEventListener('show.bs.dropdown', () => {
    const menu = box.querySelector('.dropdown-menu');
    menu.style.width = Math.max(btn.offsetWidth, 240) + 'px';
    menu.style.maxWidth = '90vw';
  });
  const aggiorna = () => {
    const sel = [...box.querySelectorAll('input:checked')];
    btn.textContent = !sel.length ? box.dataset.tutti
      : sel.length === 1 ? sel[0].dataset.label : `${sel.length} selezionati`;
  };
  box.addEventListener('change', aggiorna);
  box.querySelector('[data-azzera]').onclick = () => {
    box.querySelectorAll('input:checked').forEach(i => { i.checked = false; });
    aggiorna();
  };
}

// ── Generazione PDF ─────────────────────────────────────────────────────────
function caricaScript(url) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = url;
    el.onload = resolve;
    el.onerror = () => reject(new Error('Impossibile caricare la libreria PDF (serve connessione internet).'));
    document.head.appendChild(el);
  });
}

async function caricaLibreriePdf() {
  if (!window.jspdf) await caricaScript(JSPDF_URL);
  if (!window.jspdf.jsPDF.API.autoTable) await caricaScript(AUTOTABLE_URL);
}

function costruisciPdf(s, dati, riepilogoFiltri) {
  const doc = new window.jspdf.jsPDF({ orientation: s.landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const larghezza = doc.internal.pageSize.getWidth();
  const altezza = doc.internal.pageSize.getHeight();
  const utente = getUtente();
  const generato = new Date().toLocaleString('it-IT');

  doc.setFont('helvetica', 'bold').setFontSize(15);
  doc.text(s.titolo, 14, 16);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90);
  doc.text(`Ditta: ${NOME_DITTA[getDitta()] || getDitta()}   ·   ${riepilogoFiltri}`, 14, 22);
  doc.setTextColor(0);

  const colonne = dati.head.length;
  const stileColonne = {};
  for (let i = dati.numeriDa; i < colonne; i++) stileColonne[i] = { halign: 'right' };

  const corpo = dati.body.map(r => {
    if (Array.isArray(r)) return r;
    if (r.gruppo) return [{ content: r.celle[0], colSpan: colonne, styles: { fontStyle: 'bold', fillColor: [225, 232, 242] } }];
    return r.celle.map(c => ({ content: c, styles: { fontStyle: 'bold', fillColor: [243, 243, 243] } }));
  });

  doc.autoTable({
    startY: 27,
    head: [dati.head],
    body: corpo.length ? corpo : [[{ content: 'Nessun dato per i filtri selezionati', colSpan: colonne, styles: { halign: 'center', textColor: 120 } }]],
    foot: corpo.length ? [dati.foot] : undefined,
    showFoot: 'lastPage',
    styles: { fontSize: 8.5, cellPadding: 1.8 },
    headStyles: { fillColor: [33, 37, 41], halign: 'left' },
    footStyles: { fillColor: [33, 37, 41], fontStyle: 'bold' },
    columnStyles: stileColonne,
    didParseCell: d => {
      if (d.section === 'head' && d.column.index >= dati.numeriDa) d.cell.styles.halign = 'right';
      if (d.section === 'foot' && d.column.index >= dati.numeriDa) d.cell.styles.halign = 'right';
    },
    margin: { left: 14, right: 14, bottom: 14 },
  });

  const pagine = doc.getNumberOfPages();
  doc.setFontSize(8).setTextColor(110);
  for (let i = 1; i <= pagine; i++) {
    doc.setPage(i);
    doc.text(`Generato il ${generato}${utente ? ' da ' + (utente.nome_completo || utente.username) : ''}`, 14, altezza - 7);
    doc.text(`Pagina ${i} di ${pagine}`, larghezza - 14, altezza - 7, { align: 'right' });
  }
  return doc;
}

// ── Anteprima, salvataggio, stampa ──────────────────────────────────────────
function mostraPdf(container, doc, chiave) {
  if (urlPdfCorrente) URL.revokeObjectURL(urlPdfCorrente);
  const blob = doc.output('blob');
  urlPdfCorrente = URL.createObjectURL(blob);
  nomeFileCorrente = `${chiave}_${new Date().toISOString().slice(0, 10)}.pdf`;

  container.querySelector('#st-anteprima').innerHTML = `
    <iframe id="st-frame" src="${urlPdfCorrente}" class="w-100 border rounded bg-white" style="height:calc(100vh - 290px); min-height:480px"></iframe>`;

  const salva = container.querySelector('#st-salva');
  const stampa = container.querySelector('#st-stampa');
  const apri = container.querySelector('#st-apri');
  [salva, stampa, apri].forEach(b => b.classList.remove('d-none'));

  salva.onclick = () => {
    const a = document.createElement('a');
    a.href = urlPdfCorrente;
    a.download = nomeFileCorrente;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  apri.onclick = () => window.open(urlPdfCorrente, '_blank');
  stampa.onclick = () => {
    const frame = container.querySelector('#st-frame');
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch {
      window.open(urlPdfCorrente, '_blank'); // fallback: stampa dal visualizzatore PDF del browser
    }
  };
}
