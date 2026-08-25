# Mapa de dados (companion técnico da Política de Privacidade)

Documento técnico — cada linha da Política de Privacidade
(`apps/web/src/app/legal/privacy/page.tsx`) precisa apontar pra algo
real aqui. "Não documentar estado desejado, documentar estado REAL"
(mesma regra do resto da auditoria de 25/08/2026).

| Categoria | Onde vive | Retenção |
|---|---|---|
| Cadastro (nome, e-mail, telefone, endereço, senha) | `user_auth/models.py::User` | Enquanto a conta existir; removido no delete |
| Pets (nome, espécie, raça, foto, peso, castração) | `pets/models.py::Pet` | Removido em cascata no delete da conta |
| Vacinas | `pets/models.py::VaccineRecord` | Idem |
| Medicações | tabela de medicação vinculada ao pet | Idem |
| Antiparasitários | `ParasiteControlRecord` | Idem |
| Alimentação | `FeedingPlan` | Idem |
| Documentos (carteirinha, receita, laudo) | `PetDocument` + arquivo em storage (local `uploads/pet_documents` ou R2/S3, conforme `storage_backend`) | Removido em cascata; arquivo apagado do disco/storage no delete (ver `user_auth/router.py::delete_account`) |
| Pet Sumido (alerta comunitário) | tabela de alerta de pet perdido + geolocalização do finder no momento do alerta | Ligada ao ciclo de vida do alerta, não da conta — ver `project_pet_sumido_feature` |
| Localização | Nunca armazenada de forma contínua/rastreada — só usada no momento de uma busca de estabelecimento (`Google Places`) ou de um alerta Pet Sumido pontual; endereço de cadastro é o único dado de localização persistente |
| Web Push | `notifications/__init__.py::PushSubscription` | Até o usuário desinscrever ou a subscription expirar/falhar |
| Native Push (iOS/Android) | `notifications/__init__.py::NativePushToken` | Idem |
| Fale com o PETMOL (suporte) | `support/models.py::SupportFeedback` | Enquanto necessário pra resolver o chamado |
| Eventos de analytics/clique (inclusive cliques comerciais) | `analytics/models.py::AnalyticsEvent` — **uma única tabela** pra evento de funil E clique comercial (não são tabelas separadas; `cta_type` distingue, ex: `petz_direct_link_click`, `shop_redirect`) | Sem TTL automático hoje — dado agregado/operacional, não teoricamente ligado a uma pessoa identificável isoladamente (`lead_id` é um token aleatório, não o ID do usuário) |
| Fotos enviadas pra IA (Gemini) | Processadas via `/vision/*` — original fica no storage do PETMOL; envio ao Gemini só acontece após consentimento explícito do tutor (ver `features/ai/aiPhotoConsent.ts`) | Foto original: mesma retenção do documento/produto que ela virou; cópia no Gemini: conforme os termos da Google (não retida além do processamento da requisição) |
| Uploads em geral | `uploads/` local ou bucket R2/S3 conforme `STORAGE_BACKEND` | Ligada ao registro pai (pet document, foto de pet) |
| Logs de acesso/segurança | Logs de aplicação (stdout/journald na VPS) | Rotação padrão do host — não há um pipeline de logging centralizado com retenção própria configurada hoje |
| Cliques de afiliado/comércio | Mesma tabela `AnalyticsEvent` acima | Idem |
| E-mail (transacional) | Enviado via provedor de e-mail configurado (verificação de conta, reset de senha) | Não armazenado pelo PETMOL além do necessário pra enviar; retenção no provedor de e-mail segue a política dele |
| Backups | `pg_dump` diário (cron `0 2 * * *` em produção), retenção 14 dias, local ao host — sem destino off-site configurado hoje (ver `docs/BACKUP_ROTINA.md`) | 14 dias |

## O que NÃO existe (removido da Política de Privacidade nesta revisão)

- **Supabase**: zero uso real — só um módulo de sync morto (nunca
  importado por nenhuma tela) e comentários "TODO: Supabase". Auth real
  é JWT custom (`user_auth/`).
- **OpenAI ativo**: código suporta como fallback de visão, mas
  `OPENAI_API_KEY` está vazio nos dois `.env` de produção (confirmado
  via check read-only) — não processa nada hoje.
- **Monitoramento 24/7 / testes de segurança periódicos**: nenhuma
  ferramenta de observabilidade/alerting rodando, nenhuma evidência de
  pentest — removido da política por não ser verificável.
- **Backup em nuvem com criptografia** (como estava descrito antes):
  o backup real é local ao host, sem destino off-site configurado —
  reescrito pra descrever o mecanismo de verdade.
