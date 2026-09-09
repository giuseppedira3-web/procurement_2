import { api } from '../api.js';
import { fmt, toast, setHeaderActions, qualitaBadge } from '../utils.js';
import { renderTable, showFormModal } from '../components.js';

const COLUMNS = [
  { key: 'nome',       label: 'Qualità',  fmt: (v, r) => qualitaBadge(v, { [v]: r.colore }) },
  { key: 'colore',     label: 'Colore',
    fmt: v => `<span class="d-inline-block align-middle rounded" style="width:1.25rem;height:1.25rem;background:${v};border:1px solid rgba(0,0,0,.15)"></span> <code class="small">${v}</code>` },
  { key: 'updated_at', label: 'Ultima modifica', fmt: v => fmt(v, 'datetime') },
];

const FIELDS = [
  { name: 'nome',   label: 'Nome qualità', type: 'text',  required: true, col: 8, placeholder: 'es. S355J2H' },
  { name: 'colore', label: 'Colore badge', type: 'color', required: true, col: 4, value: '#6c757d' },
];

// Nessuna azione di eliminazione: qualita_acciaio è testo libero su prodotti
// e ordini_righe (non FK), quindi rimuovere una voce in uso lascerebbe quei
// record agganciati a un valore "orfano" invece di dare un errore chiaro.
// Rinominare invece è sicuro: il backend ripropaga il nuovo nome su tutti i
// riferimenti esistenti (vedi routers/qualita_acciaio.py).
export async function renderQualita(container) {
  const rows = await api.qualita.list();

  setHeaderActions(`<button class="btn btn-primary btn-sm" id="btn-new"><i class="bi bi-plus-lg me-1"></i>Nuova Qualità</button>`);

  const wrap = document.createElement('div');
  wrap.className = 'table-card';
  wrap.innerHTML = `
    <div class="table-toolbar">
      <span class="text-muted small">${rows.length} qualità</span>
    </div>
    <div class="alert alert-info small mb-0 rounded-0 border-0">
      <i class="bi bi-info-circle me-1"></i>Rinominare una qualità aggiorna automaticamente tutti i prodotti e le
      righe ordine che la usano già. Non è possibile eliminare una qualità (per non lasciare orfani i dati esistenti).
    </div>
    <div id="tbl-body"></div>`;
  container.innerHTML = '';
  container.appendChild(wrap);

  renderTable(wrap.querySelector('#tbl-body'), {
    columns: COLUMNS, rows,
    actions: { onEdit: openEdit },
  });

  document.getElementById('btn-new').onclick = () => showFormModal({
    title: 'Nuova Qualità', fields: FIELDS, values: {},
    onSave: async data => { await api.qualita.create(data); toast('Qualità creata'); location.reload(); },
  });

  function openEdit(id, row) {
    showFormModal({
      title: `Modifica: ${row.nome}`, fields: FIELDS, values: row,
      onSave: async data => {
        await api.qualita.update(id, data);
        toast('Qualità rinominata: propagata a prodotti e righe ordine esistenti');
        location.reload();
      },
    });
  }
}
