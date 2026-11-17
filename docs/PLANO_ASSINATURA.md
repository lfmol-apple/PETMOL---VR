# Plano de assinatura mensal — lançamento cobrado do PETMOL

> **Status: PROPOSTA (17/11/2026). Preços e limites não estão decididos nem implementados.**
> Decisão do dono (17/11): **sem teste grátis no lançamento**, mas a possibilidade fica escrita nos
> Termos (§9.3) e nas decisões abaixo.
> **Documentação em modo duplo:** os Termos (§9) e a Privacidade (§2.6) foram redigidos para valer
> tanto com o app gratuito (hoje) quanto com assinatura (amanhã) — condicionais como "se houver plano
> pago" e "quando oferecermos teste". Nada de "grátis" ou "pago" é prometido como permanente.
> A seção 7 traz o que ainda precisa ser feito/revisado. **Revisão por advogado é necessária.**

## 1. Estado atual (verificado no código)

- Não existe plano, paywall, contador de uso nem checagem de plano em lugar nenhum. Tudo é livre.
- Os únicos limites hoje são anti-abuso por **IP**: OCR de carteirinha e foto de produto, 20/h.
- `POST /pets`, `/family/invite` e `/vision/*` não têm limite por usuário.
- Termos §9 já dizem que cobrança será informada antes, depende de aceite e **não é retroativa**
  para o que já está em uso. Isso sustenta o grandfathering (seção 5).
- Remoção das promessas "grátis / sem anúncios" no app, landing, e-mails e imagem OG: PR #850.

## 2. Onde está o custo variável (pesa no que é pago)

1. **Gemini**: OCR da carteirinha, foto de produto e **moderação de toda foto de pet** (roda inclusive
   para quem não paga — medir esse custo antes de fixar limites de foto).
2. **Fan-out de push do Pet Sumido** (pico) e volume de lembretes por pet.
3. **Armazenamento** (R2): fotos, vídeos, documentos.
4. O resto é só banco.

## 3. Divisão proposta: gratuito × assinatura

| Gratuito (aquisição + segurança) | Assinatura (custo recorrente + valor alto) |
|---|---|
| **Pet Sumido completo** (receber e abrir alerta) — segurança e viralidade dependem de densidade de usuários | Pets ilimitados (grátis: 1 ou 2) |
| 1–2 pets com foto | OCR da carteirinha com cota mensal; grátis: 1–2 leituras no total (isca, custo controlado) |
| Agenda, lembretes essenciais, vacinas manuais, banho e tosa | Foto de produto por IA |
| Medicamentos básicos (1 ativo) | Família completa (vários tutores/cuidadores); grátis: 1 cuidador |
| Guias, Loja e afiliados (geram receita) | Histórico e documentos com armazenamento (limite de GB) |
| Push dos lembretes essenciais | Ração: recompra automática e ajuste fino; medicamentos e lembretes ilimitados |
| | Relatório exportável (ex.: PDF para o veterinário) |

Princípio: **segurança e conteúdo ficam abertos; custo recorrente e conveniência ficam pagos.**
Regra de produto já vigente: monetização não é a finalidade; produto é o protagonista.

## 4. Preços sugeridos (hipótese — validar com teste)

| Plano | Sugestão | Faixa a testar | Base |
|---|---|---|---|
| Mensal | **R$ 14,90** | R$ 12,90 – 19,90 | Alinhado ao Petlove (R$ 14,90); acima do Flockr (R$ 9,90); abaixo de apps de saúde pet de R$ 25–50 |
| Anual | **R$ 99,90** (~R$ 8,33/mês, ~44% off) | R$ 89,90 – 119,90 | Em Saúde & Fitness o anual domina o mix; retenção mensal é a pior das categorias |
| Teste grátis | **Não usar no lançamento** (decisão do dono) | — | Possibilidade mantida: se um dia for adotado, benchmark global sugere ≥ 7 dias (trials ≥ 17 dias convertem mais; ~55% dos cancelamentos de trial curto ocorrem no dia 0). Cláusula já prevista nos Termos §9.3 |
| Lançamento | preço reduzido por tempo limitado | — | Suaviza a transição para quem já usa |

Referências encontradas (indicativas, de listagens/matérias; **conferir ao vivo antes de decidir**):
Flockr R$ 9,90/mês e R$ 79,90/ano; Petlove assinatura R$ 14,90/mês; Amigo Cobasi Plus R$ 6,99/mês;
planos de saúde pet R$ 20–70/mês; Pet Genius R$ 39,90, iPetsCat R$ 24,90, Pet Health R$ 49,90
(dados fracos). Não achei preço em R$ do 11pets, Pawprint, PetDesk nem Clubz. Benchmarks de conversão
são globais (RevenueCat/Adapty), não brasileiros.

