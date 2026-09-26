# Localização em segundo plano (iOS) — justificativa para a App Review

Status: **proposta, nada implementado.** Conflita com o que está publicado hoje (Política de Privacidade §2.4, `APP_STORE_METADATA.md`, manifesto Android: "nunca em segundo plano"). Só entra numa versão depois que o dono aprovar este documento.

## 1. Por que a Apple reprova e como não cair nisso
Diretrizes envolvidas (conferir o texto vigente na hora de enviar): **2.5.4** (segundo plano só para o fim declarado), **5.1.1** (pedir só dados relevantes à função principal; consentimento claro) e **5.1.5** (localização só quando diretamente relevante e com finalidade explicada no app).
Motivos típicos de reprovação: pedir "Sempre" na primeira abertura, texto genérico, não haver função que dependa disso, coletar mais do que precisa, não dar como desligar.

## 2. A justificativa (a função que depende de segundo plano)
**Pet Sumido** é um alerta comunitário de pet desaparecido: quando um pet some, tutores **que estão perto agora** recebem uma notificação para ajudar a encontrá-lo. É urgente (as primeiras horas decidem).
- O envio escolhe os destinatários pela **última posição conhecida**. Só com o app aberto, essa posição pode ter dias: o aviso chega a quem já saiu da região e **não chega** a quem está perto.
- Alternativas avaliadas e por que não bastam: (a) só primeiro plano — tutor raramente abre o app; (b) região digitada no perfil — cidade inteira, sem precisão útil; (c) localização por IP — imprecisa e instável no celular.
- Segundo plano é o **mínimo necessário** para a função principal do alerta funcionar. Sem ele, o Pet Sumido vira uma notificação para quem está longe.

## 3. Desenho mínimo (o que vamos implementar se aprovado)
- **Só "mudança significativa de localização"** (`startMonitoringSignificantLocationChanges`): aproximadamente a cada 500 m, por torres de celular, baixíssimo consumo; **sem GPS contínuo**, sem ícone de rastreio constante.
- **Nunca** guarda trilha: o servidor mantém só a **última** posição, arredondada, sem histórico (já é assim hoje).
- Usada **apenas** para escolher quem recebe alerta de Pet Sumido. Nunca compartilhada com outros tutores, nunca para anúncios, nunca enviada ao SDK da Meta.
- **Consentimento em duas etapas**: (1) tela explicativa do próprio app, com exemplo, **antes** de qualquer aviso do sistema; (2) só depois pede "Ao usar o app" e, em seguida, o upgrade para "Sempre". **Nunca na primeira abertura.**
- Só pergunta para quem já ativou o Pet Sumido / escolheu compartilhar localização.
- **Desligar em um toque** (Perfil ▸ "parar de compartilhar", já existe) e o app segue funcionando com "Ao usar o app" ou sem localização.
- Se o tutor recusar "Sempre", continua a renovação em primeiro plano de hoje.

## 4. Textos para colar
**Info.plist (pt-BR):**
- `NSLocationAlwaysAndWhenInUseUsageDescription`: "O PETMOL usa sua localização aproximada, mesmo com o app fechado, só para avisar você quando um pet desaparece perto de onde você está. Não guardamos seu trajeto e você pode desligar quando quiser."
- `UIBackgroundModes` += `location`.

**Notas para o revisor (App Store Connect ▸ Informações de revisão, em inglês):**
> PETMOL is a pet-care app. Its "Pet Sumido" (Missing Pet) feature sends a push notification to pet owners who are near a pet that has just gone missing, so the community can help within the first hours. To choose who is "near", the server needs a recent position of each opted-in user; a position that is only refreshed when the app is open is often days old and makes the alert reach the wrong people.
> We therefore use ONLY the low-power **significant-location-change** service (about 500 m granularity, no continuous GPS) and store ONLY the latest position, rounded, with no history. It is used solely to select recipients of Missing Pet alerts; it is never shared with other users, never used for advertising, and never sent to third parties.
> The user is asked in two steps: first an in-app screen explaining the purpose, then the system prompts ("While Using" and later "Always"). It is never requested on first launch, and it can be turned off at any time in Profile ▸ "Stop sharing". The app works fully without "Always".
> How to see it: sign in with the demo account below ▸ Profile ▸ enable "Missing pet alerts near me" ▸ accept the prompts. A screen recording of the flow is attached.
> Demo account: (preencher — **conta de revisor ainda pendente**)

**Anexar:** vídeo de tela (30–60 s) mostrando a tela explicativa, os avisos do sistema, o alerta chegando e o "parar de compartilhar". O revisor não consegue simular deslocamento, então o vídeo pesa muito.

## 5. Conformidade que precisa mudar junto
- **App Privacy (App Store Connect):** Localização (aproximada/precisa) coletada, **vinculada ao usuário** (é ligada à conta), finalidade "funcionalidade do app", **não usada para rastreamento**. (O documento atual marca "não vinculada" — revisar.)
- **Política de Privacidade §2.4:** trocar "nunca em segundo plano" por descrição do modo de mudança significativa, sem histórico, com como desligar.
- **`docs/APP_STORE_METADATA.md`** e o texto de descrição da loja: idem.
- **Android** (fora deste escopo, só se o dono quiser): `ACCESS_BACKGROUND_LOCATION`, divulgação em destaque no app e declaração + vídeo no Play Console.

## 6. Risco e ordem recomendada
Uma reprovação por localização **bloquearia também o SDK da Meta** se forem juntos. Recomendação: **1.1 = só Meta (PR #561)**; **1.2 = localização em segundo plano**. Se o dono preferir tudo junto, o texto acima serve igual.

## 7. Trabalho de implementação (depois da aprovação)
Plugin nativo em Swift (significant-change, relançamento em segundo plano, envio da última posição ao backend usando o token salvo), tela explicativa + fluxo de duas permissões, Info.plist, manifesto de privacidade, endpoint já existente de atualização de posição, Política de Privacidade, testes no iPhone real (mover-se ≥ 500 m com o app fechado).
