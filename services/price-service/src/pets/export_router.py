from __future__ import annotations

from datetime import datetime, date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from fpdf import FPDF
from sqlalchemy.orm import Session

from ..db import get_db
from ..user_auth.deps import get_current_user
from ..user_auth.models import User
from .document_models import PetDocument
from .grooming_models import GroomingRecord
from .models import Pet
from .parasite_models import ParasiteControlRecord
from .vaccine_models import VaccineRecord
from ..events.models import Event

router = APIRouter(prefix="/pets", tags=["Pet Export"])

# Tipos de eventos que ja aparecem em secoes dedicadas — nao repetem em Consultas
_DEDUP_EVENT_TYPES = {
    "vaccine",
    "dewormer", "flea_tick", "heartworm", "collar", "leishmaniasis",
    "bath", "grooming", "bath_grooming",
}

# Pastas de documentos — mesma ordem e nomenclatura do app
_DOC_FOLDERS = [
    ("exam",         "Exames"),
    ("vaccine",      "Carteirinha de Vacinacao"),
    ("prescription", "Receitas"),
    ("report",       "Laudos"),
    ("comprovante",  "Comprovantes"),
    ("photo",        "Fotos"),
    ("other",        "Outros"),
]

# ── Brand colors (R, G, B) ────────────────────────────────────────────────
_BLUE = (0, 86, 210)
_BLUE2 = (37, 99, 235)
_VIOLET = (109, 40, 217)
_SLATE = (100, 116, 139)
_EMERALD = (5, 150, 105)
_CYAN = (8, 145, 178)
_INDIGO = (29, 78, 216)
_WHITE = (255, 255, 255)
_DARK = (15, 23, 42)
_MID = (100, 116, 139)
_LIGHT = (248, 250, 252)
_ROW_ALT = (241, 245, 254)
_HDR_ROW = (220, 228, 248)


def _s(text) -> str:
    """Sanitize string to Latin-1 (fpdf2 core fonts)."""
    if text is None:
        return "-"
    text = str(text)
    replacements = {
        "–": "-", "—": "-", "‘": "'", "’": "'",
        "“": '"', "”": '"', "…": "...", "·": ".",
        "•": "-",
    }
    for k, v in replacements.items():
        text = text.replace(k, v)
    return text.encode("latin-1", errors="replace").decode("latin-1")


def _fmt(dt) -> str:
    if dt is None:
        return "-"
    if isinstance(dt, datetime):
        dt = dt.date()
    try:
        return dt.strftime("%d/%m/%Y")
    except Exception:
        return str(dt)


def _trunc(text: str, n: int) -> str:
    if len(text) <= n:
        return text
    return text[: n - 1] + "."


# ── PDF class ─────────────────────────────────────────────────────────────

class _PDF(FPDF):
    def __init__(self, pet_name: str):
        super().__init__(orientation="P", unit="mm", format="A4")
        self._pet_name = pet_name
        self.set_auto_page_break(auto=True, margin=16)
        self.set_margins(14, 14, 14)

    def header(self):
        if self.page_no() <= 1:
            return
        self.set_fill_color(*_BLUE)
        self.rect(0, 0, 210, 8, "F")
        self.set_y(2)
        self.set_font("Helvetica", "B", 7)
        self.set_text_color(*_WHITE)
        self.cell(0, 4, _s(f"PETMOL  |  Historico de {self._pet_name}"), align="L")
        self.ln(10)
        self.set_text_color(*_DARK)

    def footer(self):
        if self.page_no() <= 1:
            return
        self.set_y(-10)
        self.set_font("Helvetica", "", 7)
        self.set_text_color(*_MID)
        today = datetime.now().strftime("%d/%m/%Y")
        self.cell(0, 4, _s(f"Gerado em {today} via PETMOL  |  www.petmol.com.br"), align="C")
        self.set_text_color(*_DARK)


def _sec_header(pdf: _PDF, title: str, color: tuple):
    pdf.set_fill_color(*color)
    pdf.set_text_color(*_WHITE)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(0, 9, _s(f"   {title}"), new_x="LMARGIN", new_y="NEXT", fill=True)
    pdf.set_text_color(*_DARK)
    pdf.ln(1)


