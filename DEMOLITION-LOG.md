# DEMOLITION LOG — apps/web

Registro de todas as remoções de código morto.  
Metodologia: grep recursivo antes de cada deleção; `tsc --noEmit` ao final de cada fase.

---

## FASE A — Demolição segura (commit 733a2c5)

| Item | Motivo |
|------|--------|
| `app/debug/` | Stub 143B, 0 referências externas |
| `app/grooming/` | Stub 109B; refs a `grooming` no código são sheets/modais na home, não esta rota |
| `app/home/admin/` + `establishments/new/` | Stubs sem referências; duplicavam `/admin/` |

---

## FASE B — Consolidação de duplicatas (commit 54c67a8)

| Item | Ação | Motivo |
|------|------|--------|
| `app/privacy/page.tsx` | Convertida em redirect → `/legal/privacy` | `/legal/privacy` tem conteúdo real (10.8kB vs 2kB) |
| `app/terms/page.tsx` | Convertida em redirect → `/legal/terms` | `/legal/terms` tem conteúdo real (6.9kB vs 1.7kB) |
| `components/Footer.tsx` | Links atualizados para `/legal/privacy` e `/legal/terms` | Elimina indireção desnecessária |
| `app/emergency-new/` | Deletada | 0 referências; ambas as rotas eram redirect→/home |
| `app/auth/signup/` | Deletada | Já era redirect→/register; removida de AUTH_ROUTES |
| `app/auth/login/` | Deletada | Já era redirect→/login |
| `app/auth/callback/page.tsx` | Atualizada: `/auth/login` → `/login` | Ajuste antes de deletar auth/login |
| `components/AppShell.tsx` | AUTH_ROUTES: remove `/auth/login`, `/auth/signup`; adiciona `/auth/callback` | Consistência com rotas existentes |

---

## FASE C — Rotas e componentes órfãos (commit 4f2f0e0)

### Rotas deletadas

| Rota | Tamanho | Referências | Motivo |
|------|---------|-------------|--------|
| `/family` | 107B | 0 | redirect→/home, sem referentes |
| `/petshop` | 108B | 0 | redirect→/home, sem referentes |
| `/rg` | 140B | 0 | redirect→/home, silenciado para V1 |
| `/coverage` | 154B | 0 | redirect→/home, silenciado para V1 |
| `/version` | 176B | 0 | redirect→/home, silenciado |
| `/sync-data` | 178B | 0 | redirect→/home, silenciado |
| `/invite/[token]` | 188B | 0 como rota | funcionalidade silenciada (redirect→/home) |
| `/portal/termos` | 164B | 0 | redirect→/home, portal V1 isolado |
| `/portal/cadastro` | 166B | 0 | redirect→/home, portal V1 isolado |
| `/portal/dashboard` | 167B | 0 | redirect→/home, portal V1 isolado |
| `/reorder` | 105B | 1 (PetPanel órfão) | ref era de componente sem importadores |
| `/tips` | 136B | 1 (PetPanel órfão) | idem |
| `/services` | 158B | 1 (PetPanel órfão) | idem |
| `/favorites` | 164B | 1 (PetPanel órfão) | idem |
| `/buy` | 193B | 1 (PetPanel órfão) | idem |

### Componentes deletados

| Componente | Importadores | Motivo |
|------------|-------------|--------|
| `PetPanel.tsx` | 0 | Sem importadores; referenciava rotas mortas |
| `MigrationModal.tsx` | 0 | Sem importadores |
| `IdentityKitPanel.tsx` | 0 | Sem importadores |
| `ClinicVisitDetector.tsx` | 1 (GlobalAutoDetector) | Retornava `null`; desativado 2026-02 |

### Ajuste

- `GlobalAutoDetector.tsx`: removido código morto em comentário multi-bloco; mantido como stub `return null`.

---

## FASE D — Destinos de push (mesmo commit 4f2f0e0)

Nenhuma alteração necessária:
- `health/grooming` em `DESTINATION_OPTIONS` e `InteractionClickDestination` aponta para **sheet/modal** na home (não à rota `/grooming` deletada) — mantido.
- Backend (`services/`) usa `/services/nearby`, `/rg/...`, `/family/invite` como API endpoints independentes das rotas frontend — sem impacto.

---

## Resultado final

| Métrica | Antes | Depois |
|---------|-------|--------|
| Rotas em `app/` | ~79 | ~52 |
| Arquivos removidos | — | 23 |
| Linhas deletadas (net) | — | ~800 |
| Erros TypeScript | 0 | 0 |
