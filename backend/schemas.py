from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, model_validator


# ---------------------------------------------------------------------------
# FORNITORI
# ---------------------------------------------------------------------------

class FornitoreCreate(BaseModel):
    codice_fornitore: str
    ragione_sociale: str
    tipo: str = "acciaieria"
    partita_iva: str | None = None
    codice_fiscale: str | None = None
    indirizzo: str | None = None
    cap: str | None = None
    citta: str | None = None
    provincia: str | None = None
    paese: str = "IT"
    telefono: str | None = None
    email: str | None = None
    pec: str | None = None
    iban: str | None = None
    condizioni_pagamento: str | None = None
    valuta: str = "EUR"
    attivo: bool = True
    note: str | None = None


class FornitoreUpdate(BaseModel):
    codice_fornitore: str | None = None
    ragione_sociale: str | None = None
    tipo: str | None = None
    partita_iva: str | None = None
    codice_fiscale: str | None = None
    indirizzo: str | None = None
    cap: str | None = None
    citta: str | None = None
    provincia: str | None = None
    paese: str | None = None
    telefono: str | None = None
    email: str | None = None
    pec: str | None = None
    iban: str | None = None
    condizioni_pagamento: str | None = None
    valuta: str | None = None
    attivo: bool | None = None
    note: str | None = None


class FornitoreResponse(FornitoreCreate):
    id: int
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# CATEGORIE PRODOTTO
# ---------------------------------------------------------------------------

class CategoriaCreate(BaseModel):
    codice: str
    descrizione: str
    tipo_prezzo: str
    unita_misura_base: str
    note: str | None = None
    parametro_prezzo: Decimal | None = None
    base_cat_0: Decimal | None = None
    base_cat_1: Decimal | None = None
    base_cat_2: Decimal | None = None
    base_cat_3: Decimal | None = None
    base_cat_4: Decimal | None = None
    base_cat_5: Decimal | None = None
    tolleranza_peso: Decimal | None = None
    extra_qualita: Decimal | None = None


class CategoriaUpdate(BaseModel):
    descrizione: str | None = None
    tipo_prezzo: str | None = None
    unita_misura_base: str | None = None
    note: str | None = None
    parametro_prezzo: Decimal | None = None
    base_cat_0: Decimal | None = None
    base_cat_1: Decimal | None = None
    base_cat_2: Decimal | None = None
    base_cat_3: Decimal | None = None
    base_cat_4: Decimal | None = None
    base_cat_5: Decimal | None = None
    tolleranza_peso: Decimal | None = None
    extra_qualita: Decimal | None = None


class CategoriaResponse(CategoriaCreate):
    id: int
    created_at: datetime


# ---------------------------------------------------------------------------
# PRODOTTI
# ---------------------------------------------------------------------------

class ProdottoCreate(BaseModel):
    codice_prodotto: str
    descrizione: str
    id_categoria: int | None = None
    spessore_mm: Decimal | None = None
    larghezza_mm: Decimal | None = None
    lunghezza_mm: Decimal | None = None
    diametro_mm: Decimal | None = None
    norma: str | None = None
    qualita_acciaio: str | None = None
    unita_misura_acquisto: str
    peso_unitario_kg: Decimal | None = None
    prezzo_riferimento: Decimal | None = None
    prezzo_s275j0h: Decimal | None = None
    prezzo_s355j2h: Decimal | None = None
    categoria_trave: int | None = None
    attivo: bool = True
    note: str | None = None


class ProdottoUpdate(BaseModel):
    descrizione: str | None = None
    id_categoria: int | None = None
    spessore_mm: Decimal | None = None
    larghezza_mm: Decimal | None = None
    lunghezza_mm: Decimal | None = None
    diametro_mm: Decimal | None = None
    norma: str | None = None
    qualita_acciaio: str | None = None
    unita_misura_acquisto: str | None = None
    peso_unitario_kg: Decimal | None = None
    prezzo_riferimento: Decimal | None = None
    prezzo_s275j0h: Decimal | None = None
    prezzo_s355j2h: Decimal | None = None
    categoria_trave: int | None = None
    attivo: bool | None = None
    note: str | None = None


class ProdottoResponse(ProdottoCreate):
    id: int
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# CONVERSIONI PESO
# ---------------------------------------------------------------------------

class ConversioneCreate(BaseModel):
    id_prodotto: int | None = None
    id_categoria: int | None = None
    da_unita: str
    a_unita: str = "kg"
    fattore_conversione: Decimal
    note: str | None = None

    @model_validator(mode="after")
    def check_prodotto_o_categoria(self):
        if self.id_prodotto is None and self.id_categoria is None:
            raise ValueError("Specificare almeno id_prodotto o id_categoria")
        return self


