const BASE = '/api';

// Tutte le chiamate API vanno a /api/* che FastAPI gestisce
async function req(method, path, body = null) {
  const opts = { method, headers: {} };
  if (body !== null) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  if (!res.ok) {
    let msg = `Errore ${res.status}: ${res.statusText}`;
    try { const j = await res.json(); msg = Array.isArray(j.detail) ? j.detail.map(e => e.msg).join('; ') : (j.detail || msg); } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function upload(path, file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(path, { method: 'POST', body: formData });
  if (!res.ok) {
    let msg = `Errore ${res.status}: ${res.statusText}`;
    try { const j = await res.json(); msg = Array.isArray(j.detail) ? j.detail.map(e => e.msg).join('; ') : (j.detail || msg); } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  get:   (path)       => req('GET',    path),
  post:  (path, body) => req('POST',   path, body),
  patch: (path, body) => req('PATCH',  path, body),
  del:   (path)       => req('DELETE', path),

  // Shortcuts per entity
  fornitori:   { list: (p='') => req('GET', `/fornitori/${p}`), get: id => req('GET', `/fornitori/${id}`), create: b => req('POST', '/fornitori/', b), update: (id,b) => req('PATCH', `/fornitori/${id}`, b), del: id => req('DELETE', `/fornitori/${id}`),
                 importFile: file => upload('/fornitori/import', file), templateUrl: '/fornitori/import/template', exportUrl: '/fornitori/export' },
  magazzini:   { listByFornitore: id => req('GET', `/fornitori/${id}/magazzini/`), create: (id,b) => req('POST', `/fornitori/${id}/magazzini/`, b), update: (id,mid,b) => req('PATCH', `/fornitori/${id}/magazzini/${mid}`, b), del: (id,mid) => req('DELETE', `/fornitori/${id}/magazzini/${mid}`) },
  vettori:     { list: (p='') => req('GET', `/vettori/${p}`), get: id => req('GET', `/vettori/${id}`), create: b => req('POST', '/vettori/', b), update: (id,b) => req('PATCH', `/vettori/${id}`, b), del: id => req('DELETE', `/vettori/${id}`) },
  categorie:   { list: (p='') => req('GET', `/categorie/${p}`), get: id => req('GET', `/categorie/${id}`), create: b => req('POST', '/categorie/', b), update: (id,b) => req('PATCH', `/categorie/${id}`, b), del: id => req('DELETE', `/categorie/${id}`) },
  prodotti:    { list: (p='') => req('GET', `/prodotti/${p}`), get: id => req('GET', `/prodotti/${id}`), create: b => req('POST', '/prodotti/', b), update: (id,b) => req('PATCH', `/prodotti/${id}`, b), del: id => req('DELETE', `/prodotti/${id}`),
                 importFile: file => upload('/prodotti/import', file), templateUrl: '/prodotti/import/template', exportUrl: '/prodotti/export',
                 importPrezzoRiferimento: (idCategoria, file, campoPrezzoImport = 'prezzo_riferimento') => upload(`/prodotti/import-prezzo-riferimento?id_categoria=${idCategoria}&campo_prezzo=${campoPrezzoImport}`, file),
                 prezzoRiferimentoTemplateUrl: '/prodotti/import-prezzo-riferimento/template' },
  conversioni: { list: (p='') => req('GET', `/conversioni-peso/${p}`), get: id => req('GET', `/conversioni-peso/${id}`), create: b => req('POST', '/conversioni-peso/', b), update: (id,b) => req('PATCH', `/conversioni-peso/${id}`, b), del: id => req('DELETE', `/conversioni-peso/${id}`),
                 importFile: file => upload('/conversioni-peso/import', file), templateUrl: '/conversioni-peso/import/template', exportUrl: '/conversioni-peso/export' },
  listino:     { list: (p='') => req('GET', `/listino/${p}`), get: id => req('GET', `/listino/${id}`), create: b => req('POST', '/listino/', b), update: (id,b) => req('PATCH', `/listino/${id}`, b), del: id => req('DELETE', `/listino/${id}`) },
  categorieServizio: { list: (p='') => req('GET', `/categorie-servizio/${p}`), get: id => req('GET', `/categorie-servizio/${id}`), create: b => req('POST', '/categorie-servizio/', b), update: (id,b) => req('PATCH', `/categorie-servizio/${id}`, b), del: id => req('DELETE', `/categorie-servizio/${id}`) },
  listinoServizi:    { list: (p='') => req('GET', `/listino-servizi/${p}`), get: id => req('GET', `/listino-servizi/${id}`), create: b => req('POST', '/listino-servizi/', b), update: (id,b) => req('PATCH', `/listino-servizi/${id}`, b), del: id => req('DELETE', `/listino-servizi/${id}`) },
  ordini:      { list: (p='') => req('GET', `/ordini/${p}`), get: id => req('GET', `/ordini/${id}`), create: b => req('POST', '/ordini/', b), update: (id,b) => req('PATCH', `/ordini/${id}`, b), del: id => req('DELETE', `/ordini/${id}`),
                 listAllRighe: (p='') => req('GET', `/ordini/all-righe${p}`),
                 righe: { list: id => req('GET', `/ordini/${id}/righe`), create: (id,b) => req('POST', `/ordini/${id}/righe`, b), update: (id,rid,b) => req('PATCH', `/ordini/${id}/righe/${rid}`, b), del: (id,rid) => req('DELETE', `/ordini/${id}/righe/${rid}`) } },
  ddt:         { list: (p='') => req('GET', `/ddt/${p}`), get: id => req('GET', `/ddt/${id}`), create: b => req('POST', '/ddt/', b), update: (id,b) => req('PATCH', `/ddt/${id}`, b), del: id => req('DELETE', `/ddt/${id}`),
                 listAllRighe: (p='') => req('GET', '/ddt/all-righe' + p),
                 righe: { list: id => req('GET', `/ddt/${id}/righe`), create: (id,b) => req('POST', `/ddt/${id}/righe`, b), update: (id,rid,b) => req('PATCH', `/ddt/${id}/righe/${rid}`, b), del: (id,rid) => req('DELETE', `/ddt/${id}/righe/${rid}`) } },
  fatture:     { list: (p='') => req('GET', `/fatture/${p}`), get: id => req('GET', `/fatture/${id}`), create: b => req('POST', '/fatture/', b), update: (id,b) => req('PATCH', `/fatture/${id}`, b), del: id => req('DELETE', `/fatture/${id}`),
                 righe: { list: id => req('GET', `/fatture/${id}/righe`), create: (id,b) => req('POST', `/fatture/${id}/righe`, b), update: (id,rid,b) => req('PATCH', `/fatture/${id}/righe/${rid}`, b), del: (id,rid) => req('DELETE', `/fatture/${id}/righe/${rid}`) } },
  dashboard: {
    statoOrdini:       (p='') => req('GET', `/dashboard/stato-ordini${p}`),
    scostamenti:       () => req('GET', '/dashboard/scostamenti-prezzi'),
    ddtNonFatturati:   () => req('GET', '/dashboard/ddt-non-fatturati'),
    esposizione:       () => req('GET', '/dashboard/esposizione-fornitori'),
    dizionario:        (t='') => req('GET', `/dashboard/dizionario${t ? `?table_name=${t}` : ''}`),
  },
};
