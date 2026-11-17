# Plano de assinatura mensal — lançamento cobrado do PETMOL

> **Status: PROPOSTA (17/11/2026). Nada aqui está decidido nem implementado.** Preços e limites são
> hipóteses para o dono aprovar. Nenhuma página pública foi alterada: as minutas da seção 7 só
> entram no site no dia em que a cobrança existir (publicar antes descreveria um serviço que não há).
> Texto jurídico: **revisar com advogado** antes de publicar.

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
| Trial | **7 a 14 dias** | testar 7 × 14 | Trials ≥ 17 dias convertem mais, mas há mais atrito; ~55% dos cancelamentos de trial curto ocorrem no dia 0 |
| Lançamento | preço reduzido por tempo limitado | — | Suaviza a transição para quem já usa |

Referências encontradas (indicativas, de listagens/matérias; **conferir ao vivo antes de decidir**):
Flockr R$ 9,90/mês e R$ 79,90/ano; Petlove assinatura R$ 14,90/mês; Amigo Cobasi Plus R$ 6,99/mês;
planos de saúde pet R$ 20–70/mês; Pet Genius R$ 39,90, iPetsCat R$ 24,90, Pet Health R$ 49,90
(dados fracos). Não achei preço em R$ do 11pets, Pawprint, PetDesk nem Clubz. Benchmarks de conversão
são globais (RevenueCat/Adapty), não brasileiros.

**Líquido por assinatura anual de R$ 99,90 (estimativa):** App Store sem programa ≈ R$ 70 no 1º ano
(30%); com Small Business Program ≈ R$ 85 (15%); Google Play ≈ R$ 85 (15%). **Inscrever-se no Apple
Small Business Program** antes do lançamento.

Teste de preço sugerido: R$ 12,90 × R$ 19,90 no mensal, medindo conversão trial→pago e retenção na 1ª
renovação (esperar conversão freemium de poucos pontos percentuais; não projetar receita com a
mediana de 10,7% de hard paywall).

## 5. Transição dos usuários atuais (grandfathering)

- Quem já usa mantém o que já usa; a cobrança vale para **funções novas ou limites novos**, nunca
  retroativa sem aceite (Termos §9). Alternativa: prazo longo com data final clara.
- Anunciar **antes** (e-mail + aviso no app), explicando o porquê; abrir a versão paga primeiro a
  novos usuários. Paywall retroativo gera avaliações baixas.
- iOS: identificar legados por `AppTransaction` (versão original). Android: gravar marcador **no
  servidor por conta** antes de ligar o paywall. Conferir a regra da Apple sobre mover para pago algo
  que o usuário já tinha.

## 6. O que falta construir (técnico)

1. Modelo de plano/entitlement por conta no backend + flag de lançamento (OFF por padrão).
2. IAP: App Store (StoreKit) e Google Play Billing; validação de recibo/RTDN no servidor; restaurar compras.
3. Contadores por usuário (não por IP): pets, leituras de OCR, fotos de produto, GB. Hoje só há 20/h por IP.
4. Tela de paywall com o que o plano dá, preço, período, renovação automática, links de Termos e
   Privacidade (Apple 3.1.2 — falta de link é rejeição frequente), "restaurar compras", cancelar na loja.
5. Estados de conta: trial, ativo, em atraso, expirado (degradação graciosa: nunca apagar dados).
6. Eventos de funil de assinatura no Mission Control BI.
7. **Compra dentro do app só por IAP.** Nada de botão/link externo de pagamento no app nativo (Apple
   3.1.1; conferir a cláusula específica do Brasil no texto atual das diretrizes).

## 7. Minutas de texto jurídico (NÃO publicadas — revisar com advogado)

**Termos de Uso — nova seção "Planos, cobrança e cancelamento"** (substitui o 2º parágrafo do §9):

> O PETMOL oferece um plano gratuito e planos pagos por assinatura (mensal e anual). Os recursos
> incluídos em cada plano, o preço, o período de teste (quando houver) e a periodicidade são exibidos
> na tela de contratação, antes da confirmação. A assinatura é contratada e cobrada pela App Store ou
> pelo Google Play, conforme o seu aparelho, e se **renova automaticamente** ao fim de cada período,
> pelo mesmo valor, até ser cancelada. Para cancelar, use as configurações de assinaturas da própria
> loja, com antecedência mínima de 24 horas antes da renovação. O cancelamento interrompe renovações
> futuras e o acesso pago continua até o fim do período já pago. Reembolsos seguem as regras da loja e
> a legislação aplicável, incluindo o direito de arrependimento do art. 49 do CDC quando cabível.
> Se a assinatura terminar, você mantém acesso aos seus dados e aos recursos do plano gratuito; não
> apagamos seus dados por falta de pagamento. Funcionalidades que você já usava antes da
> introdução de planos não passam a ser cobradas sem o seu aceite explícito.

**Política de Privacidade — acréscimo em "Dados Coletados"** (nova subseção "Dados de assinatura"):

> Ao assinar, a loja (Apple ou Google) processa o pagamento. O PETMOL **não recebe nem armazena** os
> dados do seu cartão. Recebemos da loja apenas informações sobre a assinatura (plano, status, datas
> de início e renovação, identificador da transação) para liberar os recursos pagos. Base legal:
> execução de contrato (LGPD, art. 7º, V). Retemos esses registros pelo tempo necessário a obrigações
> legais e fiscais.

**/sobre e /transparencia — "Como o PETMOL se sustenta"** (reescrever no lançamento):

> O PETMOL se sustenta por assinaturas dos planos pagos e, de forma complementar, por programas de
> afiliados de lojas parceiras: alguns links de compra podem gerar comissão, sem custo adicional para
> você. Essa relação é sempre identificada e não determina a conclusão dos conteúdos.

Atualizar também a data "Última atualização" dos Termos e da Privacidade e a `updatedAt` da transparência.

## 8. Pendências / decisões do dono

- [ ] Aprovar divisão grátis × pago (seção 3) e limites exatos (1 ou 2 pets? quantas leituras de OCR?).
- [ ] Aprovar preços e trial; decidir se haverá teste A/B de preço.
- [ ] Definir regra do grandfathering (função existente fica para sempre ou tem data final).
- [ ] Inscrição no Apple Small Business Program.
- [ ] Revisão jurídica das minutas; checar CDC art. 49 e política de reembolso.
- [ ] Conferir preços de concorrentes ao vivo nas lojas BR e a política de pagamentos do Google Play.
- [ ] Reabrir o trabalho nas lojas: a regra "nunca mais mexer nas lojas" (22/09) precisa ser suspensa
      para o build com IAP, ficha com preço/assinatura e novas capturas — decisão explícita do dono.
- [ ] Medir o custo real da moderação Gemini por foto antes de fixar o limite de fotos grátis.