class ConversioneUpdate(BaseModel):
    id_prodotto: int | None = None
    id_categoria: int | None = None
    da_unita: str | None = None
    a_unita: str | None = None
    fattore_conversione: Decimal | None = None
    note: str | None = None


class ConversioneResponse(ConversioneCreate):
    id: int
    created_at: datetime


# ---------------------------------------------------------------------------
# LISTINO PREZZI
# ---------------------------------------------------------------------------

class ListinoCreate(BaseModel):
    id_fornitore: int
    id_prodotto: int | None = None
    id_categoria: int | None = None
    tipo: str
    prezzo_unitario: Decimal
    valuta: str = "EUR"
    unita_misura_prezzo: str
    data_inizio: date
    data_fine: date | None = None
    attivo: bool = True
    note: str | None = None

    @model_validator(mode="after")
    def check_prodotto_o_categoria(self):
        if self.id_prodotto is None and self.id_categoria is None:
            raise ValueError("Specificare almeno id_prodotto o id_categoria")
        return self


class ListinoUpdate(BaseModel):
    id_prodotto: int | None = None
    id_categoria: int | None = None
    tipo: str | None = None
    prezzo_unitario: Decimal | None = None
    valuta: str | None = None
    unita_misura_prezzo: str | None = None
    data_inizio: date | None = None
    data_fine: date | None = None
    attivo: bool | None = None
    note: str | None = None


class ListinoResponse(ListinoCreate):
    id: int
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# CATEGORIE SERVIZIO
# ---------------------------------------------------------------------------

class CategoriaServizioCreate(BaseModel):
    codice: str
    descrizione: str
    tipo_tariffa: str
    unita_misura_prezzo: str
    note: str | None = None


class CategoriaServizioUpdate(BaseModel):
    descrizione: str | None = None
    tipo_tariffa: str | None = None
    unita_misura_prezzo: str | None = None
    note: str | None = None


class CategoriaServizioResponse(CategoriaServizioCreate):
    id: int
    created_at: datetime


# ---------------------------------------------------------------------------
# LISTINO SERVIZI
# ---------------------------------------------------------------------------

class ListinoServizioCreate(BaseModel):
    id_fornitore: int | None = None
    id_vettore: int | None = None
    id_categoria_servizio: int
    localita_origine: str | None = None
    localita_destinazione: str | None = None
    id_categoria_prodotto: int | None = None
    descrizione_voce: str | None = None
    parametro_rif: str | None = None
    parametro_min: Decimal | None = None
    parametro_max: Decimal | None = None
    prezzo_unitario: Decimal
    valuta: str = "EUR"
    unita_misura_prezzo: str
    data_inizio: date
    data_fine: date | None = None
    attivo: bool = True
    note: str | None = None


class ListinoServizioUpdate(BaseModel):
    id_vettore: int | None = None
    localita_origine: str | None = None
    localita_destinazione: str | None = None
    id_categoria_prodotto: int | None = None
    descrizione_voce: str | None = None
    parametro_rif: str | None = None
    parametro_min: Decimal | None = None
    parametro_max: Decimal | None = None
    prezzo_unitario: Decimal | None = None
    valuta: str | None = None
    unita_misura_prezzo: str | None = None
    data_inizio: date | None = None
    data_fine: date | None = None
    attivo: bool | None = None
    note: str | None = None


class ListinoServizioResponse(ListinoServizioCreate):
    id: int
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# ORDINI
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# MAGAZZINI FORNITORE
# ---------------------------------------------------------------------------

class MagazzinoFornitoreCreate(BaseModel):
    comune: str
    indirizzo: str | None = None
    note: str | None = None
    attivo: bool = True


class MagazzinoFornitoreUpdate(BaseModel):
    comune: str | None = None
    indirizzo: str | None = None
    note: str | None = None
    attivo: bool | None = None


class MagazzinoFornitoreResponse(MagazzinoFornitoreCreate):
    id: int
    id_fornitore: int
    created_at: datetime


# ---------------------------------------------------------------------------
# VETTORI
# ---------------------------------------------------------------------------

class VettoreCreate(BaseModel):
    ragione_sociale: str
    telefono: str | None = None
    email: str | None = None
    note: str | None = None
    attivo: bool = True


class VettoreUpdate(BaseModel):
    ragione_sociale: str | None = None
    telefono: str | None = None
    email: str | None = None
    note: str | None = None
    attivo: bool | None = None


class VettoreResponse(VettoreCreate):
    id: int
    created_at: datetime


# ---------------------------------------------------------------------------
# ORDINI
# ---------------------------------------------------------------------------

