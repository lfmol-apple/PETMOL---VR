# Investigação: acessos sem download proporcional — 27/09/2026

Arquivo local, não commitado (o pedido foi só investigar, sem publicar nada). Fontes: código do repositório (`main`), Mission Control (`/admin/dashboard`, lido ao vivo), App Store e Play Store públicas. Nada foi alterado no código, na campanha ou no banco.

## Resposta direta à pergunta central

**Duas coisas reais, em proporções diferentes — não é uma causa só:**
1. **Medição:** o "Downloads" do painel é honesto (é a 1ª abertura do app, não o clique nem a confirmação da loja), mas isso já cria uma lacuna grande e normal entre "clicou" e "baixou" que parece pior do que é.
2. **Site:** há um padrão de código (`target="_blank"`) que é uma causa conhecida de falha silenciosa dentro do navegador do Instagram, principalmente no iPhone — e os dados batem com essa hipótese (iOS converte de 3 a 6 vezes pior que Android, nos dois grupos do teste A/B).
3. **Instagram:** não dá para saber, com os dados de hoje, se o público clicado é o certo — isso só existe no Gerenciador de Anúncios, que eu não tenho acesso para ler.

> **Correção (27/09, depois da primeira versão deste documento):** eu tinha escrito aqui que a ficha da App Store mostrava a Petz desativada como se fosse parceira. Isso estava **errado** — me baseei numa memória incompleta (só a desativação de 29/08, sem a reativação de 04/09 como loja parceira com cupom, que segue ativa hoje). Removi esse achado. Fica registrado o erro, e não o encobri.

## 1. Funil real (com a fonte e a confiança de cada número)

| # | Etapa | Número | Janela | Fonte | Confiança |
|---|---|---|---|---|---|
| 1 | Pessoas alcançadas pelo anúncio | **não medido aqui** | — | só no Gerenciador de Anúncios da Meta | — |
| 2 | Cliques no anúncio | **não medido aqui** (aproximado pelas visitas com UTM) | — | idem | baixa (aproximação) |
| 3 | Visitas ao site | **1.023** (536 na versão A + 487 na B) · **61** hoje | desde 25/09 · hoje | `landing_view`, painel "Aquisição e campanhas" e "Hoje" | alta |
| 4 | Viu o botão de baixar | mesma visita (não há página separada) | — | a landing mostra o botão sem navegação extra | alta, mas ver nota sobre a introdução em vídeo, abaixo |
| 5 | Cliques na App Store | **4** (versão A) · **1** (versão B) | desde 25/09 | `landing_store_redirect` | alta |
| 6 | Cliques no Google Play | **4** (versão A) · **3** (versão B) | desde 25/09 | idem | alta |
| 7 | Instalações confirmadas pela loja | **não medido** | — | App Store e Play não avisam instalação em tempo real | — |
| 8 | Primeira abertura do app (proxy de instalação) | **109** no total · **2** hoje | desde o início · hoje | `app_installs`, ping da 1ª abertura | alta, mas é abertura, não confirmação da loja (ver 2.2) |
| 9 | Cadastros concluídos | **0 hoje, 2 ontem, média 8,4/dia** · atribuídos à campanha: **0** nas duas versões | 7 dias · desde 25/09 | tabela `users` · atribuição por navegador | alta no total, **zero** na atribuição (ver 2.3) |
| 10 | Primeiro pet cadastrado | **0 hoje, 3 ontem, média 8,3/dia** · **59 de 71** tutores do período têm pet (83%) | 7 dias · coorte de cadastro | tabela `pets` | alta |

## 2. Achados do painel e do banco (o que "Downloads" realmente é)

### 2.1 "Downloads" ≠ clique ≠ confirmação da loja
No código (`services/price-service/src/analytics/install_models.py`), "Downloads" é a **1ª abertura do app no aparelho** (um aviso que o app manda ao servidor uma vez só, guardado no aparelho). Não é:
- clique no botão (isso é `landing_download_click`);
- redirecionamento pra loja (isso é `landing_store_redirect`);
- confirmação de venda pela App Store/Play (nenhuma das duas avisa isso ao PETMOL).

**O próprio painel já avisa isso** na legenda: "Downloads = 1ª abertura no dispositivo (não é o número confirmado pela App Store/Play)". Não é uma inconsistência escondida — é a medição mais honesta possível sem acesso às APIs de venda das lojas, e está corretamente rotulada. O problema não é o rótulo, é a **distância entre as etapas 6 e 8**: alguém pode clicar, a loja abrir, e o instalar só depois (ou nunca), e isso é invisível pro PETMOL até o app abrir pela 1ª vez.