def _row(pdf: _PDF, cols: list[str], widths: list[float], *, header=False, alt=False):
    row_h = 6.5
    if header:
        pdf.set_fill_color(*_HDR_ROW)
        pdf.set_font("Helvetica", "B", 8)
    elif alt:
        pdf.set_fill_color(*_ROW_ALT)
        pdf.set_font("Helvetica", "", 8)
    else:
        pdf.set_fill_color(*_WHITE)
        pdf.set_font("Helvetica", "", 8)

    for col, w in zip(cols, widths):
        # estimate max chars that fit (≈ 1.9 pts per char at size 8, 1pt≈0.35mm)
        max_chars = max(4, int(w / 1.85))
        pdf.cell(w, row_h, _trunc(_s(col), max_chars), border=0, fill=True)
    pdf.ln(row_h)


def _empty(pdf: _PDF):
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(*_MID)
    pdf.cell(0, 8, "  Nenhum registro encontrado.", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*_DARK)


# ── Endpoint ──────────────────────────────────────────────────────────────

@router.get("/{pet_id}/export-pdf")
def export_pet_pdf(
    pet_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pet = (
        db.query(Pet)
        .filter(Pet.id == pet_id, Pet.user_id == str(current_user.id))
        .first()
    )
    if not pet:
        raise HTTPException(status_code=404, detail="Pet nao encontrado")

    vaccines = (
        db.query(VaccineRecord)
        .filter(VaccineRecord.pet_id == pet_id, VaccineRecord.deleted_at.is_(None))
        .order_by(VaccineRecord.applied_date.desc())
        .all()
    )
    parasites = (
        db.query(ParasiteControlRecord)
        .filter(ParasiteControlRecord.pet_id == pet_id)
        .order_by(ParasiteControlRecord.date_applied.desc())
        .all()
    )
    grooming = (
        db.query(GroomingRecord)
        .filter(GroomingRecord.pet_id == pet_id)
        .order_by(GroomingRecord.date.desc())
        .all()
    )
    events = (
        db.query(Event)
        .filter(
            Event.pet_id == pet_id,
            Event.user_id == str(current_user.id),
            Event.deleted_at.is_(None),
            Event.source != "document",
            Event.type.notin_(list(_DEDUP_EVENT_TYPES)),
        )
        .order_by(Event.scheduled_at.desc())
        .limit(60)
        .all()
    )
    documents = (
        db.query(PetDocument)
        .filter(PetDocument.pet_id == pet_id, PetDocument.deleted_at.is_(None))
        .order_by(PetDocument.document_date.desc().nullslast())
        .all()
    )

    pdf = _PDF(pet.name)
    _build_cover(pdf, pet, len(vaccines), len(parasites), len(grooming), len(events), len(documents))
    _build_content(pdf, vaccines, parasites, grooming, events, documents)

    pdf_bytes = bytes(pdf.output())
    safe = pet.name.lower().replace(" ", "-").encode("ascii", errors="ignore").decode()
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="historico-{safe}.pdf"'},
    )


# ── Cover page ────────────────────────────────────────────────────────────

