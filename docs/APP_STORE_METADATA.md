# Metadados de Loja — App Store & Google Play

Preparado em 24/08/2026 com base no código real (schemas de banco, integrações, ausência confirmada de SDKs de terceiros de analytics/ads/crash). **Nunca declarar coleta que não existe, nem omitir coleta que existe.**

## O que o PETMOL coleta de fato (base para as duas seções abaixo)

Confirmado via schema do banco (`petmol_prod_mirror`) e leitura do código nesta sessão:

- **Conta**: nome, e-mail, senha (hash bcrypt, nunca em texto), telefone (opcional), endereço (opcional)
- **Pets**: nome, espécie, raça, foto do pet
- **Saúde do pet** (não do usuário humano): vacinas (tipo, data, próxima dose), medicações, controle de parasitas, plano de alimentação
- **Localização (precisa)**: latitude/longitude, só em primeiro plano, sem rastreamento contínuo/background. Capturada em: (1) fluxo "Pet Sumido" / "achei um pet" / "reportar pet perdido" — último local visto; (2) **ao ativar notificações**, o app anexa `lat/lng` à inscrição (`useNotificationPermissionController.getLocationSilently` → `POST /notifications/subscribe`) **apenas se a permissão de localização já estiver concedida** (não dispara prompt) — usado para alertas geolocalizados de pet perdido; (3) perfil, ao configurar a região. Declarar como coletada para "Funcionalidade do app". O caminho (2) (anexar localização à inscrição ao ativar notificações) é específico do fluxo Web Push (`/notifications/subscribe`) — o registro de push nativo (`/notifications/native-device`, iOS/Android via Capacitor) não anexa localização, só o token do dispositivo. **Isso não significa que o app nativo não tem push**: push nativo iOS está confirmado funcionando de ponta a ponta em aparelho físico (ver item "Notificações push nativas" abaixo) — é só que a coleta de localização especificamente listada no caminho (2) acontece pelo canal Web Push, então no app nativo a coleta de localização real acontece em (1) e (3).
- **Notificações push (Web Push, navegador/PWA)**: endpoint/chaves de inscrição Web Push (VAPID), não um token de um SDK de push de terceiros. Ver item "Notificações push nativas" abaixo pro app nativo (iOS/Android via Capacitor) — são dois canais distintos.
- **Uso de IA**: fotos (carteirinha de vacina, identificação de produto) só são enviadas à API do Gemini (Google) para extração/leitura após consentimento explícito por usuário — é compartilhamento com terceiro nesse fluxo específico
- **Analytics — só primeira-parte**: `analytics_events`/`analytics_clicks` (tabelas próprias do PETMOL) guardam `lead_id`, IP **hasheado** (não o IP bruto), user-agent, tipo de evento/CTA, e cliques em ofertas de afiliados (qual parceiro, produto). **Confirmado: nenhum SDK de analytics de terceiros** (sem Google Analytics/gtag, sem Facebook Pixel) no frontend.
- **Crash reporting**: **confirmado: nenhum SDK de terceiros** (sem Sentry/Crashlytics/Bugsnag) — o que a própria loja (Apple/Google) coleta automaticamente no nível do SO não é declarável pelo desenvolvedor.
- **E-mail transacional**: SMTP genérico (compatível com Gmail/Outlook/qualquer provedor — configurado via env, não é um vendor fixo com API própria de tracking)
- **Afiliados**: cliques em links de parceiros (Cobasi, Shopee via Awin) — rastreados só nas tabelas próprias acima, sem pixel de terceiro no cliente
- **Suporte/feedback**: mensagens de "Fale com o PETMOL" (categoria + texto livre), opcionalmente vinculadas à conta — sem foto, sem dado de saúde, sem documento
- **Notificações push nativas** (Android/iOS via Capacitor): token de dispositivo (FCM/APNs). No iOS, confirmado funcionando de ponta a ponta em aparelho físico (registro do token, envio via APNs, entrega em foreground/background) — `aps-environment=production` no entitlements, `UIBackgroundModes: remote-notification` no Info.plist. Token é apagado do banco na exclusão de conta (ver `docs/MOBILE_RELEASE_CHECKLIST.md`)

## Apple App Privacy (App Store Connect → App Privacy)