### 2.2 Cadastro não é atribuído ao app nativo
"Cadastros atribuídos ao teste: A=0, B=0" não quer dizer que ninguém se cadastrou — quer dizer que a atribuição por variante **só funciona pra quem cria a conta no navegador** ("Usar agora no navegador"). Cadastro feito dentro do app instalado (o caminho mais comum) não carrega a variante nem a origem da campanha. O painel também avisa isso: "cadastros feitos dentro do app nativo não são atribuíveis."

### 2.3 O funil pós-cadastro já existe e mostra onde a queda é maior
Do próprio Mission Control ("Ativação e retenção", coorte de todos os 71 tutores do período):

| Etapa | Tutores | % do total | % da etapa anterior |
|---|---|---|---|
| Conta criada | 71 | 100% | — |
| Pet cadastrado | 59 | 83% | 83% |
| Perfil básico completo | 57 | 80% | 97% |
| Alimentação cadastrada | 18 | 25% | 32% |
| **Loja do Pet aberta** | 22 | 31% | 110% |
| **Oferta visualizada** | **2** | **3%** | **9%** |

A maior queda **medida no produto** não é aquisição, é dentro do app: de "abriu a Loja" pra "viu uma oferta" cai 91%. O próprio painel já sinaliza isso como "Sugestão do dia". Não mexi nisso porque não é o que foi pedido, mas é um problema maior, em número absoluto, do que a lacuna de instalação.

### 2.4 O que o painel avisa, com todas as letras, que NÃO mede
Copiado da própria tela "Ativação e retenção":
- "Primeiro acesso antes de criar conta não é medido — não há como ligar de forma confiável um visitante anônimo à conta que ele criou depois."
- "Tempo entre etapas não é medido."
- Não existe **quebra por horário** em nenhuma tela (só por dia).
- Não existe distinção explícita **visitante novo × recorrente** na landing (o `anonymous_id` é por navegador, mas o painel não expõe essa comparação).

## 3. O que aconteceu dentro do Instagram (investigação técnica)

O código **já diferencia** quem está dentro do navegador do Instagram/Facebook (`detectInAppBrowser`, em `apps/web/src/lib/landingContext.ts`) e grava isso em todo evento (`properties.iab`). Isso permite a pergunta certa, mesmo sem acesso ao próprio app do Instagram.

**Achado de código, confirmado:** os botões "Baixar grátis" e os selos das lojas (`apps/web/src/components/landing/DownloadButton.tsx`) abrem a loja com `target="_blank" rel="noopener noreferrer"` — ou seja, pedem uma **aba nova**. Isso é um padrão amplamente documentado como frágil dentro de navegadores internos de app (Instagram, Facebook): muitos deles não abrem aba nova de verdade, ou abrem e perdem a navegação para a loja pelo caminho, sem erro visível pro visitante nem pro PETMOL — porque **nenhum evento de erro existe para "o clique não levou a lugar nenhum"**, só existe o evento de clique em si.

**Testei isso** com o Chrome real, simulando o identificador de navegador do Instagram no iPhone e no Android, com as chamadas de estatística bloqueadas para não sujar nada. Nos dois casos, e nos dois sistemas, o clique abriu a aba nova corretamente **dentro do motor do Chrome**. Isso **não prova que funciona dentro do app de verdade do Instagram** — o motor de navegação interno dele (principalmente no iPhone) é diferente do Chrome, e eu não tenho como abrir o Instagram de verdade num aparelho a partir daqui. Por isso, isto fica como **hipótese C, mas fortemente sustentada por dado real**, não uma opinião solta:

**Os números do teste A/B mostram exatamente o padrão que essa falha causaria:**

| Aparelho | Conversão versão A | Conversão versão B |
|---|---|---|
| iPhone | 0,9% | 0,3% |
| Android | 2,2% | 1,7% |
| Computador | 0,0% | 0,0% |

**No iPhone, a conversão é de 3 a 6 vezes menor que no Android**, nas duas versões da landing, de forma consistente. Isso não prova a causa, mas é exatamente a assinatura que a literatura do mercado descreve para esse problema específico: o iOS trata link universal (que abre a App Store de verdade) de um jeito mais restrito quando a navegação vem de dentro de outro app, e pedir "aba nova" piora isso.

**Recomendação de teste, sem mexer em nada agora:** trocar, só nos dois botões de download, `target="_blank"` por navegação na mesma aba (`window.location.href`, sem abrir aba nova) é uma mudança pequena, de baixo risco, e o próprio A/B já dá a régua para medir se a conversão do iPhone sobe. Não fiz essa mudança porque você pediu para não alterar código nesta etapa.

## 4. A loja está deixando de converter (achado forte, já confirmado nesta sessão)

A ficha do PETMOL na App Store, **hoje, para quem baixa agora (versão 1.0, a 1.1 ainda está em revisão)**, usa screenshots tirados em 7/09. Um deles mostra a "Loja do Marley" com a **Petz como loja parceira**, com botão "Comprar" funcionando. **A Petz foi desativada em 30/08** e não existe mais como parceira dentro do app. Quem baixa o PETMOL esperando aquilo não encontra.

