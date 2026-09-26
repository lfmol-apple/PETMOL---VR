# Privacidade da versão 1.1 (SDK da Meta no iOS) — o que declarar nas lojas

Vale para o **iOS 1.1 (build 8)** com o SDK da Meta. **Android: nada muda** (a campanha do Android não usa SDK no app). Se um dia o SDK da Meta entrar no Android, refazer a seção do Google.
Base: o próprio manifesto de privacidade do SDK (`FBSDKCoreKit/PrivacyInfo.xcprivacy`, v18.1.1) e `apps/web/ios/App/App/PrivacyInfo.xcprivacy` do app.

## 1. App Store Connect ▸ PETMOL ▸ Privacidade do app ▸ Editar
Adicionar/alterar (o resto da tabela de `docs/APP_STORE_METADATA.md` continua igual):

| Tipo de dado (Apple) | Coletado? | Vinculado ao usuário? | Usado para rastreamento? | Finalidades |
|---|---|---|---|---|
| **Identificadores ▸ ID do dispositivo** (IDFA) | Sim (só se o usuário permitir o ATT) | **Sim** | **Sim** | Publicidade de terceiros; Análises |
| **Dados de uso ▸ Interação com o produto** (instalação/abertura do app) | Sim | **Sim** | **Sim** | Publicidade de terceiros; Análises |
| Diagnóstico ▸ Dados de falhas *(conforme o manifesto do SDK)* | Sim | Não | Não | Funcionalidade do app |
| Outros dados ▸ Outros tipos de dados *(conforme o manifesto do SDK)* | Sim | Não | Não | Análises |

- Ao marcar "rastreamento = Sim" a Apple mostra "Dados usados para rastrear você" na página do app. É esperado.
- **Domínio de rastreamento** já está no app: `ep1.facebook.com`.
- **URL da Política de Privacidade:** a mesma (`/legal/privacy`), **já com a seção 2.5** (PR de política, ver abaixo).

## 2. Regras da Apple que o app já cumpre (para o texto ao revisor, se perguntarem)
- O pedido de rastreamento (ATT) aparece **na 1ª abertura**, com o texto: "Usamos essa permissão para mostrar anúncios mais relevantes para você."
- **Recusar o rastreamento não tira nenhuma função do app** (diretriz 5.1.2): tudo funciona igual.
- O SDK **não** recebe dados de pets, saúde, localização, fotos nem o que o tutor cadastra.

Sugestão de nota ao revisor (inglês): *"The app uses the Meta SDK only to measure app-install ad campaigns. Tracking permission (ATT) is requested on first launch and declining it does not affect any feature. No pet, health, location or user-generated data is shared with Meta."*

## 3. Google Play
Sem mudança na 1.1 do Android (sem SDK novo). A seção "Segurança dos dados" do Play permanece como está.

## 4. Política de Privacidade (site)
PR separado com a **seção 2.5** (publicidade e medição de campanhas no app para iPhone/iPad) e uma linha no compartilhamento (5.2). **Mergear junto com o lançamento da 1.1**, para a política acompanhar o app que a Apple está revisando; a data "Última atualização" da página deve ser a do merge.

## 5. Ordem no dia do envio
1. Atualizar os **rótulos de privacidade** (tabela acima) antes de enviar a 1.1 à revisão.
2. Mergear o PR da política e conferir `petmol.com.br/legal/privacy`.
3. Enviar a 1.1. Se a Apple perguntar sobre o rastreamento, usar a nota da seção 2.
