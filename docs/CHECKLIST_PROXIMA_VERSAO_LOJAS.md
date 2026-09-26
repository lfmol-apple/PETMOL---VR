# Checklist — próxima versão nas lojas (App Store + Google Play) e pendências

Atualizado em 26/09/2026. Legenda: ✅ pronto · 🟡 em andamento · ⬜ a fazer · ❓ decisão do dono · ⚠️ vem da memória de trabalho, conferir antes de agir

## Regras combinadas
1. **SDK da Meta é só iOS** (a campanha do Android já roda). Todo o resto é **igual nos dois**.
2. **O funcionamento das lojas permanece exatamente como está**: Cobasi como está, Petz como está, Shopee como está **somente na Loja do Pet**. Nenhum PR desta rodada toca em loja, ofertas, afiliados ou links de compra (cada PR lista seus arquivos para conferir).
3. Eu preparo tudo em PR. **O dono faz o merge, gera o build e envia às lojas.** Eu nunca gero build de loja nem submeto.
4. Enquanto a versão nova está em análise, **a atual continua no ar**. Reprovação não derruba o app.
5. iOS mínimo continua **15.0** (o Capacitor 8 exige; baixar não é possível e o ganho seria pequeno). iPad já é suportado.

## A. Decisões suas (travam o resto)
| # | Decisão | Minha recomendação |
|---|---|---|
| D1 | **Uma versão ou duas?** | **1.1 = só SDK da Meta (iOS)**; **1.2 = segundo plano + sons + resto**. Uma reprovação da localização prenderia a Meta. Tudo junto também é possível. |
| D2 | **Aprovar a justificativa** da localização em segundo plano (`LOCALIZACAO_SEGUNDO_PLANO_APP_REVIEW.md`) | Aprovar; usa só "mudança significativa" (~500 m), sem trilha |
| D3 | **Sons**: arquivo do **latido** livre de direitos e o **som de marca** do PETMOL | Você envia, ou eu procuro um de uso comercial |
| D4 | **Conta de revisor** (Apple e Google) | Criar uma dedicada; a senha da 1.0 foi um chute |
| D5 | **Mac com chip Apple e Vision Pro**: manter o app disponível ou desmarcar no App Store Connect | Conferir no painel |
| D6 | **PR #520** (push do vepiconsorcios → e-mail) pode conflitar com o #560 já no ar | Decidir se mergeia, adapta ou fecha |