| Categoria Apple | Coletado? | Vinculado à identidade? | Usado para rastreamento (tracking)? | Propósito declarado |
|---|---|---|---|---|
| Contact Info (nome, e-mail, telefone) | Sim | Sim | Não | App Functionality (conta, login, contato) |
| Physical Address | Sim (opcional) | Sim | Não | App Functionality |
| User Content (fotos do pet, fotos de carteirinha de vacina) | Sim | Sim | Não | App Functionality |
| Health & Fitness (dados de saúde do **pet**, não do usuário — vacinas/medicações/parasitas) | Declarar como User Content ou Health, conforme a categoria mais específica que a Apple oferecer para "dados de saúde de terceiro/animal" no momento da submissão — reconferir o formulário atual da App Store Connect, a categoria exata pode ter mudado | Sim | Não | App Functionality |
| Location (Precise) | Sim — Pet Sumido / achei-um-pet, ativação de notificações (só se já autorizado), e configuração de região no perfil. Só em primeiro plano, sem background | Sim | Não | App Functionality |
| Identifiers (ID de conta) | Sim | Sim | Não | App Functionality |
| Usage Data (cliques em ofertas/CTAs, eventos de app) | Sim | Sim (via `lead_id`, não anônimo) | Não | Analytics (primeira parte), App Functionality |
| User Content (mensagens de "Fale com o PETMOL") | Sim | Opcional (vinculado à conta se logado) | Não | App Functionality, Customer Support |
| Identifiers (token de push nativo do dispositivo) | Sim | Sim | Não | App Functionality (notificações) |
| Diagnostics (crash/performance) | Não coletado por SDK próprio — não declarar coleta do desenvolvedor | — | — | — |
| Contacts | Não | — | — | — |
| Financial Info | Não (nenhum dado de pagamento processado pelo PETMOL — compra acontece no site do parceiro) | — | — | — |

**"Usado para rastreamento" (tracking, no sentido da Apple/ATT) = Não** em toda a tabela — não há compartilhamento de identificadores com terceiros para publicidade entre apps/sites. O único compartilhamento com terceiro é o envio pontual de uma foto ao Gemini (Google) para extração de texto, que é processamento a serviço do PETMOL, não rastreamento publicitário — mas revisar a definição exata da Apple antes de confirmar essa classificação no formulário.

## Google Play Data Safety

| Tipo de dado | Coletado | Compartilhado | Propósito | Obrigatório? | Criptografado em trânsito | Usuário pode pedir exclusão |
|---|---|---|---|---|---|---|
| Nome, e-mail, telefone | Sim | Não | Funcionalidade do app, contas | Sim (nome/e-mail) | Sim (HTTPS) | Sim (exclusão de conta no app) |
| Endereço | Sim (opcional) | Não | Funcionalidade do app | Não | Sim | Sim |
| Fotos (pet, carteirinha de vacina) | Sim | Sim, só com Google/Gemini quando o usuário consente e usa leitura por IA | Funcionalidade do app | Não | Sim | Sim |
| Localização precisa | Sim — Pet Sumido/achei-um-pet, ativação de notificações (só se já autorizado), região no perfil. Primeiro plano apenas | Não | Funcionalidade do app (localizar pet perdido, alerta geolocalizado) | Não | Sim | Sim (apagado na exclusão de conta) |
| Histórico de uso/cliques em ofertas | Sim | Não (analytics é first-party) | Analytics, funcionalidade do app | Não | Sim | Sim (vinculado à conta, removido na exclusão) |
| ID do dispositivo/push | Sim (endpoint Web Push e/ou token nativo FCM/APNs) | Não (fica só entre o dispositivo e o próprio serviço de push do SO — FCM/APNs — e o servidor PETMOL) | Funcionalidade do app (notificações) | Não | Sim | Sim |
| Mensagens de suporte ("Fale com o PETMOL") | Sim | Não | Funcionalidade do app, suporte ao cliente | Não | Sim | Sim (vinculado à conta, anonimizado na exclusão) |

Nenhuma categoria de "Financial info", "Health info padronizado (do usuário humano)", "Contacts" ou "SMS/Call Log" se aplica.

**URL de exclusão de dados (campo obrigatório do formulário Data Safety)**: `https://petmol.com.br/excluir-conta` — página pública, funcional (login + confirmação de senha reaproveitando a mesma verificação de identidade do fluxo in-app), acessível sem o app instalado (ver `apps/web/src/app/excluir-conta/page.tsx`).

