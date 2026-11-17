"""E-mail "Você continua com o PETMOL gratuito" (modelo do dono, 17/11/2026) — versão premium e responsiva.

Para quem JÁ tem o PETMOL: continua na versão gratuita; explica com sinceridade como o app é remunerado (Loja do
Pet), avisa que a versão Pró (assinatura) vem para os novos usuários e convida a usar o app, com um botão para cada
ação (alimentação, vacinas, notificações/localização, Loja). Sem ameaça. Sem promessa de "sem anúncios" (decisão #850).

Montagem pura (sem banco): devolve (assunto, texto, html). Todo botão passa por um redirecionador próprio (email_clicks)
que conta o clique e segue para um destino FIXO daqui (nunca um endereço vindo da URL).

Responsivo sem depender de media query (Outlook/Gmail variam): colunas "híbridas" (inline-block 100% com largura máxima)
empilham sozinhas no celular; a <style> do <head> só refina onde é suportada.
"""
from __future__ import annotations

from html import escape
from typing import Callable, Optional

from .email_pet_photo import PUBLIC_BASE

SUBJECT = "Uma conversa sincera sobre a sua conta gratuita do PETMOL"
PREHEADER = "Nada muda na sua conta. Veja como ajudar a manter o app funcionando para o seu pet."
BANNER = f"{PUBLIC_BASE}/email/petmol-header.png"
LOJA_IMG = f"{PUBLIC_BASE}/email/loja-do-pet.jpg"
UTM_CAMPAIGN = "gratuito_permanece"

# Identificação de quem envia (rodapé). Dados do cartão CNPJ (emitido em 04/09/2026). O e-mail público de contato é o da Política de
# Privacidade, não o e-mail pessoal que consta no cartão CNPJ. O endereço completo (apartamento) fica fora do e-mail em massa: cidade/UF.
COMPANY_LINE = "PETMOL NEGOCIOS DIGITAIS LTDA · CNPJ 65.625.299/0001-15 · Belo Horizonte/MG · gerenciamento@petmol.com.br"

# Paleta
BRAND, BRIGHT, NAVY, PALE = "#0056D2", "#0261F9", "#0B2A6F", "#EAF1FD"
INK, MUTED, LINE, GOLD = "#0F172A", "#64748B", "#E2E8F0", "#F5B73B"

# Destinos fixos de cada botão (nome → caminho). Os botões de ração, notificações e localização abrem a página-atalho (o "hub"): dali a pessoa
# faz um passo, VOLTA e vê os demais botões (nunca fica sem o resto). Pet abre o cadastro do pet; vacinas e Loja, a própria tela. "instalar" (logo e botão final) abre a página da loja
# do celular, para quem ainda não tem o app.
_PATHS = {
    "botao": "/go/instalar", "logo": "/go/instalar", "ativar": "/home?modal=atalho", "notificacoes": "/home?modal=atalho", "localizacao": "/home?modal=atalho",
    "alimentacao": "/home?modal=atalho", "pet": "/home?addPet=1", "vacinas": "/home?modal=vaccines", "loja": "/home?modal=loja",
}
LINKS = tuple(_PATHS)


def destination(link: str) -> str:
    path = _PATHS.get(link, _PATHS["botao"])
    sep = "&" if "?" in path else "?"
    return f"{PUBLIC_BASE}{path}{sep}utm_source=email&utm_medium=email&utm_campaign={UTM_CAMPAIGN}&utm_content={link}"


def _first(name: Optional[str]) -> str:
    return (name or "").strip().split(" ")[0]


def _button(href: str, label: str, *, solid: bool = True, full: bool = False) -> str:
    bg, fg, border = (BRAND, "#FFFFFF", BRAND) if solid else ("#FFFFFF", BRAND, BRAND)
    return (f'<a href="{escape(href)}" style="display:{"block" if full else "inline-block"};background:{bg};color:{fg};'
            f'border:2px solid {border};border-radius:12px;padding:{"16px 14px" if full else "11px 16px"};'
            f'font-size:{"16px" if full else "14px"};font-weight:800;line-height:1.2;text-align:center;text-decoration:none">{label}</a>')


