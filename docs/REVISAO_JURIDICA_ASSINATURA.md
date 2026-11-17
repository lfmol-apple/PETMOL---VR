# Revisão jurídica — Termos §9 e Privacidade §2.6 (assinatura)

> Revisão técnico-jurídica preliminar feita por IA em 17/11/2026, a pedido do dono. **Não substitui
> parecer de advogado inscrito na OAB**: serve para acelerar a revisão profissional e já corrigir os
> riscos mais evidentes. Base considerada: CDC (Lei 8.078/90), Decreto 7.962/2013 (e-commerce),
> LGPD (Lei 13.709/2018), Marco Civil (Lei 12.965/2014) e regras da Apple/Google.

## Riscos encontrados e como ficou

| # | Risco | Fundamento | Correção aplicada |
|---|---|---|---|
| 1 | §10 dizia "em nenhuma circunstância seremos responsáveis" e "como está" — cláusula de exoneração total em relação de consumo é nula | CDC arts. 24–25, 51, I | Reescrito: responsabilidade excluída só "na máxima extensão da lei", ressalvando dolo/culpa; garantia expressa de direitos do consumidor (reexecução, restituição, abatimento) |
| 2 | §9 original permitia mudar o serviço "com ou sem aviso" — alteração unilateral | CDC art. 51, IV, XI | Mudanças só por motivo legítimo, com aviso, sem afetar período pago, com opção de cancelar e devolução proporcional |
| 3 | Reajuste de preço unilateral | CDC art. 51, X; regras Apple/Google de consentimento | §9.4: só para períodos futuros, aviso prévio, possibilidade de cancelar, consentimento quando exigido |
| 4 | Arrependimento tratado de forma vaga | CDC art. 49 | §9.5: 7 dias, devolução integral, pedido pela loja + contato do PETMOL para orientação |
| 5 | Encerramento do plano pelo PETMOL sem contrapartida | CDC art. 51, IV; boa-fé | §9.6: devolução proporcional se o PETMOL encerrar sem culpa do usuário |
| 6 | Promessa do legado ("versão atual segue grátis") é oferta que vincula | CDC arts. 30, 35 | §9.7 com ressalvas (segurança, lei, exigência de loja/SO, fim do serviço, aviso prévio, sem cobrança para manter o que já tinha) e versão-corte por número; deixa claro que a versão nova pode ter condições diferentes |
| 7 | §13 "uso continuado = aceite" para mudanças relevantes | CDC art. 51, XI; Apple 3.1.2 | Mudanças que reduzam direitos de assinantes ou aumentem preço seguem §9.1–9.4 e exigem consentimento quando aplicável |
| 8 | Foro | CDC art. 101, I | §12: foro do domicílio do consumidor |
| 9 | Capacidade para contratar | Código Civil arts. 3º–4º | §3: planos pagos para maiores de 18/capazes ou via representante |
| 10 | Pet Sumido "salvo aviso em contrário" soava como porta aberta | CDC art. 37 (publicidade/informação) | §9.6: mudança só com aviso prévio e sem afetar alertas em andamento |
| 11 | Privacidade: faltava identificar a loja como controladora independente, bases legais, retenção, direitos | LGPD arts. 7º II/V, 9º, 18 | §2.6 ampliada; loja listada em §5.2 |
| 12 | "Versão" dos Termos desatualizada (2026-08-24) | prova de aceite | Atualizada para 2026-11-17 |

## O que NÃO consegui resolver sozinho (precisa de advogado/dono)

1. **Identificação do fornecedor (Decreto 7.962/2013, art. 2º):** razão social, CNPJ, endereço físico e
   eletrônico e canal de atendimento devem estar visíveis. **RESOLVIDO (17/11/2026):** dados do cartão CNPJ
   (PETMOL NEGOCIOS DIGITAIS LTDA, 65.625.299/0001-15, R. Ramalhete 474 apto 301, Serra, BH/MG) incluídos
   nos Termos §14, Privacidade §14 e /sobre; canal = gerenciamento@petmol.com.br. *Atenção:* o endereço do
   cartão tem "apto. 301" (possível residência); telefone do cartão NÃO foi publicado. Se preferir outro
   endereço comercial, trocar nesses 3 lugares. Falta ainda linha de rodapé global do site (opcional).
2. **Direito de arrependimento em compra dentro do app:** o fluxo é da loja, mas o PETMOL responde
   perante o consumidor. Confirmar com advogado se mantém "devolução integral em 7 dias" (assumi sim,
   por segurança) e como atender pedidos que cheguem direto ao suporte.
3. **Devolução proporcional (§9.1, §9.6):** é compromisso financeiro. Validar se quer assumir e como
   operacionalizar (a loja é quem reembolsa; talvez só via pedido à loja).
4. **Legado "enquanto o serviço estiver disponível":** validar se a ressalva basta ou se prefere prazo
   mínimo garantido (ex.: 12 meses) — quanto mais firme, maior o passivo.
5. **Registro de aceite:** gravar versão dos Termos e data de aceite por usuário ao introduzir a cobrança
   (prova em disputas). Não implementado.
6. **Tributação/nota fiscal:** fora de escopo desta revisão; ver contador.
7. **Pet Sumido e responsabilidade:** alertas comunitários envolvem dados de terceiros e localização;
   revisar §§ específicos (já existentes) com foco em responsabilidade por conteúdo de usuários.
8. **Descrição das lojas, anúncios e landing:** a informação de preço/renovação precisa ser coerente
   com os Termos (CDC art. 37; Apple 3.1.2). Conferir quando houver preços definitivos.
9. **Cláusula de arbitragem/limite de valor:** deliberadamente NÃO incluída (nula em consumo).

## Próximo passo

Enviar este arquivo + `/legal/terms` + `/legal/privacy` (PR #851) ao advogado para parecer; só mergear
depois. Atualizar este documento com o parecer recebido.
