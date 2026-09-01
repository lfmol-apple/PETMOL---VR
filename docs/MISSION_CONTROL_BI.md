# Mission Control — Dashboard BI administrativo

Evolução incremental do Mission Control para uma ferramenta administrativa
orientada à decisão de produto. **Somente admin (master) / read-only key.**
Sem deploy, sem alteração de comportamento tutor-facing, sem tocar
CommerceEngine / ProductIdentity / Shopee / Cobasi / Awin / afiliados /
monetização.

---

## 1. Princípio de arquitetura

| Camada | Fonte | Exemplos |
|---|---|---|
| **A — Operacional** | Banco PETMOL | tutor, pet, raça, espécie, sexo, nascimento, peso, ração, vacinas, antiparasitário, vermífugo, medicação, controles ativos, lembretes, RG, documentos |
| **B — Comportamental** | `analytics_product_events` | abriu app / tela / Loja, viu oferta, clicou em Comprar, sessão, plataforma, versão, retorno |
| **C — Aquisição nativa** | App Store Connect / Google Play (futuro) | downloads, instalações, versão instalada, país |

Regra: **nunca duplicar dado operacional em analytics só pra contar.** Se a
resposta certa está no banco operacional (ex.: "quantos pets têm vacina"),
ela vem de lá — não de `vaccine_record_created`.

---

## 2. Inventário de fontes (matriz)

| DADO | TABELA / FONTE | CAMPO | CONFIABILIDADE | EXIBIDO? |
|---|---|---|---|---|
| Tutor | `users` | id, email, name, phone, created_at, updated_at | alta | sim (sem hash/token) |
| Endereço do tutor | `users` | postal_code, street, number, neighborhood, city, state, country | média/alta (preenchido via CEP no perfil) | sim (agregado; presença de campo no detalhe) |
| E-mail verificado / termos | `users` | email_verified, terms_accepted, terms_version | alta | sim |
| Check-in mensal | `users` | monthly_checkin_day/hour + `user_monthly_checkins` | alta | parcial (preferência no detalhe) |
| Pet | `pets` | id, user_id, name, species, breed, birth_date, sex, weight_value/unit, neutered, photo, insurance_provider, created_at | alta | sim |
| `health_data` (blob legado) | `pets.health_data` | JSON | baixa (legado, migrado p/ tabelas) | não exibido cru |
| Alimentação | `feeding_plans` (1/pet) | enabled, mode, food_brand, package_size_kg, daily_amount_g, duration_days, items_json, estimated_end_date, no_consumption_control, updated_at, deleted_at | alta | sim |
| Vacinas | `vaccine_records` | vaccine_name, applied_date, next_dose_date, dose_number, deleted | alta | sim |
| Antiparasitário / vermífugo / coleira | `parasite_control_records` | type (dewormer/flea_tick/heartworm/collar/leishmaniasis), product_name, date_applied, next_due_date, collar_expiry_date, frequency_days, barcode (GTIN), deleted | alta | sim |
| Banho & tosa | `grooming_records` | type, date, next_recommended_date, frequency_days, cost, deleted | alta | sim |
| Medicação | `events` (type='medication') | scheduled_at, next_due_date, status, extra_data (doses) | média/alta | sim |
| Consultas | `events` (type='vet_appointment') | scheduled_at, completed_at | média | sim |
| Peso (histórico) | `events` (type='weight_check') + `pets.weight_value` | scheduled_at / valor atual | média | sim |
| Lembretes | `reminders` | user_id, pet_id, type, remind_at, sent, retry_count | alta | parcial (contadores) |
| Documentos / cofre | `pet_documents` | category, created_at, deleted_at | alta | sim (contagem + estado) |
| Cuidadores / família | `pet_caretakers`, `family_members`, `family_invites` | user_id, pet_id, joined_at | alta | sim (adoção por tutor) |
| RG público | `rg_public` | is_public, view_count, share_count | alta | sim (adoção) |
| Pet Sumido / SOS | `missing_pets` (+ `found_reports`, `pet_sightings`) | user_id, status, lat/lng, created_at, found_at | alta | sim (adoção por tutor); lat/lng **nunca plotado** |
| Push web | `push_subscriptions` | user_id, endpoint, disabled_at, lat/lng | alta | sim (nº dispositivos ativos) |
| Push nativo | `native_push_tokens` | user_id, platform (ios/android), disabled_at | alta (registro); **envio depende de credencial FCM/APNs inexistente** | sim (nº registros) |
| Suporte / "Fale com o Petmol" | `support_feedback` | category, message, created_at | alta | contagem por tutor |
| Eventos de produto (v2) | `analytics_product_events` | event_name, user_id, anonymous_id, session_id, screen, platform, app_version, os, browser, device_class, locale, timezone, received_at, properties_json | média/alta (v2; histórico pré-v2 sem user_id estável) | sim |
| Eventos "Motor de Intenção" (v1) | `analytics_events` | source, cta_type, target, link_type, ip_hash, created_at | média (legado) | usado só por `/metrics/food` |
| Handoffs de estabelecimento | `analytics_clicks` | action, source, service, country_code, platform, created_at | média | não nesta fase |
| Saúde da API | `runtime_metrics` (memória) | requests, errors_5xx, p95_ms | média (janela em memória, reinicia no restart) | sim (aba Operação) |
| Sync Shopee | `shopee_sync_state` | running, percent, matched, match_rate | alta | sim (aba Operação) |
| **Downloads App Store** | **não existe no banco** | — | **indisponível sem integração** | **não inventar** — mostra "não integrado" |
| **Downloads Google Play** | **não existe no banco** | — | **indisponível sem integração** | **não inventar** — mostra "não integrado" |
| **Geo-IP aproximado** | **não coletado** | — | **indisponível** | **não inventar** — só `users.state/city` agregado |
| **Desinstalações** | **não existe** | — | plataforma teria que fornecer | não |
| **CTR de venda / conversão afiliado** | **não existe** | as lojas não expõem | indisponível | não — clique **nunca** é venda |