def _action(num: int, title: str, desc: str, href: str, cta: str) -> str:
    """Linha de ação: [nº + texto] [botão]. Empilha sozinha no celular (colunas híbridas)."""
    return (
        f'<tr><td style="padding:0 0 10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        f'style="background:#FFFFFF;border:1px solid {LINE};border-radius:14px"><tr><td style="padding:14px 14px 12px;font-size:0">'
        f'<div style="display:inline-block;width:100%;max-width:310px;vertical-align:middle;font-size:15px">'
        f'<table role="presentation" cellpadding="0" cellspacing="0"><tr>'
        f'<td valign="top" style="padding-right:12px"><div style="width:30px;height:30px;line-height:30px;border-radius:15px;'
        f'background:{BRAND};color:#FFFFFF;text-align:center;font-size:14px;font-weight:800">{num}</div></td>'
        f'<td valign="top"><div style="font-size:15px;font-weight:800;color:{INK};line-height:1.3">{title}</div>'
        f'<div style="margin-top:3px;font-size:13.5px;color:{MUTED};line-height:1.5">{desc}</div></td></tr></table></div>'
        f'<div class="btn-cell" style="display:inline-block;width:100%;max-width:170px;vertical-align:middle;font-size:15px;'
        f'text-align:right;padding-top:8px;box-sizing:border-box;padding-left:14px">{_button(href, cta, solid=True, full=True)}</div>'
        f'</td></tr></table></td></tr>'
    )


def ready_problems(company_line: Optional[str]) -> list[str]:
    """Trava jurídica do ENVIO REAL (o teste para o dono não exige): remetente identificado (razão social e CNPJ).
    Não há mais data-limite (decisão do dono, 17/11/2026: soava como ameaça e não tem consequência real)."""
    return [] if (company_line or "").strip() else ["Preencha a identificação da empresa no rodapé (razão social, CNPJ e contato)."]


def _pet_ref(pet_of: str) -> str:
    """"do Baby" → "o Baby"; "da Mel" → "a Mel"; "de Ted" → "Ted" (para "…útil para o Baby")."""
    art, _, nm = pet_of.partition(" ")
    return f"o {nm}" if art == "do" else f"a {nm}" if art == "da" else nm or pet_of


def _progress(p: Optional[dict]) -> str:
    """Quadro "o seu PETMOL hoje": etapas feitas (verde) e pendentes (cinza). Só aparece com dados reais da conta."""
    if not p:
        return ""
    def step(ok: bool, label: str) -> str:
        c, m = ("#16A34A", "&#10003;") if ok else ("#CBD5E1", "")
        return (f'<td align="center" style="padding:0 3px"><div style="width:26px;height:26px;line-height:26px;border-radius:13px;background:{c};'
                f'color:#FFFFFF;font-weight:800;font-size:14px;margin:0 auto">{m}</div><div style="margin-top:5px;font-size:12px;'
                f'font-weight:{800 if ok else 600};color:{INK if ok else MUTED}">{label}</div></td>')
    cells = step(bool(p.get("pet")), "Pet") + step(bool(p.get("food")), "Ração") + step(bool(p.get("push")), "Notificações") + step(bool(p.get("location")), "Localização")
    return (f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;background:#F8FAFC;border:1px solid {LINE};'
            f'border-radius:14px"><tr><td style="padding:14px 8px 12px"><div style="text-align:center;font-size:11.5px;font-weight:800;'
            f'letter-spacing:.08em;color:{MUTED}">O SEU PETMOL HOJE</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
            f'style="margin-top:10px"><tr>{cells}</tr></table></td></tr></table>')