## Conta de revisor (App Review / Google Play Review)

**Estado atual: requer confirmação manual (Leonardo).** Este doc foi escrito em 24/08/2026, antes da primeira submissão (07/09/2026) — não há registro em nenhum arquivo do repositório confirmando se essa conta foi de fato criada, se as credenciais ainda são válidas, ou se os 5 cadastros abaixo (pet, alimentação, vacina, medicação, antiparasitário) estão realmente populados hoje. Auditoria de 11/09/2026 aponta isto como a explicação mais provável, com evidência em repositório, para uma rejeição por Guideline 2.1 (App Completeness): se o revisor recebeu uma conta vazia ou credenciais que não funcionavam, isso sozinho já justifica a rejeição. **Antes de reenviar, confirmar manualmente que a conta existe e está populada — não assumir que sim.** Passos, uma vez com as credenciais definidas/confirmadas:

1. Registrar a conta normalmente pelo app/site
2. Cadastrar 1 pet com foto
3. Cadastrar 1 alimentação/ração
4. Cadastrar 1 vacina (pode ser manual, não precisa de foto)
5. Cadastrar 1 medicação
6. Cadastrar 1 controle antiparasitário
7. Guardar e-mail/senha **fora do Git** (gerenciador de senhas, ou direto nos formulários do App Store Connect / Play Console, que têm campo próprio pra isso)

## Notas para o revisor (App Store Connect / Play Console — campo "Notes")

Rascunho, ajustar tom conforme o formulário pedir:

> PETMOL é um app de organização de cuidados para pets (alimentação, vacinas, medicações, antiparasitários) com comparação de ofertas de produtos entre lojas parceiras. Não é um serviço veterinário — o app organiza e lembra, não diagnostica nem prescreve.
>
> Para testar: faça login com a conta de revisor fornecida. Na Home, toque em "+" para cadastrar um pet (foto é opcional). As seções de Alimentação, Vacinas, Medicação e Antiparasitários ficam nos cards da tela do pet — cada uma tem um fluxo de cadastro manual completo, sem exigir foto ou IA (para vacinas, especificamente, há três caminhos: leitura por IA de uma foto do cartão, correção manual de uma leitura de IA imperfeita, ou cadastro 100% manual sem foto nenhuma).
>
> A "Loja do Pet" mostra ofertas de produtos comparadas entre lojas parceiras (Cobasi, Shopee); os links de "Comprar" são links de afiliado — ao tocar, o app informa que a compra acontece no site/app da loja parceira, não dentro do PETMOL, e o PETMOL pode receber uma comissão sem custo adicional pro usuário. Preço e disponibilidade em estoque são definidos pela loja parceira, não pelo PETMOL.
>
> Notificações push são usadas para lembretes de alimentação/vacina/medicação — o app funciona normalmente sem aceitar notificações.
>
> Para enviar uma sugestão, relatar um problema ou pedir ajuda, use "Fale com o PETMOL" na tela de Perfil.
>
> Para excluir a conta de teste: Perfil → Mais opções → Excluir conta, ou pela página pública petmol.com.br/excluir-conta (não exige o app instalado — exigência do Google Play). A exclusão remove permanentemente pets, fotos e histórico de saúde associados do banco ativo e do storage de arquivos imediatamente; cópias de segurança automáticas (backup diário) podem reter uma versão por até 14 dias até expirarem pela rotina normal de retenção. Registros não-identificáveis (como cliques em ofertas agregados) são desvinculados da conta em vez de apagados, para fins estatísticos, sem reter nenhum dado pessoal.

## Copy de loja — lembretes já em vigor (ver seção "Landing page" do release)

- Nunca usar "grátis"/"sempre gratuito"/"sem custo"/"free forever"
- Nunca prometer "o menor preço do Brasil" ou "sempre o menor preço" — usar "Compare preços entre lojas parceiras."
- Nunca usar "diagnóstico" ou "garantia de saúde" — o PETMOL organiza e lembra, não diagnostica
- Frases seguras: "Compare ofertas disponíveis.", "Organize os cuidados do seu pet.", "Receba lembretes.", "Acompanhe alimentação e tratamentos."