**Líquido por assinatura anual de R$ 99,90 (estimativa):** App Store sem programa ≈ R$ 70 no 1º ano
(30%); com Small Business Program ≈ R$ 85 (15%); Google Play ≈ R$ 85 (15%). **Inscrever-se no Apple
Small Business Program** antes do lançamento.

Teste de preço sugerido: R$ 12,90 × R$ 19,90 no mensal, medindo conversão para assinatura e retenção na 1ª
renovação (esperar conversão freemium de poucos pontos percentuais; não projetar receita com a
mediana de 10,7% de hard paywall).

## 5. Transição dos usuários atuais — regra do dono (17/11/2026)

> **Quem já tem a versão atual do app só paga se decidir fazer o upgrade para a versão nova.
> Caso contrário, continua usando a versão que tem gratuitamente.**

Como ficou definido (e como está escrito nos Termos §9.7):

- **Versão-corte:** a última versão publicada antes de a cobrança existir. *Número a fixar quando for
  lançar* (iOS: versão + build; Android: versionName + versionCode). Quem está nela ou em anterior é "legado".
- **Legado:** continua com todas as funções que essa versão já tem, sem cobrança, sem prazo de
  validade escrito de fim de gratuidade. Não há paywall retroativo nem corte de funções existentes.
- **Upgrade é opcional:** ao atualizar para a versão com planos, a pessoa passa a ver a estrutura nova
  (plano gratuito com limites + assinatura). Isso precisa estar **claro antes** de atualizar: nota de
  versão ("O que há de novo") nas lojas e aviso no app/e-mail, para ninguém atualizar sem saber.
- **Sem pressão indevida:** não usar atualização obrigatória nem aviso insistente para empurrar o
  upgrade; só por motivo de segurança, exigência legal ou de loja/sistema (ver ressalvas).
- **Ressalva jurídica (por que não escrevemos "para sempre" sem condição):** a promessa vale
  "enquanto o serviço estiver disponível", e o PETMOL pode encerrar o suporte de uma versão por
  segurança, obrigação legal, exigência da Apple/Google/sistema operacional ou fim do serviço, **com
  aviso prévio e sem cobrar para manter o que já tinha**. Uma promessa absoluta e eterna poderia
  virar passivo se o servidor, uma API de terceiro ou uma loja deixar de permitir a versão antiga.

### O que isso exige tecnicamente (riscos reais)

1. **Compatibilidade do servidor com versões antigas:** o backend é compartilhado. Toda mudança de API
   precisa manter a versão-corte funcionando (versionamento/compatibilidade). Isso é custo permanente.
2. **O app carrega conteúdo web do servidor?** Se o app nativo exibe páginas servidas pelo PETMOL (a
   estrutura Capacitor/WebView), mudar o front-end no servidor muda **também** o app antigo. Para o
   legado ficar de fato congelado, a regra de plano precisa ser decidida **no servidor por marcador de
   conta/versão**, e não só "nova tela só na versão nova". Validar a arquitetura antes de prometer.
3. **Marcador de legado no servidor, gravado ANTES de ligar o paywall:** registrar, por conta, a versão
   do app (header/versão enviada nas requisições) e marcar `legacy=true` para quem estiver na versão-corte
   ou anterior. Sem esse registro prévio não há como provar quem é legado.
4. **Custo variável do legado:** o legado mantém OCR (Gemini), foto de produto e moderação sem cota por
   plano. Definir um **teto técnico anti-abuso** (hoje 20/h por IP; avaliar limite por conta) que não
   seja apresentado como "cobrança" — só proteção do serviço.
5. **Web/PWA e novos cadastros:** versão-corte só existe no app nativo. Decidir: usuário que usa só pelo
   navegador, e quem criar conta depois do lançamento numa versão antiga, são legado ou não? *Sugestão:*
   legado = conta que já usou o app nativo na versão-corte ou anterior antes da data de lançamento.
6. **Lojas:** a versão antiga continua disponível aos que já a têm; novos downloads sempre pegam a
   versão atual da loja. Confirmar que reinstalar não rebaixa quem já era legado (por isso o marcador é
   por conta, não por aparelho).
7. **Rollback de decisão:** a promessa é pública (Termos). Mudar depois exige aviso e pode gerar
   reclamação/avaliação negativa — decidir com calma antes de publicar o número da versão-corte.

## 6. O que falta construir (técnico)

1. Modelo de plano/entitlement por conta no backend + flag de lançamento (OFF por padrão).
2. IAP: App Store (StoreKit) e Google Play Billing; validação de recibo/RTDN no servidor; restaurar compras.
3. Contadores por usuário (não por IP): pets, leituras de OCR, fotos de produto, GB. Hoje só há 20/h por IP.
4. Tela de paywall com o que o plano dá, preço, período, renovação automática, links de Termos e
   Privacidade (Apple 3.1.2 — falta de link é rejeição frequente), "restaurar compras", cancelar na loja.