## B. Já pronto
- ✅ **SDK da Meta + ATT (PR #561)**: Facebook SDK 18.1.1, Info.plist, privacidade, versão 1.1 build 8. **Compilado e rodado no simulador (iPad Pro 13")**: o aviso de rastreamento aparece com o texto em pt-BR e a ativação vai ao App ID `976747438068822`. Achado e corrigido no teste: o app usa cenas e o pedido não rodava.
- ✅ Comercial na landing em toda visita ao celular (#559), push de acesso/download também para `gerenciamento@petmol.com.br` (#560), Pet Sumido com semelhança baixa (#557) — todos no ar.
- ✅ Dossiê de justificativa do segundo plano (PR #562).
- ✅ Simulador do iPad pronto para os screenshots.

## C. Itens da versão
| # | Item | iOS | Android | Quem | Estado |
|---|---|---|---|---|---|
| 1 | SDK da Meta + rastreamento (ATT) | Feito | **Não se aplica** | Eu; dono testa no iPhone real | ✅ código · ⬜ teste real |
| 2 | Localização em segundo plano (Pet Sumido): mudança significativa, sem trilha, 2 etapas, desligar em 1 toque | `UIBackgroundModes=location` + textos + plugin Swift | `ACCESS_BACKGROUND_LOCATION` (Android 11+: "sempre" nas Configurações, com aviso em destaque no app) + serviço | Eu | ❓ D1/D2 |
| 3 | Estilo do aviso do Pet Sumido: **sistema / som do PETMOL / latido** | Arquivos `.caf` no app + som por usuário no envio | Um canal de notificação **por som** (não muda depois de criado) | Eu | ❓ D3 |
| 4 | Aviso animado com som **com o app aberto** | Web | Web | Eu — **pode sair por deploy antes das lojas** | ⬜ |
| 5 | Preferência do tutor (Perfil ▸ Notificações) + backend envia o som certo | Web + backend | Web + backend | Eu | ⬜ |
| 6 | Rótulos de privacidade: localização vinculada à conta, sem rastreamento; ID de publicidade só no iOS | App Store Connect | Play Console (Segurança dos dados) | Dono no painel; eu redijo | ⬜ |
| 7 | Política de Privacidade (`/legal/privacy` §2.4) e `APP_STORE_METADATA.md`: trocar "nunca em segundo plano"; citar SDK da Meta | Web | Web | Eu, por deploy — **só junto com a versão que ativa o recurso** | ⬜ |
| 8 | Notas para o revisor + vídeo de tela (30–60 s) do fluxo de localização | Notas em inglês (prontas no dossiê) | Declaração de permissão sensível + vídeo | Dono grava; eu escrevo | 🟡 |
| 9 | Screenshots (ver seção D) | iPhone 6,9" + iPad 13" | Telefone + gráfico 1024×500 | Dono navega; eu capturo | 🟡 |
| 10 | Versão/build | 1.1 build 8 feito (1.2 build 9 se dividir) | `versionCode` 4 → 5 e `versionName` | Eu (PR) | 🟡 |
| 11 | Build e envio | Xcode: Archive ▸ Upload ▸ nova versão ▸ enviar (`META_SDK_IOS.md`) | AAB assinado ▸ Play Console | Dono | ⬜ |
| 12 | Liberação: manual ou por etapas | ✔ | ✔ | Dono | ⬜ |

## D. Screenshots — os antigos (7/09) estão todos desatualizados
**Roteiro aprovado (sem Plano de Saúde):**
| # | Tela | Título sugerido |
|---|---|---|
| 1 | Home atual | "Tudo do seu pet em um só lugar" |
| 2 | Alerta de Pet Sumido chegando perto de você | "Pet sumiu? A vizinhança ajuda" |
| 3 | Vacinas | "Nunca esqueça uma vacina" |
| 4 | Alimentação (previsão da ração) | "Saiba quando a ração vai acabar" |
| 5 | "O que você precisa agora?" (hospitais 24h) | "Emergência? Ache ajuda perto" |
| 6 | Leitura de carteirinha por foto | "Leia a carteirinha com uma foto" |
| 7 | Aviso de localização (**só depois** do segundo plano existir) | "Só avisamos quando importa" |

**Como capturo:** pelo **Simulador do Xcode**, com o app compilado do PR #561. iPhone 17 Pro Max (1320×2868, o tamanho de 6,9") e iPad Pro 13" (2064×2752). Status bar limpa (9:41). O dono toca no aviso de rastreamento, entra na conta do Marley **na janela do Simulador** (eu não uso credenciais) e diz "tela N"; eu capturo e confiro.
- **Loja do Pet**: só entra se o dono quiser, e capturada como está hoje (a versão antiga mostrava Petz/Shopee como parceiras com "Comprar").
- **Pet Sumido**: usar um alerta de teste do dono.
- **Google Play**: mesmas telas em tamanho de telefone + gráfico de destaque 1024×500.

## E. Testes reais antes de enviar
- **iPhone**: aviso de rastreamento; Gerenciador de Eventos ▸ Testar eventos (`fb_mobile_activate_app`); depois de publicado, a campanha iOS 14+ deixa de mostrar o bloqueio (até 24 h).
- **Segundo plano** (1.2): andar ≥ 500 m com o app fechado e ver a posição atualizar; recusar "Sempre" e conferir que o app segue normal; "parar de compartilhar".
- **Sons** (1.2): ouvir cada opção; conferir modo silencioso; no Android, um canal por som.

## F. Ações suas fora da versão
- **Cadastrar `gerenciamento@petmol.com.br` no app** e ativar notificações (sem isso o push do #560 não chega).
- **Testar Pet Sumido ponta a ponta (#557)**: alerta de teste com foto; outro celular busca com foto diferente e envia; encerrar o alerta.
- **Decidir quando parar o teste A/B** e ler o resultado com o filtro "Introdução" do painel N.
- **Mergear #561 e #562** (eu acompanho o que for ao ar).

## G. Infra e segurança
- **Backup off-site**: `BACKUP_OFFSITE_CMD` existe, sem destino real configurado.
- **Push Android (FCM)** e **iOS (APNs)**: falta confirmar a entrega ponta a ponta.
- ⚠️ **Postgres** e ⚠️ **rotação de segredos** (`docs/SECURITY_ROTATION_REQUIRED.md`): eram pendências do congelamento de 20/09.
- **28 PRs antigos abertos** (#4 a #205: dependências e correções velhas): revisar e fechar o que não vale mais.

## H. Landing e comercial
- **Painel N** ("Comercial na entrada") mostra zero até entrarem visitantes reais; conferir em alguns dias.
- Vídeo com dois cabeçalhos de cache que se contradizem (`immutable` + `no-cache`); investigar (baixa prioridade).
- ⚠️ Comercial "Operação Fuga" (Pet Sumido): estado desconhecido.

## I. Produto
- **Expansão para os EUA**: 3 idiomas decididos (pt-BR, en, es); falta a análise avançada e a auditoria de código morto.
- **Adiados de propósito (não cobrar):** afiliados (aguardam o CNPJ), redesenho da Caderneta, selo de compra no sininho, Plano de Saúde (Petlove desativado; PR #173 aberto).

## J. Cuidados
- O app carrega o site de produção ao vivo: **todo deploy vale na hora também para quem está na versão antiga**. O site checa se o recurso nativo existe e, se não, segue como hoje.
- Itens 5 e 7 só vão ao ar **junto** com a versão da loja que os ativa. O aviso animado com o app aberto (item 4) é seguro antes.
- Se a Apple ou o Google reprovar, a versão atual segue no ar.
