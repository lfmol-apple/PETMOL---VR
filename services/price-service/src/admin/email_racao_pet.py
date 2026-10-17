"""E-mail "ração" personalizado: nome do tutor + foto do(s) pet(s). Modelo definido pelo dono em 17/10/2026.

Montagem pura (sem acesso a banco): recebe nome do tutor e a lista de pets SEM ração e devolve
(assunto, texto, html). A foto vem de um endereço assinado (ver email_pet_photo)."""
from __future__ import annotations

from html import escape
from typing import Callable, Optional, Sequence, TypedDict

from .email_pet_photo import PUBLIC_BASE, photo_url as default_photo_url

LINK = (f"{PUBLIC_BASE}/go/instalar?utm_source=email&utm_medium=email"
        "&utm_campaign=racao_foto&utm_content=")
BLUE = "#0056D2"
BANNER = f"{PUBLIC_BASE}/email/petmol-header.png"
BANNER_BG = "#0261F9"


class PetInfo(TypedDict, total=False):
    id: str
    name: str
    sex: Optional[str]  # 'male' | 'female' | None


def _first(name: Optional[str]) -> str:
    return (name or "").strip().split(" ")[0]


def _join(names: Sequence[str]) -> str:
    names = [n for n in names if n]
    if len(names) <= 1:
        return names[0] if names else "seu pet"
    return ", ".join(names[:-1]) + " e " + names[-1]


def _of(p: PetInfo) -> str:
    """'do Ted' / 'da Mel' / 'de Ted' (sexo desconhecido)."""
    n = p.get("name") or "seu pet"
    s = p.get("sex")
    return f"do {n}" if s == "male" else f"da {n}" if s == "female" else f"de {n}"


def _def(p: PetInfo) -> str:
    """'O Ted' / 'A Mel' / 'Ted'."""
    n = p.get("name") or "Seu pet"
    s = p.get("sex")
    return f"O {n}" if s == "male" else f"A {n}" if s == "female" else n


def _pron(p: PetInfo) -> str:
    s = p.get("sex")
    return "dele" if s == "male" else "dela" if s == "female" else ""


# Assuntos (o dono escolhe). Sempre com o nome do tutor e do pet quando houver.
SUBJECTS = ("contando", "pergunta", "recado")
DEFAULT_SUBJECT = "contando"


def subject_for(variant: str, tutor: Optional[str], pets: Sequence[PetInfo]) -> str:
    t = _first(tutor)
    one = len(pets) == 1
    p0 = pets[0] if pets else {"name": "seu pet"}
    names = _join([p.get("name", "") for p in pets])
    if variant == "pergunta":
        core = f"você sabe quando a ração {_of(p0)} vai acabar?" if one else f"você sabe quando a ração de {names} vai acabar?"
        return f"{t}, {core}" if t else core[0].upper() + core[1:]
    if variant == "recado":
        return f"Um recado sobre {names}, {t}" if t else f"Um recado sobre {names}"
    # "contando"
    if one:
        core = f"{_def(p0).replace('O ', 'o ').replace('A ', 'a ') if _def(p0)[:2] in ('O ', 'A ') else _def(p0)} está contando com você"
    else:
        core = f"{names} estão contando com você"
    return f"{t}, {core}" if t else core[0].upper() + core[1:]