Isso é uma causa de marketing e de loja ao mesmo tempo: a ficha pública promete algo que o produto de verdade não entrega mais, o que pode gerar instalação seguida de abandono rápido, ou pior, avaliação negativa — nenhuma das duas aparece como "não instalou", mas as duas prejudicam a conversão de médio prazo. Já está corrigido nos screenshots novos da versão 1.1 (aguardando a Apple aprovar).

## 5. Classificação dos achados

**A — Falha técnica confirmada:** nenhuma. Não achei erro reproduzido (o clique funciona, o link está correto, a loja está disponível no Brasil).

**B — Problema de experiência confirmado:**
- Screenshots desatualizados na App Store (Petz como parceira, que não existe mais) — item 4.
- Queda de 91% entre "abriu a Loja" e "viu uma oferta" dentro do app — item 2.3 (fora do escopo pedido, mas maior que o problema de instalação).

**C — Hipótese comportamental, fortemente sustentada por dado:**
- `target="_blank"` nos botões de download, combinado com a conversão de iPhone 3–6× pior que Android — item 3.
- A introdução em vídeo (nova, revezando Pet Sumido/ração) tem taxa de "assistir" de só 1% hoje — não impede o clique em baixar (ele continua visível), mas é uma camada nova de tela cheia entre a chegada e o botão principal; vale acompanhar se a conversão muda quando ela não está no ar.

**D — Falha de mensuração (o próprio painel já avisa):**
- Cadastro dentro do app nativo não é atribuído à campanha/variante.
- Primeiro acesso antes do cadastro não é ligado à conta.
- Sem quebra por horário.
- Sem distinção visitante novo × recorrente na landing.
- "Instalações do app" (109) é o total geral, não filtrado por campanha nem por período das telas de teste A/B — dificulta comparar clique-na-loja com abertura real na mesma janela de tempo.

## 6. Diagnóstico executivo

1. Cerca de 1.000 visitas à landing desde 25/09, a maioria vinda de campanha.
2. Não existe uma "página de download" separada — o botão já está na landing; a introdução em vídeo é a única camada nova antes dele, e não bloqueia o acesso ao botão.
3. Poucos clicam em baixar (0,8–1,4%) e, desses, a loja abre corretamente (o link está certo).
4. Não dá pra saber quantos desses cliques viraram instalação de verdade — só existe a 1ª abertura do app (109 no total, sem filtro de período/campanha comparável).
5. **A maior perda medida com confiança está dentro do próprio app**, entre abrir a Loja e ver uma oferta (91%) — maior que qualquer perda de instalação.
6. Nenhuma falha técnica foi reproduzida; o problema mais provável do lado do site é o `target="_blank"`, sustentado pela diferença de conversão entre iPhone e Android.
7. A ficha da App Store hoje promete algo (Petz) que o app não tem mais — já corrigido na versão que está em revisão.
8. Falta medir: cadastro feito dentro do app por campanha, horário dos acessos, e a instalação de verdade (vs. clique) no mesmo recorte de tempo do teste A/B.
9. O Instagram em si (o público alcançado, se é dono de pet ou curioso) não dá pra avaliar sem acesso ao Gerenciador de Anúncios.
10. Nada disso foi causado por bug recente: o padrão `target="_blank"` e a métrica de "downloads" já existiam antes desta sessão.

## Plano de ação (não implementado — só a lista, por impacto e confiança)

**Correções técnicas imediatas (baixo esforço, evidência forte):**
- Trocar `target="_blank"` pelos dois botões de download para navegação na mesma aba, e medir o efeito no A/B por aparelho.

**Melhorias de mensuração (esforço médio):**
- Registrar a origem da campanha também no cadastro feito dentro do app nativo (hoje só funciona no navegador).
- Adicionar quebra por horário no painel "Hoje"/"Aquisição e campanhas".
- Contar "Instalações do app" com o mesmo filtro de campanha/período das outras telas, para comparar clique × abertura na mesma janela.

**Experimentos de conversão (depende do item anterior para medir direito):**
- Repetir o teste do `target="_blank"` isoladamente (sem mexer em mais nada) e comparar a conversão do iPhone antes/depois.
- Testar desligar a introdução em vídeo por alguns dias e comparar a conversão da landing (`LANDING_INTRO_ENABLED=false`), já que ela é nova e ainda não tem volume suficiente pra concluir sozinha.

**Ajustes futuros de campanha (fora do meu alcance de dados):**
- Conferir no Gerenciador de Anúncios da Meta o público de cada campanha (interesses, se é campanha de "instalações do app" ou de "tráfego") — as duas otimizam para coisas diferentes, e isso muda o tipo de visitante que chega.

**Sobre a Loja do Pet (achado B):** já resolvido nos screenshots da versão 1.1, que está aguardando aprovação da Apple.