---

## 3. Regras de estado (determinísticas, derivadas do banco)

`src/admin/analytics/state.py`. Cada funcionalidade por pet resolve para
exatamente um estado, 100% a partir de datas nos próprios registros — sem
evento de analytics, sem LLM.

| Estado | Regra (controles recorrentes: vacina, antiparasitário, banho, medicação) | Feeding |
|---|---|---|
| `NEVER_CONFIGURED` | nenhum registro não-deletado | plano ausente/deletado ou sem dados reais (espelha `hasFoodData`) |
| `ACTIVE` | próxima ação ≤ **21d** atrasada | `enabled` e `updated_at` ≤ **150d** |
| `STALE` | atrasada **21–120d** | `updated_at` **150–300d** |
| `INACTIVE` | atrasada **> 120d** (abandonado) | `enabled=false` ou `updated_at` > **300d** |

"Abandonou X" = `INACTIVE`. "Usa X ativamente" = `ACTIVE`.
Features sem data de próxima ação (peso, consultas) classificam por
recência (`classify_by_recency`). Features de tutor (Pet Sumido, família,
push, Loja) não têm estado por pet — só adoção.

---

## 4. Endpoints (`/v1/admin/analytics/*`, GET, master/readonly-key)

| Endpoint | O que responde |
|---|---|
| `GET /overview` | totais, novos hoje/7d/30d, WAU/MAU/DAU-MAU, sessões, pets/tutor, tutores sem pet, com alimentação, com controle ativo, plataformas, versões, top features, séries temporais 30d, headline de qualidade |
| `GET /activation-funnel` | funil por **usuários únicos**, estado final derivado do banco (conta → pet → perfil básico → alimentação → 1º controle → retornou) |
| `GET /features` | matriz: tutores, pets, ativo/defasado/inativo/nunca, % adoção |
| `GET /features/{key}/population?state=` | drill-down: pets/tutores da célula, paginado |
| `GET /users?page&page_size&search&sort&direction` | tabela paginada/pesquisável: email, cadastro, última atividade, status, nº pets, alimentação, controles ativos, plataforma, UF |
| `GET /users/{id}` | detalhe: cadastro (sem hash/token), atividade (analytics), sinais de engajamento, pets + estado de cada funcionalidade |
| `GET /pets/{id}` | detalhe: cadastro, estado das funcionalidades, alimentação, contadores, últimos registros de vacina/antiparasitário/banho/eventos |
| `GET /retention` | D1/D7/D30 quando há ≥20 usuários com histórico; senão `insufficient_data` |
| `GET /commerce` | Loja aberta (únicos), ofertas vistas (total + únicos), cliques (total + únicos), CTR por exposição **e** por usuário, por loja. Clique ≠ venda |
| `GET /data-quality` | 12 checagens com contagem, base e % |
| `GET /data-quality/{key}/population` | drill-down por checagem, paginado |
| `GET /geo` | agregado por UF/cidade de `users` + cobertura; App Store/Play e geo-IP marcados "não integrado" |