def _build_cover(pdf: _PDF, pet: Pet, n_vac: int, n_par: int, n_groom: int, n_evt: int, n_doc: int):
    pdf.add_page()

    # Blue top block
    pdf.set_fill_color(*_BLUE)
    pdf.rect(0, 0, 210, 155, "F")

    # Accent stripe
    pdf.set_fill_color(*_BLUE2)
    pdf.rect(0, 138, 210, 17, "F")

    # PETMOL title
    pdf.set_xy(14, 34)
    pdf.set_font("Helvetica", "B", 38)
    pdf.set_text_color(*_WHITE)
    pdf.cell(0, 18, "PETMOL", align="C")

    pdf.set_xy(14, 55)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(180, 210, 255)
    pdf.cell(0, 5, "Historico Completo de Saude e Documentos", align="C")

    # Divider
    pdf.set_draw_color(*_WHITE)
    pdf.set_line_width(0.4)
    pdf.line(55, 65, 155, 65)

    # Pet name
    pdf.set_xy(14, 68)
    pdf.set_font("Helvetica", "B", 26)
    pdf.set_text_color(*_WHITE)
    pdf.cell(0, 13, _s(pet.name), align="C")

    # Species line
    parts = []
    if pet.species:
        parts.append(pet.species.capitalize())
    if pet.breed:
        parts.append(pet.breed)
    if pet.sex:
        parts.append("Macho" if pet.sex == "male" else "Femea")
    if pet.birth_date:
        parts.append(f"Nasc. {_fmt(pet.birth_date)}")
    species_line = "  |  ".join(parts)

    pdf.set_xy(14, 83)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(200, 225, 255)
    pdf.cell(0, 5, _s(species_line), align="C")

    # Count cards
    cards = [
        (n_vac, "Vacinas"),
        (n_par, "Antiparasit."),
        (n_groom, "Banho & Tosa"),
        (n_doc, "Documentos"),
    ]
    cw, cgap = 40, 4
    x0 = (210 - (len(cards) * cw + (len(cards) - 1) * cgap)) / 2
    for i, (cnt, lbl) in enumerate(cards):
        cx = x0 + i * (cw + cgap)
        pdf.set_fill_color(*_WHITE)
        pdf.rect(cx, 100, cw, 26, "F", round_corners=True, corner_radius=3)
        pdf.set_xy(cx, 105)
        pdf.set_font("Helvetica", "B", 14)
        pdf.set_text_color(*_BLUE)
        pdf.cell(cw, 7, str(cnt), align="C")
        pdf.set_xy(cx, 113)
        pdf.set_font("Helvetica", "", 7)
        pdf.set_text_color(*_MID)
        pdf.cell(cw, 4, lbl, align="C")

    # White bottom block
    pdf.set_fill_color(*_WHITE)
    pdf.rect(0, 155, 210, 142, "F")

    pdf.set_xy(14, 162)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*_MID)
    today = datetime.now().strftime("%d/%m/%Y")
    pdf.cell(0, 5, _s(f"Gerado em {today} via PETMOL"), align="C")

    pdf.set_xy(14, 172)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*_DARK)
    pdf.cell(0, 5, "Conteudo deste relatorio", align="C")

    toc = [
        ("Vacinas", n_vac, _VIOLET),
        ("Controle Antiparasitario", n_par, _SLATE),
        ("Banho & Tosa", n_groom, _EMERALD),
        ("Eventos", n_evt, _CYAN),
        ("Documentos", n_doc, _INDIGO),
    ]
    y = 182
    for title, cnt, color in toc:
        pdf.set_fill_color(*color)
        pdf.rect(18, y + 1, 3, 5, "F")
        pdf.set_xy(24, y)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*_DARK)
        pdf.cell(120, 7, _s(title))
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(*_MID)
        reg = "registro" if cnt == 1 else "registros"
        pdf.cell(0, 7, _s(f"{cnt} {reg}"), align="R")
        pdf.ln(9)
        y += 9

    pdf.set_xy(14, 268)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*_MID)
    pdf.cell(0, 5, "www.petmol.com.br", align="C")


# ── Content pages ─────────────────────────────────────────────────────────

_PARASITE_LABELS = {
    "dewormer": "Vermifugo",
    "flea_tick": "Antipulgas/Carrapatos",
    "heartworm": "Filaria",
    "collar": "Coleira antiparasitaria",
    "leishmaniasis": "Leishmaniose",
}
_GROOM_LABELS = {
    "bath": "Banho",
    "grooming": "Tosa",
    "bath_grooming": "Banho + Tosa",
}
_EVENT_LABELS = {
    "bath": "Banho",
    "grooming": "Tosa",
    "bath_grooming": "Banho + Tosa",
    "vaccine": "Vacina",
    "dewormer": "Vermifugo",
    "flea_tick": "Antipulgas",
    "vet_appointment": "Consulta veterinaria",
    "medication": "Medicacao",
    "weight_check": "Pesagem",
    "other": "Outro",
}
_STATUS_LABELS = {
    "pending": "Agendado",
    "completed": "Concluido",
    "cancelled": "Cancelado",
    "rescheduled": "Remarcado",
}
_CAT_LABELS = {
    "exam": "Exame",
    "vaccine": "Vacina",
    "prescription": "Receita",
    "report": "Laudo",
    "comprovante": "Comprovante",
    "photo": "Foto",
    "other": "Outro",
}