def build_email(
    tutor: Optional[str], pets: Sequence[PetInfo], user_id: Optional[str], *,
    variant: str = DEFAULT_SUBJECT,
    photo_url: Callable[[str, str], str] = default_photo_url,
    unsubscribe_url: Optional[str] = None,
    banner_url: str = BANNER,
) -> tuple[str, str, str]:
    """(assunto, texto, html). `pets` = pets do tutor SEM ração (1 a 4; mostra no máximo 3 fotos)."""
    pets = list(pets)[:4] or [{"name": "seu pet"}]
    one = len(pets) == 1
    t = _first(tutor)
    names = _join([p.get("name", "") for p in pets])
    p0 = pets[0]

    subject = subject_for(variant, tutor, pets)
    title_core = f"você sabe quando a ração {_of(p0)} vai acabar?" if one else f"você sabe quando a ração de {names} vai acabar?"
    title = f"{t}, {title_core}" if t else title_core[0].upper() + title_core[1:]
    if one:
        ref = f"a ração {_pron(p0)}" if _pron(p0) else f"a ração de {p0.get('name', 'seu pet')}"
        body = (f"{_def(p0)} conta com você todos os dias. O PETMOL pode ajudar a prever quando {ref} "
                "vai acabar e lembrar você antes que isso aconteça.")
        cta = f"Cadastrar a ração {_of(p0)}"
        callout = f"Cadastre a ração {_of(p0)} e configure o aviso para comprar com antecedência."
    else:
        body = (f"{names} contam com você todos os dias. O PETMOL pode ajudar a prever quando a ração deles "
                "vai acabar e lembrar você antes que isso aconteça.")
        cta = "Cadastrar a ração dos meus pets"
        callout = f"Cadastre a ração de {names} e configure o aviso para comprar com antecedência."
    header_right = f"Um cuidado especial com {names}"

    link_img, link_btn, link_logo = LINK + "imagem", LINK + "botao", LINK + "logo"

    shown = pets[:3]
    if len(shown) == 1:
        photos = (f'<a href="{escape(link_img)}" style="text-decoration:none"><img src="{photo_url(shown[0].get("id", ""), "hero")}" '
                  f'width="552" alt="{escape(shown[0].get("name", ""))}" style="display:block;width:100%;max-width:552px;height:auto;'
                  'border:0;border-radius:12px"></a>')
    else:
        w = 100 // len(shown)
        cells = "".join(
            f'<td width="{w}%" valign="top" style="padding:0 4px;text-align:center"><a href="{escape(link_img)}" style="text-decoration:none">'
            f'<img src="{photo_url(p.get("id", ""), "sq")}" width="170" alt="{escape(p.get("name", ""))}" '
            'style="display:block;width:100%;height:auto;border:0;border-radius:12px"></a>'
            f'<div style="margin-top:6px;font-size:13px;font-weight:800;color:{BLUE}">{escape(p.get("name", ""))}</div></td>'
            for p in shown)
        photos = f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>{cells}</tr></table>'

    unsub = (f'<br><a href="{escape(unsubscribe_url)}" style="color:#9AA3B2;text-decoration:underline">Não quer mais receber estes lembretes? Clique aqui.</a>'
             if unsubscribe_url else "")

    html = (
        '<div style="background:#EEF2F7;padding:16px 8px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;'
        'background:#FFFFFF;border:1px solid #D9E2EE;border-radius:16px;overflow:hidden">'
        # faixa azul da marca (clicável)
        f'<tr><td style="background:{BANNER_BG}"><a href="{escape(link_logo)}" style="text-decoration:none">'
        f'<img src="{banner_url}" width="600" alt="Petmol" style="display:block;width:100%;height:auto;border:0"></a></td></tr>'
        '<tr><td style="padding:16px 24px 20px">'
        f'<p style="margin:0 0 12px;text-align:center;font-size:11px;font-weight:800;letter-spacing:.14em;color:{BLUE};text-transform:uppercase">'
        f'Um cuidado especial com {escape(names)}</p>'
        f'{photos}'
        f'<p style="margin:18px 0 0;text-align:center;font-size:19px;font-weight:800;color:#0F172A;line-height:1.3">{escape(title)}</p>'
        f'<p style="margin:10px 2px 0;text-align:center;font-size:14px;color:#334155;line-height:1.6">{escape(body)}</p>'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px"><tr>'
        f'<td style="background:#E8F0FA;border-left:4px solid {BLUE};border-radius:10px;padding:12px 14px">'
        f'<div style="font-size:14px;font-weight:800;color:{BLUE}">🔔 Um lembrete na hora certa</div>'
        f'<div style="margin-top:4px;font-size:13px;color:#334155;line-height:1.5">{escape(callout)}</div>'
        '</td></tr></table>'
        f'<a href="{escape(link_btn)}" style="display:block;margin-top:16px;background:{BLUE};color:#FFFFFF;text-align:center;'
        f'font-weight:800;font-size:15px;text-decoration:none;padding:15px 12px;border-radius:12px">{escape(cta)}</a>'
        '<p style="margin:8px 0 0;text-align:center;font-size:12px;color:#64748B">'
        'O PETMOL já está no seu celular: na página que abrir, toque em <strong>Abrir</strong>.</p>'
        '</td></tr>'
        # rodapé com a marca
        f'<tr><td style="background:#F4F7FB;border-top:1px solid #E2E8F0;padding:12px 16px;text-align:center;font-size:12px;color:#64748B">'
        f'<span style="font-weight:800;color:{BLUE};font-size:13px">Petmol</span> • Gratuito e sem anúncios{unsub}</td></tr>'
        '</table></div>'
    )
    text = (f"{title}\n\n{body}\n\n{callout}\n\n{cta}: {link_btn}\n(O PETMOL já está no seu celular: na página que abrir, toque em Abrir.)\n\nPetmol • Gratuito e sem anúncios\n"
            + (f"\nPara parar de receber estes lembretes: {unsubscribe_url}\n" if unsubscribe_url else ""))
    return subject, text, html