class OrdineCreate(BaseModel):
    id_fornitore: int
    riferimento_fornitore: str | None = None
    data_ordine: date
    data_consegna_prevista: date | None = None
    luogo_consegna: str | None = None
    incoterm: str | None = None
    valuta: str = "EUR"
    stato: str = "confermato"
    id_magazzino_origine: int | None = None
    comune_destinazione: str | None = None
    id_vettore: int | None = None
    zincatura: bool = False
    id_zincheria: int | None = None
    note: str | None = None


class OrdineUpdate(BaseModel):
    riferimento_fornitore: str | None = None
    data_ordine: date | None = None
    data_consegna_prevista: date | None = None
    luogo_consegna: str | None = None
    incoterm: str | None = None
    valuta: str | None = None
    stato: str | None = None
    id_magazzino_origine: int | None = None
    comune_destinazione: str | None = None
    id_vettore: int | None = None
    zincatura: bool | None = None
    id_zincheria: int | None = None
    note: str | None = None


class OrdineResponse(OrdineCreate):
    id: int
    codice_ordine: str
    numero_progressivo: int
    anno: int
    comune_origine: str | None = None
    nome_vettore: str | None = None
    nome_zincheria: str | None = None
    created_at: datetime
    updated_at: datetime


class OrdineRigaCreate(BaseModel):
    numero_riga: int
    id_prodotto: int | None = None
    descrizione_libera: str | None = None
    quantita_ordinata: Decimal
    unita_misura: str
    quantita_kg: Decimal | None = None
    prezzo_unitario: Decimal
    valuta: str = "EUR"
    sconto_percentuale: Decimal = Decimal("0")
    sconto_2_percentuale: Decimal = Decimal("0")
    sconto_3_percentuale: Decimal = Decimal("0")
    sconto_4_percentuale: Decimal = Decimal("0")
    tolleranza_chiusura_kg: Decimal = Decimal("250.00")
    qualita_acciaio: str | None = None
    lunghezza_mm: Decimal | None = None
    id_listino_zincatura: int | None = None
    prezzo_zincatura: Decimal | None = None
    data_consegna_prevista: date | None = None
    note: str | None = None

    @model_validator(mode="after")
    def check_prodotto_o_desc(self):
        if self.id_prodotto is None and not self.descrizione_libera:
            raise ValueError("Specificare id_prodotto o descrizione_libera")
        return self


class OrdineRigaUpdate(BaseModel):
    id_prodotto: int | None = None
    descrizione_libera: str | None = None
    quantita_ordinata: Decimal | None = None
    unita_misura: str | None = None
    quantita_kg: Decimal | None = None
    prezzo_unitario: Decimal | None = None
    valuta: str | None = None
    sconto_percentuale: Decimal | None = None
    sconto_2_percentuale: Decimal | None = None
    sconto_3_percentuale: Decimal | None = None
    sconto_4_percentuale: Decimal | None = None
    stato_riga: str | None = None
    tolleranza_chiusura_kg: Decimal | None = None
    qualita_acciaio: str | None = None
    lunghezza_mm: Decimal | None = None
    id_listino_zincatura: int | None = None
    prezzo_zincatura: Decimal | None = None
    data_consegna_prevista: date | None = None
    note: str | None = None


class OrdineRigaResponse(OrdineRigaCreate):
    id: int
    id_ordine: int
    importo_riga: Decimal
    quantita_consegnata: Decimal
    quantita_fatturata: Decimal
    stato_riga: str
    created_at: datetime
    updated_at: datetime


class OrdineConRighe(OrdineResponse):
    righe: list[OrdineRigaResponse] = []


# ---------------------------------------------------------------------------
# DDT
# ---------------------------------------------------------------------------

class DdtCreate(BaseModel):
    id_fornitore: int
    numero_ddt_fornitore: str
    data_ddt: date
    data_ricezione: date | None = None
    numero_colli: int | None = None
    peso_lordo_kg: Decimal | None = None
    peso_netto_kg: Decimal | None = None
    vettore: str | None = None
    targa: str | None = None
    stato: str = "ricevuto"
    note: str | None = None


class DdtUpdate(BaseModel):
    numero_ddt_fornitore: str | None = None
    data_ddt: date | None = None
    data_ricezione: date | None = None
    numero_colli: int | None = None
    peso_lordo_kg: Decimal | None = None
    peso_netto_kg: Decimal | None = None
    vettore: str | None = None
    targa: str | None = None
    stato: str | None = None
    note: str | None = None


class DdtResponse(DdtCreate):
    id: int
    codice_ddt: str
    created_at: datetime
    updated_at: datetime