5. Estados de conta: ativo, em atraso, expirado (e trial, só se for adotado — manter suportado no modelo) (degradação graciosa: nunca apagar dados).
6. Eventos de funil de assinatura no Mission Control BI.
7. **Compra dentro do app só por IAP.** Nada de botão/link externo de pagamento no app nativo (Apple
   3.1.1; conferir a cláusula específica do Brasil no texto atual das diretrizes).

## 7. Documentação jurídica em modo duplo (grátis ou assinatura)

**Já no PR (páginas públicas, redação neutra):**

- **Termos §9** (reescrito): 9.1 planos gratuitos e pagos, sem promessa de gratuidade permanente e sem
  cobrança retroativa; 9.2 assinaturas (cobrança pela loja, renovação automática, cancelamento,
  sem guarda de cartão); 9.3 teste/promoções "quando oferecidos"; 9.4 alteração de preços com
  aviso e consentimento quando exigido; 9.5 reembolsos pela loja e CDC art. 49; 9.6 fim/falta de
  pagamento (dados preservados; Pet Sumido não depende de plano).
- **Termos §9.7** (versão atual do app): quem usa a versão anterior à introdução de planos continua sem cobrança; paga só quem decidir atualizar para a versão com planos.
- **Termos §10**: limitação de responsabilidade "na extensão máxima permitida pela lei" sem afastar
  direitos do consumidor. **§11**: corrigido erro de redação ("se violarmos" → "se você violar").
- **Privacidade §2.6**: dados de assinatura (condicional); loja processa pagamento; PETMOL não guarda cartão.
- Datas de "Última atualização"/vigência: 17/11/2026.
- `/sobre` e `/transparencia` já estão neutros (só descrevem afiliados; sem promessa de gratuidade).

**Interruptor de modo — o que muda no dia em que cobrar:**

| Item | Hoje (sem cobrança) | No lançamento cobrado |
|---|---|---|
| Termos §9 / Privacidade §2.6 | Valem como estão (condicionais) | Revisar com advogado e republicar com data nova; avisar usuários por e-mail/app (Termos §13) |
| /sobre e /transparencia | Neutros | Acrescentar: "se sustenta por assinaturas e, de forma complementar, por afiliados…" |
| Cópia de loja/landing | Sem "grátis"/"sem anúncios" (PR #850) | Idem + preços, renovação, cancelamento, links de Termos/Privacidade |
| App Privacy / Data Safety | Atual | Incluir compras/ID de transação |
| App | Sem paywall | Paywall + IAP + marcador de legado; versão-corte segue grátis (seções 5 e 6) |
| Termos §9.7 | Já vale (versões anteriores à cobrança) | Publicar o número da versão-corte no anúncio e nas lojas |

**Proteções que ainda dependem de decisão/validação (não inventei texto sobre elas):**

- Revisão jurídica geral (CDC, LGPD, regras de loja) e eventual cláusula de foro/consumidor.
- Política de reembolso própria (hoje delegada à loja) e canal de suporte para cobrança.
- Prazo de aviso prévio para mudança de preço/plano (hoje "antecedência razoável").
- Aviso de saúde (já no §6 dos Termos: o PETMOL não substitui veterinário) — reforçar na tela de paywall
  que assinatura não altera isso e que não há garantia de resultado clínico.
- Registro da data/versão dos Termos aceita por cada usuário (prova de aceite) ao introduzir a cobrança.
- Pet Sumido: manter fora do paywall por decisão de produto; o texto (§9.6) diz "salvo aviso em contrário"
  para preservar flexibilidade — decidir se prefere compromisso firme.

## 8. Pendências / decisões do dono

- [ ] Aprovar divisão grátis × pago (seção 3) e limites exatos (1 ou 2 pets? quantas leituras de OCR?).
- [x] Teste grátis: **não usar no lançamento**; possibilidade registrada (Termos §9.3).
- [ ] Aprovar preços; decidir se haverá teste A/B de preço.
- [x] Regra do legado definida pelo dono: versão atual segue grátis; só paga quem fizer upgrade (seção 5).
- [ ] Fixar a **versão-corte** (iOS/Android) e a definição de legado para web/novas contas (seção 5, item 5).
- [ ] Validar com a arquitetura se o app antigo realmente fica congelado (seção 5, item 2).
- [ ] Inscrição no Apple Small Business Program.
- [ ] Revisão jurídica das minutas; checar CDC art. 49 e política de reembolso.
- [ ] Conferir preços de concorrentes ao vivo nas lojas BR e a política de pagamentos do Google Play.
- [ ] Reabrir o trabalho nas lojas: a regra "nunca mais mexer nas lojas" (22/09) precisa ser suspensa
      para o build com IAP, ficha com preço/assinatura e novas capturas — decisão explícita do dono.
- [ ] Medir o custo real da moderação Gemini por foto antes de fixar o limite de fotos grátis.
