"""
Configuration settings for the price service.

PRODUCTION: All settings via ENV. No hardcoded domains.
"""
import os
import re
from urllib.parse import urlsplit, urlunsplit
from functools import lru_cache
from pathlib import Path
from typing import List, Optional, Set

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


_CONFIG_DIR = Path(__file__).resolve().parent.parent
_ENV_FILES = (
    str(_CONFIG_DIR / ".secrets" / ".env"),
    str(_CONFIG_DIR / ".env"),
)


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=_ENV_FILES,
        env_file_encoding="utf-8",
        extra="ignore",
    )
    
    # Environment
    env: str = "dev"  # "dev" or "prod"
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    frontend_url: str = "https://petmol.com.br"
    
    # CORS - Via ENV, no hardcoded domains
    cors_origins: str = "http://localhost:3000,http://localhost:8081"
    cors_origin_regex: str = r"https://.*\.vercel\.app"
    
    # Cache
    cache_ttl: int = 300  # 5 minutes
    suggest_cache_ttl: int = 180  # 3 minutes for suggest autocomplete
    
    # Rate limiting
    rate_limit_requests: int = 100
    rate_limit_window: int = 60  # seconds
    
    # Mercado Livre API — backend-only OAuth Client Credentials.
    # Client Secret fica apenas no env do backend/VPS; nunca no frontend,
    # banco, logs ou repositório. Não usamos Authorization Code, PKCE,
    # Refresh Token nem MERCADOLIVRE_ACCESS_TOKEN fixo.
    mercadolivre_client_id: Optional[str] = None
    mercadolivre_client_secret: Optional[str] = None
    # Legacy/env antigo ignorado operacionalmente. Mantido só para não
    # quebrar ambientes que ainda tenham a variável definida.
    mercadolivre_access_token: Optional[str] = None
    
    # Google Maps/Places API - unified key
    google_maps_api_key: Optional[str] = None
    google_places_key: Optional[str] = None  # Legacy, maps to google_maps_api_key
    
    # Feature flags - countries with price comparison enabled
    prices_enabled_countries: str = "BR,AR,MX,CO,CL"

    # Feature flag — ativa busca real via MercadoLivreProvider no backend.
    # Padrão false: comportamento idêntico ao atual (candidates=[]).
    enable_ml_provider: bool = False
    # Flag separada de exposição pública em /search. Deve permanecer false
    # enquanto não houver link/método oficial de afiliado confirmado para ML.
    mercadolivre_public_offers_enabled: bool = False
    # Sinalização comercial; não gera link sozinha. Só pode virar true quando
    # existir método oficial confirmado e implementado em camada própria.
    mercadolivre_affiliate_enabled: bool = False
    # Marketplace offers (Shopee hoje) mudam preço rápido. A janela abaixo
    # define quando um preço passa a ser marcado como candidato a refresh.
    # Por padrão a rota pública NÃO espera API externa: retorna cache
    # monetizado imediatamente e marca stale quando necessário. Refresh
    # inline só deve ser ligado em ambiente controlado; em produção ele
    # pode fazer /commerce/offers estourar o timeout do app.
    # Fase 1-D / decisão P3: refresh inline pro GTIN recém-aberto. DESLIGADO
    # por padrão — _refresh_marketplace_offer é síncrono e bloqueia o event
    # loop (sync_shopee_offer_for_gtin faz várias chamadas HTTP). Ligar só
    # depois de mover pra thread/executor. Ver docs/PRODUCT_IDENTITY.md.
    marketplace_offer_refresh_after_minutes: int = 360
    marketplace_offer_inline_refresh_enabled: bool = False

    # Preço real da Cobasi (API pública de catálogo VTEX) para a Loja do Baby.
    # Cache longo de propósito — reduz volume de chamadas à Cobasi (evitar
    # bloqueio) e o preço não precisa ser por segundo para o caso de uso.
    commerce_pricing_enabled: bool = True
    commerce_pricing_cache_ttl: int = 21600  # 6 horas

    # Database - usa caminho relativo que funciona local e produção
    database_url: str = f"sqlite:///{os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'petmol.db'))}"

    # Auth / JWT
    jwt_secret: str = "change-me"
    jwt_access_token_expire_minutes: int = 60 * 24 * 7


    # Admin bootstrap (used to promote first admin safely)
    admin_bootstrap_secret: Optional[str] = None

    # Admin master: the ONLY email ever allowed through get_current_admin.
    # Overridable via env var, but defaults to the real value so this holds
    # even if the server's env file doesn't set it.
    admin_master_email: str = "leonardofmol@gmail.com"
    admin_master_password: Optional[str] = None
    admin_master_name: Optional[str] = None
    admin_master_role: str = "master"

    # Read-only ops API key: grants GET-only admin endpoints (stats,
    # user listing) without a password login. Never accepted on any
    # write/delete route. Unset by default — disabled unless configured
    # in the server's env file.
    admin_ops_api_key: Optional[str] = None

    # ── Storage ──────────────────────────────────────────────────────────
    storage_backend: str = "local"     # "local" | "r2"
    uploads_dir: str = "uploads"

    # Cloudflare R2 (S3-compatible)
    r2_endpoint: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket: str = "petmol-uploads"

    # Gemini
    gemini_api_key: Optional[str] = None

    # Cosmos Bluesoft API - backend only.
    cosmos_api_base_url: str = "https://api.cosmos.bluesoft.com.br"
    cosmos_api_token: Optional[str] = None

    # RSC GTIN API - preencha usuário/senha apenas no .env/.secrets do backend.
    gtin_api_base_url: str = "https://gtin.rscsistemas.com.br"
    gtin_api_username: Optional[str] = None
    gtin_api_password: Optional[str] = None

    # Open Food Facts read-only API.
    off_api_base_url: str = "https://world.openfoodfacts.org"
    off_user_agent: Optional[str] = None
    opf_api_base_url: str = "https://world.openproductsfacts.org"

    # ── Web Push Notifications (VAPID) ────────────────────────────────────
    vapid_public_key: Optional[str] = None
    vapid_private_key: Optional[str] = None
    vapid_claims_email: str = "mailto:contato@petmol.app"

    # ── Fale com o Petmol (contato do tutor) ──────────────────────────────
    # Caixa que recebe as mensagens enviadas pela tela "Fale com o Petmol".
    # SMTP reaproveita as mesmas envs do OTP (SMTP_HOST/PORT/USER/PASS/FROM).
    contact_inbox_email: str = "gerenciamento@petmol.com.br"

    # ── Afiliados / Motor de Intenção ─────────────────────────────────────
    # Deixe vazio para desabilitar redirect (retorna 503 controlado)
    petz_affiliate_url: Optional[str] = None
    cobasi_affiliate_url: Optional[str] = None
    petlove_dog_life_url: Optional[str] = None
    petlove_affiliate_enabled: bool = False

    # Affiliate-only commerce: em produção, uma loja/oferta só pode ser
    # apresentada como opção de compra quando existe link monetizável real.
    # None (padrão) = amarrado a `env` (prod → exigido; dev → fallback
    # direto permitido para teste). Setar explicitamente só se precisar
    # destoar do `env` (ex: testar o modo estrito em dev).
    affiliate_only_commerce: Optional[bool] = None

    # Estratégia de monetização da Cobasi (ver cobasi_provider.py /
    # cobasi_utm.py / docs/AFFILIATES.md):
    #   cached   — usa ProductAffiliateLink cadastrado manualmente.
    #   utm      — gera URL com UTM dinamicamente, sem cadastro manual.
    #             Padrão desde 29/08/2026 — confirmado manualmente via
    #             painel MAIS (URL de produto real colada no gerador de
    #             link retornou uma página Cobasi válida, não 404; UTM
    #             utm_source=mais&utm_medium=maisplataforma&utm_campaign=
    #             lojapetmol é o mesmo padrão do link gerado — ver
    #             cobasi_utm.py). Decisão de produto: PETMOL nunca
    #             monetiza via Awin (nenhum merchant) — Awin fica restrito
    #             a nome/foto/preço (busca e feed), nunca ao clique de
    #             compra. Ver AWIN_PUBLIC_COMMERCE_MERCHANTS em
    #             awin_advertisers.py (hoje vazio) e MERCHANT_ROUTE_POLICIES
    #             em merchant_routes.py.
    #   api      — reservado para API oficial futura. Não implementado.
    #   disabled — MAIS completamente desativado (nem a busca ao vivo na
    #             VTEX roda — ver CobasiProvider.should_run()); Cobasi não
    #             monetiza nada nesse modo (Awin nunca é usado pra vender,
    #             então não há rota alternativa).
    cobasi_affiliate_mode: str = "utm"

    @field_validator("cobasi_affiliate_mode")
    @classmethod
    def _validate_cobasi_affiliate_mode(cls, value: str) -> str:
        allowed = {"cached", "utm", "api", "disabled"}
        if value not in allowed:
            raise ValueError(f"cobasi_affiliate_mode deve ser um de {sorted(allowed)}, recebeu {value!r}")
        return value

    @property
    def affiliate_only_commerce_enforced(self) -> bool:
        if self.affiliate_only_commerce is not None:
            return self.affiliate_only_commerce
        return self.env == "prod"

    # ── Awin (rede de afiliados) — MASTER GATE de exposição pública ─────────
    # Semântica única e testável (ver test_awin_flags.py):
    #
    #   awin_enabled=False (padrão)
    #     Nenhum link Awin pode chegar ao tutor, ponto final. Nenhum
    #     provider Awin é registrado em build_default_engine() (o engine
    #     usado por TODOS os endpoints públicos: /commerce/offers,
    #     /commerce/awin-search). Um `merchant=` explícito no endpoint de
    #     busca NÃO contorna isto — ver main.py. NÃO afeta sincronização:
    #     o job de sync (awin_feed_sync.py) roda independente deste flag,
    #     controlado só por awin_sync_enabled abaixo — "sincronizar
    #     catálogo" e "exibir oferta" são decisões separadas de propósito.
    #
    #   awin_enabled=True e awin_shadow_mode=True
    #     Ainda nenhum link Awin chega ao tutor — shadow mode é sempre mais
    #     restritivo, nunca um jeito de "ligar parcialmente". Serve só pra
    #     preparar/validar resolução interna (ex: métricas de cobertura,
    #     comando admin/CLI) antes de expor de verdade. Nenhum endpoint
    #     público pode ficar mais permissivo por causa deste flag.
    #
    #   awin_enabled=True e awin_shadow_mode=False
    #     AwinFeedProvider é registrado SÓ para merchants com
    #     is_awin_merchant_enabled(merchant)=True individualmente (ver
    #     awin_advertisers.py) — meta-flag global não substitui a checagem
    #     por merchant, as duas precisam estar True. Mesmo assim, a rota
    #     Awin só "vence" um merchant que já tem oferta MAIS quando
    #     merchant_routes.py autorizar (ver preferred_route/fallback_routes)
    #     — nunca troca a rota preferida sozinho.
    #
    # Publisher ID não é segredo (é público, aparece no painel/contrato) —
    # por isso tem valor padrão no código.
    awin_publisher_id: str = "3032803"
    # Token OAuth2 da Publisher API da Awin (reporting/transações) — NÃO é
    # o mesmo usado pra baixar o feed de produtos. Não consumido em código
    # ainda (reservado pra quando validarmos comissão via API de relatórios).
    awin_oauth_token: Optional[str] = None
    # Chave usada em productdata.awin.com/datafeed/download/apikey/{...}/ —
    # é o que awin_feed_sync.py de fato usa pra baixar o feed. Segredo real;
    # nunca commitar um valor válido (fica em env var no VPS, como as demais
    # credenciais — ver docs/DEPLOYMENT.md pro caminho certo do env file).
    awin_datafeed_key: Optional[str] = None
    # MASTER GATE — controla exposição pública (ver docstring acima).
    # Deve continuar False até validação comercial+técnica real autorizada.
    awin_enabled: bool = False
    # Restringe awin_enabled=True a resolução interna — nunca expõe link
    # nem torna o catálogo pesquisável publicamente (ver docstring acima).
    awin_shadow_mode: bool = False
    # Kill-switch do JOB DE SYNC (scripts/sync_awin_feed.py) — independente
    # de awin_enabled/awin_shadow_mode de propósito: deve ser possível
    # sincronizar/atualizar o catálogo (inclusive pra preparar shadow mode
    # ou a próxima loja) sem que isso ligue qualquer exposição ao tutor.
    # Default True — sync em si é seguro (só grava Postgres local, nunca
    # abre link pro tutor); False só pra pausar o job sem mexer no restante.
    awin_sync_enabled: bool = True
    # Conservador de propósito — feeds de afiliados não mudam a cada minuto.
    awin_sync_interval_minutes: int = 1440
    # Catálogo mais velho que isso é considerado stale — AwinFeedProvider
    # não oferta nada de um merchant cujo último sync bem-sucedido passou
    # desse limite (ver awin_feed_provider.py). Coerente com sync diário
    # (1440min): folga de meio dia antes de considerar stale.
    awin_stale_after_hours: int = 36
    # Mecanismo de teste controlado pra validar comissão com uma compra
    # real (ver docs/AFFILIATES.md §7): um GTIN específico, setado só
    # server-side (nunca endpoint público, nunca frontend), que a Awin
    # pode responder mesmo com awin_enabled=False globalmente — NÃO liga
    # a Awin pro resto do catálogo, só pra este produto. Setar/limpar
    # direto no env do VPS; reversível a qualquer momento sem deploy.
    awin_test_gtin: Optional[str] = None

    # ── Amazon Associados ────────────────────────────────────────────────
    # Conta/tag anterior encerrada em 22/08/2026. Não há default seguro:
    # reativação futura exige nova aprovação e nova tag válida explicitamente
    # configurada; a tag antiga não pode voltar como fallback.
    amazon_associate_tag: Optional[str] = None
    # Credenciais reservadas para uma integração futura oficial, caso exista
    # nova aprovação. Nenhum endpoint deve gerar tráfego Amazon enquanto a
    # integração estiver desativada.
    amazon_creators_client_id: Optional[str] = None
    amazon_creators_client_secret: Optional[str] = None
    amazon_marketplace: Optional[str] = None

    # ── Shopee Affiliates ────────────────────────────────────────────────
    # Master gate — separado de qualquer status "commercial"/"cadastrado"
    # (mesmo padrão do awin_enabled). Os três pré-requisitos (fiscal/
    # bancário aprovado, petmol.com.br mídia aprovada, API oficial
    # liberada) foram cumpridos em 21/08/2026 — ver docs/AFFILIATES.md
    # seção Shopee. Ligar isto sozinho NÃO expõe nada a nenhum tutor:
    # MarketplaceOfferProvider só serve o que já existe em MarketplaceOffer
    # (marketplace_offer_provider.py), e nenhuma linha é criada em
    # produção sem alguém rodar scripts/sync_shopee_offers.py <gtin> pros
    # produtos desejados (ou cadastrar manualmente via admin) — isso
    # continua sendo uma decisão separada e deliberada.
    #
    # LIGADO de novo (30/08/2026, decisão de produto) depois do projeto de
    # precisão (#120): GTIN como 1ª palavra-chave da busca, hard-fail de cm
    # pra coleira, sync noturno `source=categories` (re-casa+re-preço toda
    # noite, sem depender da Awin), e — a rede de segurança principal —
    # oferta de marketplace com +36h NÃO mostra mais preço-número
    # (marketplace_offer_provider → price=None → "Conferir preço na loja").
    # Então mesmo antes do próximo sync noturno, nenhuma oferta Shopee
    # exibe um número velho/errado. Gap residual: match de variante errada
    # (coleira "M" vs "Pequenos e Médios") — mitigado por
    # `scripts/audit_shopee_offers.py --deactivate-invalid` + revisão à
    # mão (docs/LAUNCH.md §7). Pra desligar de novo: flip pra False (ou
    # SHOPEE_AFFILIATE_ENABLED=false no env).
    #
    # DESLIGADO de novo (05/09/2026, decisão de produto): winding-down da
    # Shopee. Quem compra na Shopee vai lá pesquisar sozinho — o único
    # ponto de monetização Shopee que fica de pé é o card estático da
    # vitrine no rodapé da Loja do Pet (shortlink de afiliado no
    # frontend, `homeShoppingPartners.ts`, NÃO depende desta flag). Com
    # isso False: MarketplaceOfferProvider não serve nem agenda discovery
    # (defesa em profundidade — o frontend já filtra merchant=shopee de
    # fetchCommerceOffers desde 05/09), e o gatilho do sync noturno
    # (admin/shopee_sync_router.start_sync_run) responde no-op. Reverter:
    # SHOPEE_AFFILIATE_ENABLED=true no env (ou True aqui). Ver
    # docs/AFFILIATES.md §"Shopee só vitrine" e [[project_shopee_so_vitrine]].
    shopee_affiliate_enabled: bool = False
    # Documentação de pendência externa, não uma flag de gate — setar isto
    # não aprova nada sozinho; é só pra não perder de vista qual mídia
    # estamos tentando confirmar no Portal do Afiliado.
    shopee_approved_media: str = "https://www.petmol.com.br"
    # Credenciais da Plataforma Aberta de Afiliados da Shopee (API GraphQL
    # real, obtida no painel em 21/08/2026) — usadas SÓ pelo job de sync
    # (shopee_offer_sync.py/scripts/sync_shopee_offers.py), nunca no
    # caminho de requisição do tutor. Configurar isto não liga nada pro
    # tutor sozinho — shopee_affiliate_enabled continua sendo o gate real.
    shopee_affiliate_app_id: Optional[str] = None
    shopee_affiliate_app_secret: Optional[str] = None
    # MarketplaceOffer é cache operacional do último preço confirmado pelo
    # job/API do marketplace. Se ficar mais velho que isso, não deve ser
    # exibido como opção de compra atual.
    marketplace_offer_stale_after_hours: int = 36
    # Fase 1-D: abaixo de _stale_after_hours a oferta é "fresca"; entre isso
    # e _show_stale_after_hours o último preço ainda aparece marcado
    # "confirme na loja"; acima disso, sem número.
    marketplace_offer_show_stale_after_hours: int = 240
    # IDENTIDADE PRIMEIRO NO SERVING. Quando ligado, o provider só serve
    # oferta marketplace cuja identidade está COMPROVADA (result.accepted);
    # oferta legada sem título/GTIN ou com conflito não aparece (a Cobasi
    # cobre a tela). DESLIGADO por padrão: o despejo de agosto tem ~60k
    # linhas sem título e ligar isso antes de enriquecer a fila A derruba
    # a cobertura Shopee da vitrine. Liga depois do enriquecimento.
    marketplace_strict_identity_serving: bool = False
    # Fase 1-A/B: expande o produto do tutor pros EANs irmãos do grupo de
    # SKU e busca preço em cada um. Aditivo — nunca remove oferta. DESLIGADO
    # por padrão até o passo de irmãos ficar 100% fora do event loop (as
    # queries síncronas dos providers travavam o worker sob carga real).
    sku_grouping_enabled: bool = False
    sku_grouping_max_siblings: int = 2

    # ── Cobertura Shopee: discovery on-demand + job noturno ─────────────
    # Quando o tutor abre um produto com GTIN confiável e ainda não há
    # MarketplaceOffer Shopee, agendamos UM sync em background. Este é o
    # cooldown por GTIN (persistido em shopee_discovery_attempts) pra não
    # repetir a cada request/restart. 12h: o job noturno cobre o resto e
    # o tutor costuma voltar no dia seguinte; erro de API tem retry curto
    # (1h, ver shopee_discovery_attempt.py).
    shopee_miss_retry_hours: int = 12
    # Job noturno (source=active_products): teto de produtos por execução
    # e pausa entre chamadas à API. Se bater o teto, para limpo e a
    # próxima madrugada continua pelos mais antigos. 900 = backlog de
    # ~10-11k cicla em ~12 noites (era ~27 com 400); a 0,4s + variantes
    # dá ~1-1,5h de execução, dentro da janela noturna.
    shopee_sync_max_products_per_run: int = 900
    shopee_sync_request_delay_seconds: float = 0.4

    # Token dedicado pra disparar/acompanhar o lote de sync via HTTPS
    # (admin/shopee_sync_router.py) — deliberadamente separado de
    # ADMIN_OPS_API_KEY (aquele é só leitura, nunca em rota de escrita;
    # este endpoint grava MarketplaceOffer, então nunca reaproveita a
    # chave read-only). None por padrão: sem isto configurado, o endpoint
    # sempre responde 401, mesmo com qualquer header enviado.
    shopee_sync_trigger_token: Optional[str] = None

    # ── Petz (aprendizado por produto) ──────────────────────────────────
    # Master gate — mesmo papel de shopee_affiliate_enabled/
    # mercadolivre_affiliate_enabled. Ligado por padrão desde 04/09/2026
    # (ver petz_publicly_disabled abaixo pro histórico completo). Ligar
    # isto sozinho não expõe nada além do necessário: PetzProvider só
    # serve o que já existir em ProductAffiliateLink(merchant="petz"), e
    # nenhuma linha é criada sem confirmação humana explícita via
    # admin/petz_router.py.
    petz_affiliate_enabled: bool = True
    # Prova comercial SEPARADA do gate acima (25/08/2026) — distingue
    # "produto confirmado no catálogo Petz" (petz_mapping.match_status)
    # de "o cupom PETTMOL realmente atribui comissão ao PETMOL". A
    # segunda coisa FOI provada com uma compra real testada e confirmada
    # no painel da Petz em 29/08/2026 (ver
    # docs/PETZ_COMMISSION_VALIDATION.md — cookie petzPartner + cupom
    # PETTMOL, 10% aplicado, "loja pettmol do Parceiro Petz" no
    # carrinho). Ligado por padrão desde 04/09/2026 com base nessa prova
    # já documentada — nunca "porque parece razoável que funcione assim".
    petz_coupon_attribution_verified: bool = True
    # Kill-switch de produto: histórico —
    #   2026-08-30: desligado (default True) porque "Ver na Petz" só
    #   levava pra busca/produto do site da Petz, que tem bugs fora do
    #   nosso controle (link da foto abre outro produto/o app).
    #   2026-09-04 (PR #210): o frontend (openPetzPartnerStore) passou a
    #   SEMPRE abrir a Loja Parceira fixa (/parceiro/pettmol) pra
    #   qualquer clique em "Petz" — nunca mais busca ou produto,
    #   independente do que este endpoint devolver. Isso elimina o motivo
    #   original do kill-switch: a página de busca com bugs não é mais
    #   alcançável a partir do app. Reativado (default False) — "Ver na
    #   Petz" por produto específico volta a aparecer (copia PETTMOL +
    #   abre a Loja Parceira, igual ao card da grade).
    petz_publicly_disabled: bool = False

    @field_validator("debug", mode="before")
    @classmethod
    def _coerce_bool_like(cls, value):
        if isinstance(value, bool):
            return value
        if value is None:
            return False
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"1", "true", "yes", "y", "on", "enabled", "debug", "dev", "development"}:
                return True
            if normalized in {"0", "false", "no", "n", "off", "disabled", "release", "prod", "production", ""}:
                return False
        return value
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins from comma-separated string."""
        origins = [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]
        expanded: List[str] = []

        for origin in origins:
            if origin not in expanded:
                expanded.append(origin)

            try:
                parts = urlsplit(origin)
            except Exception:
                continue

            hostname = parts.hostname
            if hostname not in {"localhost", "127.0.0.1"}:
                continue

            alternate_host = "127.0.0.1" if hostname == "localhost" else "localhost"
            netloc = alternate_host
            if parts.port is not None:
                netloc = f"{alternate_host}:{parts.port}"

            alternate_origin = urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))
            if alternate_origin not in expanded:
                expanded.append(alternate_origin)

        return expanded
    
    @property
    def prices_enabled_countries_set(self) -> Set[str]:
        """Get set of countries with price comparison enabled."""
        return {c.strip().upper() for c in self.prices_enabled_countries.split(",") if c.strip()}
    
    @property
    def google_maps_api_key_resolved(self) -> Optional[str]:
        """Get Google Maps API key (fallback to google_places_key for backward compatibility)."""
        return self.google_maps_api_key or self.google_places_key
    
    @property
    def cors_origin_regex_full(self) -> str:
        """Get full CORS origin regex including ngrok for dev."""
        patterns = [self.cors_origin_regex]
        
        # In dev, allow ngrok domains
        if self.env == "dev":
            patterns.extend([
                r"https://.*\.ngrok-free\.app",
                r"https://.*\.ngrok-free\.dev",
                r"https://.*\.ngrok\.io",
                r"https://.*\.ngrok\.app",
            ])
        
        return "|".join(f"({p})" for p in patterns)

    def validate_prod(self) -> None:
        """Raise RuntimeError with clear message if prod config is invalid.
        Never logs secrets."""
        if self.env != "prod":
            return
        errors = []
        if not self.jwt_secret or self.jwt_secret.lower() in ("change-me", "changeme", ""):
            errors.append("JWT_SECRET must be set to a strong random value in prod")
        if not self.database_url.startswith("postgresql"):
            errors.append("DATABASE_URL must be a PostgreSQL URL in prod (got non-postgres URL)")
        if self.storage_backend not in ("r2", "local"):
            errors.append(f"STORAGE_BACKEND must be 'r2' or 'local', got: {self.storage_backend!r}")
        if self.storage_backend == "r2":
            if not self.r2_access_key_id or self.r2_access_key_id == "CHANGE_ME":
                errors.append("R2_ACCESS_KEY_ID must be set when STORAGE_BACKEND=r2")
            if not self.r2_secret_access_key or self.r2_secret_access_key == "CHANGE_ME":
                errors.append("R2_SECRET_ACCESS_KEY must be set when STORAGE_BACKEND=r2")
            if not self.r2_endpoint or self.r2_endpoint == "CHANGE_ME":
                errors.append("R2_ENDPOINT must be set when STORAGE_BACKEND=r2")
        if self.mercadolivre_public_offers_enabled and self.affiliate_only_commerce_enforced and not self.mercadolivre_affiliate_enabled:
            errors.append("MERCADOLIVRE_PUBLIC_OFFERS_ENABLED requires official affiliate monetization in prod")
        if errors:
            msg = "STARTUP FAILED — invalid production configuration:\n"
            for e in errors:
                msg += f"  • {e}\n"
            raise RuntimeError(msg)


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