def _build_content(pdf, vaccines, parasites, grooming, events, documents):
    pdf.add_page()

    # ── Vacinas ──────────────────────────────────────────────────────────
    _sec_header(pdf, "VACINAS", _VIOLET)
    if not vaccines:
        _empty(pdf)
    else:
        ws = [62, 30, 30, 60]
        _row(pdf, ["Vacina", "Aplicada em", "Proxima dose", "Observacoes"], ws, header=True)
        for i, v in enumerate(vaccines):
            notes = _s(v.notes or "")
            if v.clinic_name:
                notes = _s(v.clinic_name) + (f" | {notes}" if notes and notes != "—" else "")
            _row(pdf, [v.vaccine_name or "", _fmt(v.applied_date), _fmt(v.next_dose_date), notes or "-"], ws, alt=i % 2 == 1)

    pdf.ln(5)

    # ── Antiparasitarios ─────────────────────────────────────────────────
    _sec_header(pdf, "CONTROLE ANTIPARASITARIO", _SLATE)
    if not parasites:
        _empty(pdf)
    else:
        ws = [42, 54, 30, 30, 26]
        _row(pdf, ["Tipo", "Produto", "Aplicado em", "Proxima dose", "Vet."], ws, header=True)
        for i, p in enumerate(parasites):
            _row(pdf, [
                _PARASITE_LABELS.get(p.type, p.type),
                p.product_name or "",
                _fmt(p.date_applied),
                _fmt(p.next_due_date),
                p.veterinarian or "-",
            ], ws, alt=i % 2 == 1)

    pdf.ln(5)

    # ── Banho & Tosa ─────────────────────────────────────────────────────
    _sec_header(pdf, "BANHO & TOSA", _EMERALD)
    if not grooming:
        _empty(pdf)
    else:
        ws = [38, 28, 68, 48]
        _row(pdf, ["Servico", "Data", "Estabelecimento", "Profissional"], ws, header=True)
        for i, g in enumerate(grooming):
            _row(pdf, [
                _GROOM_LABELS.get(g.type, g.type),
                _fmt(g.date),
                g.location or "-",
                g.groomer or "-",
            ], ws, alt=i % 2 == 1)

    pdf.ln(5)

    # ── Consultas e Eventos ───────────────────────────────────────────────
    pdf.add_page()
    _sec_header(pdf, "CONSULTAS E EVENTOS", _CYAN)
    if not events:
        _empty(pdf)
    else:
        ws = [50, 28, 28, 76]
        _row(pdf, ["Tipo", "Data", "Status", "Profissional / Local"], ws, header=True)
        for i, ev in enumerate(events):
            details_parts = []
            if ev.professional_name:
                details_parts.append(ev.professional_name)
            if ev.location_name:
                details_parts.append(ev.location_name)
            details = " | ".join(details_parts) if details_parts else "-"
            _row(pdf, [
                _EVENT_LABELS.get(ev.type, ev.type),
                _fmt(ev.scheduled_at),
                _STATUS_LABELS.get(ev.status, ev.status),
                details,
            ], ws, alt=i % 2 == 1)

    pdf.ln(5)

    # ── Documentos por pasta ───────────────────────────────────────────────
    _sec_header(pdf, "DOCUMENTOS", _INDIGO)
    if not documents:
        _empty(pdf)
    else:
        from collections import defaultdict
        by_cat: dict = defaultdict(list)
        for d in documents:
            by_cat[d.category or "other"].append(d)

        ws = [90, 92]
        first_folder = True
        for cat_id, cat_label in _DOC_FOLDERS:
            items = by_cat.get(cat_id, [])
            if not items:
                continue
            if not first_folder:
                pdf.ln(2)
            first_folder = False
            # Pasta sub-header
            pdf.set_fill_color(232, 240, 254)
            pdf.set_font("Helvetica", "B", 8)
            pdf.set_text_color(*_INDIGO)
            pdf.cell(0, 6.5, _s(f"   {cat_label}"), fill=True, new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(*_DARK)
            # Linhas
            for i, d in enumerate(items):
                date_str = _fmt(d.document_date) if d.document_date else ""
                estab = _s(d.establishment_name or "")
                right_col = " | ".join(filter(None, [date_str, estab])) or "-"
                _row(pdf, [d.title or "-", right_col], ws, alt=i % 2 == 1)