class DdtRigaCreate(BaseModel):
    numero_riga: int
    id_ordine: int | None = None
    id_riga_ordine: int | None = None
    id_prodotto: int | None = None
    descrizione_libera: str | None = None
    quantita_consegnata: Decimal
    unita_misura: str
    quantita_kg: Decimal | None = None
    lotto: str | None = None
    numero_colata: str | None = None
    certificato_qualita: str | None = None
    note: str | None = None


class DdtRigaUpdate(BaseModel):
    id_ordine: int | None = None
    id_riga_ordine: int | None = None
    id_prodotto: int | None = None
    descrizione_libera: str | None = None
    quantita_consegnata: Decimal | None = None
    unita_misura: str | None = None
    quantita_kg: Decimal | None = None
    lotto: str | None = None
    numero_colata: str | None = None
    certificato_qualita: str | None = None
    fatturato: bool | None = None
    note: str | None = None


class DdtRigaResponse(DdtRigaCreate):
    id: int
    id_ddt: int
    fatturato: bool
    created_at: datetime
    updated_at: datetime


class DdtConRighe(DdtResponse):
    righe: list[DdtRigaResponse] = []


# ---------------------------------------------------------------------------
# FATTURE
# ---------------------------------------------------------------------------

class FatturaCreate(BaseModel):
    id_fornitore: int
    numero_fattura_fornitore: str
    data_fattura: date
    data_ricezione: date | None = None
    data_scadenza: date | None = None
    imponibile: Decimal
    aliquota_iva: Decimal = Decimal("22.00")
    importo_iva: Decimal
    totale: Decimal
    valuta: str = "EUR"
    stato: str = "ricevuta"
    modalita_pagamento: str | None = None
    riferimento_riba: str | None = None
    numero_sdi: str | None = None
    xml_sdi_path: str | None = None
    codice_destinatario: str | None = None
    tipo_documento_sdi: str | None = None
    data_ricezione_sdi: date | None = None
    note: str | None = None


class FatturaUpdate(BaseModel):
    numero_fattura_fornitore: str | None = None
    data_fattura: date | None = None
    data_ricezione: date | None = None
    data_scadenza: date | None = None
    imponibile: Decimal | None = None
    aliquota_iva: Decimal | None = None
    importo_iva: Decimal | None = None
    totale: Decimal | None = None
    valuta: str | None = None
    stato: str | None = None
    data_pagamento: date | None = None
    modalita_pagamento: str | None = None
    riferimento_riba: str | None = None
    numero_sdi: str | None = None
    xml_sdi_path: str | None = None
    codice_destinatario: str | None = None
    tipo_documento_sdi: str | None = None
    data_ricezione_sdi: date | None = None
    note: str | None = None


class FatturaResponse(FatturaCreate):
    id: int
    codice_fattura: str
    data_pagamento: date | None = None
    created_at: datetime
    updated_at: datetime


class FatturaRigaCreate(BaseModel):
    numero_riga: int
    id_ddt: int | None = None
    id_riga_ddt: int | None = None
    id_ordine: int | None = None
    id_riga_ordine: int | None = None
    id_prodotto: int | None = None
    descrizione_fattura: str
    quantita: Decimal
    unita_misura: str
    prezzo_unitario: Decimal
    sconto_percentuale: Decimal = Decimal("0")
    importo_riga: Decimal
    aliquota_iva: Decimal = Decimal("22.00")
    note: str | None = None


class FatturaRigaUpdate(BaseModel):
    id_ddt: int | None = None
    id_riga_ddt: int | None = None
    id_ordine: int | None = None
    id_riga_ordine: int | None = None
    id_prodotto: int | None = None
    descrizione_fattura: str | None = None
    quantita: Decimal | None = None
    unita_misura: str | None = None
    prezzo_unitario: Decimal | None = None
    sconto_percentuale: Decimal | None = None
    importo_riga: Decimal | None = None
    aliquota_iva: Decimal | None = None
    note: str | None = None


class FatturaRigaResponse(FatturaRigaCreate):
    id: int
    id_fattura: int
    created_at: datetime
    updated_at: datetime


class FatturaConRighe(FatturaResponse):
    righe: list[FatturaRigaResponse] = []


# ---------------------------------------------------------------------------
# ALLEGATI
# ---------------------------------------------------------------------------

class AllegatoResponse(BaseModel):
    id: int
    tipo_documento: str
    id_documento: int
    nome_file: str
    percorso_file: str
    dimensione_bytes: int | None
    mime_type: str | None
    uploaded_at: datetime


# ---------------------------------------------------------------------------
# IMPORT MASSIVO (CSV/XLSX)
# ---------------------------------------------------------------------------

class BulkImportError(BaseModel):
    riga: int
    errore: str


class BulkImportResult(BaseModel):
    totale_righe: int
    inseriti: int
    errori: list[BulkImportError]