def build_email(
    name: Optional[str], user_id: str, *, unsubscribe_url: str,
    link: Callable[[str], str] = destination, banner_url: str = BANNER, loja_url: str = LOJA_IMG,
    deadline: Optional[str] = None, pet_of: Optional[str] = None, progress: Optional[dict] = None,
    company_line: Optional[str] = None,
) -> tuple[str, str, str]:
    """`link(nome_do_botao)` devolve a URL do botão (rastreada no envio real, direta na pré-visualização).

    Gatilhos (todos opcionais, todos VERDADEIROS por construção):
    - `deadline`: NÃO USADO na campanha (o dono tirou a data-limite). Se um dia houver uma data REAL, ela aparece; sem ela, não há
      escassez no e-mail: nunca inventamos prazo.
    - `pet_of` ("do Baby"/"da Mel"): personaliza o botão da ração.
    - `progress` ({"pet","food","push","location"}: bool): quadro "o seu PETMOL hoje", vindo de dados reais da conta.
    O e-mail é UM modelo só: o que pede (pet, ração, notificações, localização) e o que agradece vêm de `progress`. Se `progress`
    não vier, assume pet cadastrado e mais nada (conta recém-criada).
    """
    first = _first(name)
    ola = f"Olá, {escape(first)}!" if first else "Olá!"
    ola_txt = f"Olá, {first}!" if first else "Olá!"
    L = {k: link(k) for k in LINKS}
    pg = {"pet": True, "food": False, "push": False, "location": False, **(progress or {})}
    has_pet, has_food, has_push, has_loc = (bool(pg[k]) for k in ("pet", "food", "push", "location"))
    ration_title = f"Cadastre a ração {pet_of}" if pet_of else "Cadastre a ração"
    todo: list[tuple[str, str, str, str, str, str]] = []   # (título, descrição, link, rótulo do botão, botão principal, linha de perda)
    if not has_pet:
        todo.append(("Cadastre o seu pet", "É o primeiro passo: com o pet cadastrado, o PETMOL passa a acompanhar ração, vacinas e lembretes.",
                     L["pet"], "Cadastrar", "Cadastrar o meu pet", "Sem um pet cadastrado, o PETMOL não tem o que acompanhar."))
    if has_pet and not has_food:
        todo.append((ration_title, "O PETMOL estima quando ela acaba e avisa antes. Sem isso, o lembrete não chega.", L["alimentacao"], "Cadastrar",
                     f"Cadastrar a ração {pet_of}" if pet_of else "Cadastrar a ração agora", "Sem a ração cadastrada, o lembrete não chega."))
    if not has_push:
        todo.append(("Ative as notificações", "É por elas que os lembretes diários e mensais chegam até você, na hora certa.", L["notificacoes"], "Ativar",
                     "Ativar as notificações", "Sem as notificações, os lembretes não chegam até você."))
    if not has_loc:
        todo.append(("Ative a localização", "Assim o Pet Sumido avisa você quando um pet some perto de casa. É opcional, e você desativa quando quiser.",
                     L["localizacao"], "Ativar", "Ativar a localização", ""))
    n = len(todo)
    primary_label, primary_link = (todo[0][4], todo[0][2]) if todo else ("Abrir o PETMOL", L["botao"])
    loss = next((t[5] for t in todo if t[5]), "")
    thanks = (("Obrigado por já ter ativado as notificações. " if has_push else "") + ("Obrigado por já ter cadastrado a ração. " if has_food else ""))
    for_whom = f'para {escape(_pet_ref(pet_of))}' if (pet_of and has_pet) else "para você"
    count_word = {1: "É um passo", 2: "São dois passos", 3: "São três passos", 4: "São quatro passos"}.get(n, "Poucos passos")

    def h(t: str, color: str = INK) -> str:
        return f'<div style="margin:0 0 8px;font-size:19px;font-weight:800;color:{color};line-height:1.3">{t}</div>'

    def para(t: str, color: str = "#334155") -> str:
        return f'<div style="margin:0;font-size:15.5px;color:{color};line-height:1.65">{t}</div>'

    head = (
        '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">'
        '<title>Você continua com o PETMOL gratuito</title>'
        '<style>'
        'body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}'
        'img{-ms-interpolation-mode:bicubic}'
        '@media (max-width:520px){.px{padding-left:18px!important;padding-right:18px!important}'
        '.h1{font-size:25px!important}.btn-cell{max-width:100%!important;text-align:left!important}'
        '.outer{padding:0!important}.card{border-radius:0!important;border-left:0!important;border-right:0!important}}'
        '</style></head>'
    )

    body = (
        f'<body style="margin:0;padding:0;background:#E9EEF6"><div style="display:none;max-height:0;overflow:hidden;opacity:0;'
        f'color:transparent;font-size:1px;line-height:1px">{escape(PREHEADER)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>'
        '<div class="outer" style="background:#E9EEF6;padding:20px 10px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\','
        'Roboto,Helvetica,Arial,sans-serif">'
        '<table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;'
        'background:#FFFFFF;border:1px solid #D5DEEC;border-radius:20px;overflow:hidden">'

        # ── Herói ──
        f'<tr><td bgcolor="{BRIGHT}" style="background:{BRIGHT}"><a href="{escape(L["logo"])}" style="text-decoration:none">'
        f'<img src="{banner_url}" width="640" alt="Petmol" style="display:block;width:100%;height:auto;border:0"></a></td></tr>'
        f'<tr><td class="px" bgcolor="{BRAND}" align="center" style="background:{BRAND};background-image:linear-gradient(180deg,{BRIGHT} 0%,{NAVY} 100%);'
        'padding:6px 32px 34px;text-align:center">'
        '<div style="display:inline-block;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.35);border-radius:999px;'
        'padding:6px 14px;font-size:12px;font-weight:800;letter-spacing:.08em;color:#FFFFFF;text-transform:uppercase">'
        '&#10003; Versão gratuita mantida</div>'
        '<div class="h1" style="margin-top:16px;font-size:30px;font-weight:800;line-height:1.2;color:#FFFFFF">'
        'Você continua com o PETMOL gratuito.</div>'
        '<div style="margin-top:10px;font-size:17px;line-height:1.5;color:#CFE0FF">E queremos ser sinceros com você.</div>'
        + (f'<div style="margin-top:16px"><span style="display:inline-block;background:{GOLD};color:#3B2A00;border-radius:12px;'
           f'padding:9px 16px;font-size:14px;font-weight:800;line-height:1.35">Cadastre até {escape(deadline)} e continue como está</span></div>'
           if deadline else '')
        + '</td></tr>'

        # ── Abertura ──
        '<tr><td class="px" style="padding:28px 32px 6px">'
        + para(f'{ola} {thanks}Quem já tem o PETMOL <strong style="color:{INK}">permanece com a versão gratuita</strong>. '
               'Nada muda na sua conta agora. '
               + (f'Falta <strong style="color:{INK}">só um passo</strong> para o app continuar útil {for_whom}.' if n == 1
                  else f'Só pedimos <strong style="color:{INK}">alguns cadastros</strong> para o app continuar útil {for_whom}.')
               + (f' <strong style="color:{INK}">{loss}</strong>' if loss else ''))
        + '<div style="margin-top:16px">' + _button(primary_link, escape(primary_label), full=True) + '</div>'
        + f'<div style="margin-top:8px;text-align:center;font-size:12.5px;color:{MUTED}">Leva cerca de 30 segundos. Veja abaixo o que acontece com contas sem nenhum cadastro.</div>'
        + _progress(pg)
        + '</td></tr>'

        # ── Como se mantém (texto + print lado a lado; empilha no celular) ──
        '<tr><td class="px" style="padding:18px 32px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        f'style="background:{PALE};border-radius:16px"><tr><td style="padding:22px 22px 18px;font-size:0">'
        '<div style="display:inline-block;width:100%;max-width:300px;vertical-align:top;font-size:15px">'
        + h("Como o PETMOL se mantém", BRAND)
        + para('Na versão gratuita, nós não cobramos nada de você. Nossa remuneração vem de um único lugar: quando você compra um '
               'produto pela <strong style="color:#0F172A">Loja do Pet</strong>, dentro do app, a loja parceira nos paga uma pequena comissão. '
               '<strong style="color:#0F172A">Você não paga nada a mais por isso</strong>, e é essa comissão que paga o servidor, o desenvolvimento e o '
               'cuidado com o app.')
        + '</div>'
        '<div style="display:inline-block;width:100%;max-width:220px;vertical-align:top;font-size:15px;text-align:center;padding-top:4px">'
        f'<a href="{escape(L["loja"])}" style="text-decoration:none"><img src="{loja_url}" width="190" alt="Loja do Pet no app PETMOL" '
        'style="display:block;margin:0 auto;width:190px;max-width:100%;height:auto;border:1px solid #C9D7EE;border-radius:18px"></a>'
        f'<div style="margin-top:6px;font-size:11px;color:{MUTED};line-height:1.4">Imagem ilustrativa. Produtos, preços e ofertas mudam.</div>'
        '</div></td></tr></table></td></tr>'

        # ── O que vem por aí (cartão escuro) ──
        '<tr><td class="px" style="padding:18px 32px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        f'style="background:{NAVY};background-image:linear-gradient(160deg,{NAVY} 0%,#123C93 100%);border-radius:16px"><tr>'
        '<td style="padding:22px 22px 20px">'
        f'<span style="display:inline-block;background:{GOLD};color:#3B2A00;border-radius:999px;padding:4px 11px;font-size:11px;'
        'font-weight:800;letter-spacing:.1em">VERSÃO PRÓ</span>'
        '<div style="margin-top:10px;font-size:19px;font-weight:800;color:#FFFFFF;line-height:1.3">O que vem por aí</div>'
        '<div style="margin-top:8px;font-size:15px;color:#DCE7FF;line-height:1.65">Muito em breve, quem chegar ao PETMOL pela primeira '
        'vez entrará na <strong style="color:#FFFFFF">versão Pró</strong>, por assinatura, com <strong style="color:#FFFFFF">Pet Sumido sem '
        'limites</strong> e <strong style="color:#FFFFFF">lembretes diários e mensais</strong>. Essa é a forma de o app crescer de maneira '
        'sustentável.</div></td></tr></table></td></tr>'

        # ── Faça agora ──
        '<tr><td class="px" style="padding:26px 32px 4px">'
        + h("Faça agora e continue com o PETMOL gratuito")
        + para(f"{count_word}, cada um leva você direto à tela certa. Leva menos de um minuto." if n > 1
               else "É um passo, que leva você direto à tela certa. Leva menos de um minuto.")
        + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px">'
        + "".join(_action(i + 1, t[0], t[1], t[2], t[3]) for i, t in enumerate(todo))
        + '</table>'
        + f'<div style="margin-top:4px;font-size:13px;color:{MUTED};line-height:1.6">Também ajudam: '
          f'<a href="{escape(L["vacinas"])}" style="color:{BRAND};font-weight:800;text-decoration:underline">cadastrar as vacinas</a> e '
          f'<a href="{escape(L["loja"])}" style="color:{BRAND};font-weight:800;text-decoration:underline">comprar na Loja do Pet</a>, '
          'que é o que mantém o app.</div>'
        + '</td></tr>'

        # ── Transparência ──
        '<tr><td class="px" style="padding:16px 32px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        f'style="background:#F8FAFC;border-left:4px solid {BRAND};border-radius:12px"><tr><td style="padding:16px 18px">'
        + h("Uma última coisa, com transparência")
        + para('A versão gratuita só faz sentido se for útil para você. '
               + (f'A partir de <strong style="color:{INK}">{escape(deadline)}</strong>, vamos entrar em contato com quem não tiver nenhum destes cadastros '
                  '(ração, notificações e localização) para saber se quer continuar. ' if deadline else
                  'Se uma conta ficar muito tempo sem nenhum cadastro, entraremos em contato para saber se você quer continuar. ')
               + f'<strong style="color:{INK}">Nenhuma conta ou cadastro será excluído ou removido sem o seu consentimento.</strong> '
               'Preferimos o PETMOL funcionando para o seu pet.')
        + '</td></tr></table></td></tr>'

        # ── Botão principal ──
        '<tr><td class="px" style="padding:24px 32px 6px">'
        + _button(L["botao"], "Abrir o PETMOL e começar", full=True)
        + f'<div style="margin-top:9px;text-align:center;font-size:12.5px;color:{MUTED}">Na página que abrir, toque em <strong>Abrir</strong>.</div>'
        '</td></tr>'
        f'<tr><td class="px" style="padding:20px 32px 30px;text-align:center;font-size:15px;color:#334155;line-height:1.6">'
        f'Obrigado por cuidar do seu pet com a gente. ❤️🐾<br><span style="color:{MUTED}">Equipe PETMOL</span></td></tr>'

        # ── Rodapé ──
        f'<tr><td bgcolor="#F4F7FB" style="background:#F4F7FB;border-top:1px solid {LINE};padding:16px 20px;text-align:center;'
        f'font-size:12px;color:{MUTED};line-height:1.6"><span style="font-weight:800;color:{BRAND};font-size:14px">Petmol</span><br>'
        f'Você recebe este e-mail por ter uma conta no PETMOL.<br>'
        + (f'{escape(company_line)}<br>' if company_line else '')
        + f'<a href="{PUBLIC_BASE}/privacy" style="color:#94A3B8;text-decoration:underline">Política de Privacidade</a> · '
          f'<a href="{PUBLIC_BASE}/terms" style="color:#94A3B8;text-decoration:underline">Termos de Uso</a><br>'
        + f'<a href="{escape(unsubscribe_url)}" '
        'style="color:#94A3B8;text-decoration:underline">Não quer mais receber nossos e-mails? Clique aqui.</a></td></tr>'
        '</table></div></body></html>'
    )

    text = (
        "Você continua com o PETMOL gratuito. E queremos ser sinceros com você.\n\n"
        f"{ola_txt} Quem já tem o PETMOL permanece com a versão gratuita. Nada muda na sua conta.\n\n"
        "COMO O PETMOL SE MANTÉM\nNa versão gratuita, nós não cobramos nada de você. Nossa remuneração vem de um único lugar: quando você "
        "compra um produto pela Loja do Pet, dentro do app, a loja parceira nos paga uma pequena comissão. Você não paga nada a mais por isso, "
        "e é essa comissão que paga o servidor, o desenvolvimento e o cuidado com o app.\n\n"
        "O QUE VEM POR AÍ\nMuito em breve, quem chegar ao PETMOL pela primeira vez entrará na versão Pró, por assinatura, com Pet Sumido "
        "sem limites e lembretes diários e mensais. Essa é a forma de o app crescer de maneira sustentável.\n\n"
        "FAÇA AGORA E MANTENHA O PETMOL GRATUITO (leva menos de um minuto)\n"
        + "".join(f"{i + 1}. {t[0]}: {t[2]}\n" for i, t in enumerate(todo))
        + f"Também ajudam: vacinas ({L['vacinas']}) e compras na Loja do Pet ({L['loja']}).\n\n"
        "UMA ÚLTIMA COISA, COM TRANSPARÊNCIA\nA versão gratuita só faz sentido se for útil para você. "
        + (f"A partir de {deadline}, vamos entrar em contato com quem não tiver nenhum destes cadastros (ração, notificações e localização) "
           "para saber se quer continuar. " if deadline else
           "Se uma conta ficar muito tempo sem nenhum cadastro, entraremos em contato para saber se você quer continuar. ")
        + "Nenhuma conta ou cadastro será excluído ou removido sem o seu consentimento. Preferimos o PETMOL funcionando para o seu pet.\n\n"
        f"Abrir o PETMOL e começar: {L['botao']}\n\nObrigado por cuidar do seu pet com a gente.\nEquipe PETMOL\n\n"
        + (f"{company_line}\n" if company_line else "")
        + f"Política de Privacidade: {PUBLIC_BASE}/privacy · Termos de Uso: {PUBLIC_BASE}/terms\n"
        + f"Para parar de receber nossos e-mails: {unsubscribe_url}\n"
    )
    return SUBJECT, text, head + body