Todas as listas são paginadas. Agregações no Postgres (`func.count` +
`group_by`); o Python só classifica linhas já reduzidas — sem N+1, sem
carregar o banco na memória.

---

## 5. Migrations

O repo **não usa Alembic** — `src/migrations.py` roda `CREATE ... IF NOT
EXISTS` idempotente (pg + sqlite). Adicionado, aditivo e reversível
(basta `DROP INDEX`):

```
CREATE INDEX IF NOT EXISTS idx_users_created_at   ON users (created_at);
CREATE INDEX IF NOT EXISTS idx_pets_created_at    ON pets  (created_at);
CREATE INDEX IF NOT EXISTS idx_users_state_city   ON users (state, city);
```

Nenhuma coluna nova, nenhuma tabela nova, nenhum dado tocado.

---

## 6. Instrumentação — `app_version = "unknown"`

**Origem:** o build de produção só baka `NEXT_PUBLIC_API_BASE_URL=/api`;
`NEXT_PUBLIC_APP_VERSION` nunca é definido, então todo evento saía com
`app_version="unknown"`.

**Correção (só pra frente):** `apps/web/src/lib/analytics/session.ts` passa
a ler o SHA de `/version.json` — que o deploy já escreve e o cliente já lê
para auto-reload (`sessionStorage['petmol_build_v']`) — com um `fetch`
único de fallback. **Dados antigos não são reescritos.**

---

## 7. Privacidade

- Sem GPS contínuo, sem coordenada residencial exata em analytics.
- Sem IP bruto novo. `analytics_events.ip_hash` (legado) é SHA-256[:16].
- Detalhe do tutor **nunca** devolve `password_hash`, tokens, secrets.
- Mapa: só UF/cidade agregada de `users`. `missing_pets.lat/lng` e
  `push_subscriptions.lat/lng` **não são plotados**.
- Dados de saúde/identidade nunca vão para analytics de terceiros (é
  tudo first-party).

---

## 8. Fases

- **A (feito):** inventário + `state.py` + `queries.py` + `filters.py` + `router.py` + índices.
- **B (feito):** Visão Geral, Tutores & Pets, Funcionalidades, Qualidade dos Dados (+ Retenção/Commerce/Geo já ligados ao que existe).
- **C (parcial):** Retenção e Commerce entregam o que o histórico permite; aprofundar coortes semanais quando os dados v2 acumularem.
- **D (bloqueada por fontes externas):** App Store Connect / Google Play e geo-IP aproximado. Interface já preparada (`/geo` devolve `appstore_downloads: null` + nota). **Não implementar scraping.**

---

## 9. Próximos passos para a Fase D

1. **App Store Connect** — API de Sales & Trends (JWT com chave `.p8`).
   Provider interno `AcquisitionProvider` → grava `country_code`, `units`,
   `date`, `source='app_store'`. Nunca acoplar o dashboard à API externa.
2. **Google Play** — Play Developer Reporting API (service account).
   Mesmo provider, `source='google_play'`.
3. **Geo-IP aproximado** — resolver no servidor no ato do signup, gravar só
   `country_code / state / city / geo_precision / source='ip'` (sem IP
   bruto). Base MaxMind GeoLite2 local. `district/bairro` só se a fonte
   tiver qualidade — senão não gravar.
4. Tabela `acquisition_daily` (aditiva) quando 1–2 estiverem prontos.
