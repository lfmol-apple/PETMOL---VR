# Checklist da próxima versão nas lojas (App Store + Google Play)

Regra combinada (26/09/2026): **SDK da Meta é só iOS** (a campanha do Android já roda). Todo o resto é **igual nos dois**.
Eu preparo em PR; **o dono gera o build e envia** (eu nunca gero build nem submeto). Enquanto a nova versão está em análise, a atual continua no ar.
Legenda: ✅ pronto · 🟡 em andamento · ⬜ a fazer · ❓ decisão do dono

## Decisões pendentes do dono
- ❓ **Uma versão ou duas?** Recomendado: **1.1 = só SDK da Meta (iOS)**; **1.2 = segundo plano + sons + resto**. Motivo: reprovação da localização prenderia o SDK da Meta. Tudo junto também é possível.
- ❓ Aprovar a justificativa de `LOCALIZACAO_SEGUNDO_PLANO_APP_REVIEW.md` (PR #562).
- ❓ Telas dos screenshots (sugestão: Home nova, Pet Sumido, Plano de Saúde, Caderneta).
- ❓ Arquivo do latido livre de direitos (ou eu procuro um de uso comercial) e som de marca do PETMOL.
- ❓ Conta de revisor (Apple e Google) — ainda pendente.

## Itens

| # | Item | iOS | Android | Quem | Estado |
|---|---|---|---|---|---|
| 1 | **SDK da Meta + ATT** (campanha iOS 14+) | Facebook SDK 18.1.1, ATT na 1ª abertura, v1.1 build 8 | **Não se aplica** (campanha já roda) | Eu (PR #561) / Dono testa e envia | ✅ código · ⬜ teste no iPhone |
| 2 | **Localização em segundo plano** (Pet Sumido) — mudança significativa, sem trilha, 2 etapas, desligar em 1 toque | `UIBackgroundModes=location` + `NSLocationAlwaysAndWhenInUse…` + plugin Swift | `ACCESS_BACKGROUND_LOCATION` (no Android 11+ o "sempre" é concedido nas Configurações; precisa de aviso em destaque no app) + serviço de localização | Eu (código) | ⬜ após aprovação · dossiê em PR #562 |
| 3 | **Estilo do aviso do Pet Sumido** (padrão do sistema / som do PETMOL / latido) | Arquivos `.caf` no app + `aps.sound` por usuário | Um **canal de notificação por som** (não muda depois de criado) + arquivos em `res/raw` | Eu (código + backend) | ⬜ |
| 4 | **Aviso animado com som, app aberto** | Só web | Só web | Eu — **pode sair por deploy antes das lojas** | ⬜ |
| 5 | **Preferência do tutor** (Perfil ▸ Notificações) + envio do som certo pelo backend | Web + backend | Web + backend | Eu | ⬜ |
| 6 | **Rótulos de privacidade**: localização vinculada à conta, sem rastreamento (Apple); Segurança dos dados (Google); ID de publicidade só no iOS | App Store Connect | Play Console (Data safety) | Dono no painel (eu redijo o texto) | ⬜ |
| 7 | **Política de Privacidade** (`/legal/privacy` §2.4) e `docs/APP_STORE_METADATA.md`: trocar "nunca em segundo plano"; citar SDK da Meta e ID de publicidade (iOS) | Web | Web | Eu, por deploy — **só publicar junto com a versão que ativa o recurso** | ⬜ |
| 8 | **Notas para o revisor** + vídeo de tela (30–60 s) do fluxo de localização | App Store Connect | Play Console (declaração de permissão sensível + vídeo) | Dono grava o vídeo; eu escrevo o texto | 🟡 texto pronto no dossiê |
| 9 | **Screenshots da loja** | 6,5" (1284×2778) e iPad | Telefone (e tablet, se houver) | Dono captura no aparelho; eu confiro tamanho e legenda | ⬜ |
| 10 | **Versão/build** | 1.1 build 8 (feito) → 1.2 build 9 se dividir | `versionCode` 4 → 5 (e `versionName`) — a fazer | Eu (PR) | 🟡 |
| 11 | **Build e envio** | Xcode: Archive ▸ Upload ▸ nova versão ▸ enviar (passo a passo em `META_SDK_IOS.md`) | Android Studio: AAB assinado ▸ Play Console ▸ produção/teste interno | Dono | ⬜ |
| 12 | **Liberação**: escolher "liberar manualmente" ou por etapas nas duas lojas | ✔ | ✔ | Dono | ⬜ |

## Cuidados
- O app carrega o site de produção ao vivo: **todo deploy vale na hora também para quem está na versão antiga**. O site deve checar se o recurso nativo existe e, se não, seguir como hoje.
- Itens 4, 5 e 7 só devem ir ao ar **junto** com a versão da loja que os ativa (exceto o aviso animado, que é seguro).
- Se a Apple ou o Google reprovar, a versão atual segue no ar.
- Teste real necessário no iPhone e no Android: 2 e 3 (mover-se ≥ 500 m com o app fechado; ouvir cada som; modo silencioso).

---

# Outras pendências do projeto (levantadas em 26/09/2026)
Vêm da memória de trabalho e do GitHub. Os marcados ⚠️ podem estar **desatualizados** — conferir antes de agir.

## Ações suas (só você consegue)
| Item | Detalhe |
|---|---|
| **Cadastrar `gerenciamento@petmol.com.br` no app** | Sem conta e sem notificações ativas nesse e-mail, o push de acesso/download do #560 não chega |
| **Conta de revisor (Apple e Google)** | A senha usada na 1.0 foi um chute — trocar por uma dedicada |
| **Testar Pet Sumido ponta a ponta (#557)** | Criar alerta de teste com foto, buscar em outro celular com foto diferente, enviar, encerrar o alerta |
| **Decidir quando parar o teste A/B** | Depois, ler o resultado com o filtro "Introdução" do painel N |
| **Testar no iPhone real o SDK da Meta (#561)** | IDFA + "Testar eventos" no Gerenciador de Eventos |
| **Merge de #561 e #562** | Depois disso eu acompanho |

## Infra e segurança
- **Backup off-site**: `BACKUP_OFFSITE_CMD` existe, mas nenhum destino real está configurado.
- **Push Android (FCM)**: servidor pronto, falta confirmar a entrega ponta a ponta. **Push iOS (APNs)**: falta confirmar num iPhone.
- ⚠️ **Postgres** e ⚠️ **rotação de segredos** (`docs/SECURITY_ROTATION_REQUIRED.md`): estavam como pendência do dono no congelamento de 20/09.
- **28 PRs antigos abertos** (#4 a #205, em maioria atualizações de dependência e correções velhas): revisar e fechar o que não vale mais. **#520** (push do vepiconsorcios → e-mail) está aberto e pode **conflitar com o #560** — decidir antes de mergear.

## Landing e comercial
- Painel N ("Comercial na entrada") mostra zero até entrarem visitantes reais; conferir em alguns dias.
- Vídeo tem dois cabeçalhos de cache que se contradizem (`immutable` + `no-cache`); investigar de onde vem o segundo (baixa prioridade).
- ⚠️ Comercial "Operação Fuga" (Pet Sumido): estado desconhecido (havia teto de 250 créditos e banco isolado).

## Produto e catálogo
- **Shopee e Petz: nada será removido** (decisão do dono, 26/09/2026). A Shopee segue funcionando como está, **somente na Loja do Pet**; a Petz fica como está. Saíram do checklist.
- **Expansão para os EUA**: 3 idiomas decididos (pt-BR, en, es); falta a análise avançada e a auditoria de código morto.

## Adiados de propósito (não cobrar)
- Afiliados (aguarda ajuste do CNPJ), Redesenho da Caderneta, selo de compra no sininho, Plano de Saúde (Petlove desativado; PR #173 aberto).
