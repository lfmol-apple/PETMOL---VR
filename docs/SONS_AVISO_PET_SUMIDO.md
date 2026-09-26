# Sons do aviso "pet sumido perto de você"

Dois sons de escolha do dono, **prontos e DESLIGADOS** (o padrão continua sendo o som do sistema, igual a hoje).

| Estilo (`PUSH_SOUND_STYLE`) | Som | iOS | Android |
|---|---|---|---|
| `default` | Som do sistema (**hoje**) | — | canal `petmol_default` |
| `petmol` | Sino curto + voz alegre dizendo "Pétmol!" (1,1 s) | `petmol.caf` | canal `petsumido_petmol` (`res/raw/petmol.wav`) |
| `latido` | Dois latidos de cão (1,1 s) | `latido.caf` | canal `petsumido_latido` (`res/raw/latido.wav`) |

## Como ligar / desligar (sem nova versão do app)
1. No `api.env` do servidor: `PUSH_SOUND_STYLE=petmol` (ou `latido`). Para desligar: `default` ou apagar a linha.
2. Reiniciar o serviço da API.
3. Vale só para o aviso de Pet Sumido para tutores próximos (tags `missing-pet-*`, exceto `-expired-`).
- **App que ainda não tem os arquivos** (versões antigas): o iOS toca o som padrão e o Android usa o canal padrão. É seguro ligar antes de todos atualizarem.
- Só chega o som novo em quem **atualizou para a versão que traz os arquivos** (iOS 1.1 build 8 / Android versionCode 5).
- Silencioso/"Não perturbe": o som próprio respeita o modo silencioso do celular.
- Android: um canal não muda de som depois de criado. Para trocar um som no futuro, criar canal novo com id novo.

## Origem e direitos de uso (registro)
- **Voz "Pétmol!" (`petmol`)**: gerada em 26/09/2026 no Runway (`eleven_v3`, voz pré-pronta "Katie", texto `[excited] Pétmol!`), com um sino curto **original** (sintetizado, sem samples) na frente. Uso comercial dentro dos termos do Runway/ElevenLabs. 1 crédito.
- **Latido (`latido`)**: recorte de "Ladrido perro.ogg", Wikimedia Commons, licença **CC0** (domínio público, sem exigir atribuição).
- Os sons **não** copiam os avisos do Mercado Livre nem da Shopee (marcas registradas).
- Todos normalizados em ≈ -14 LUFS, pico ≤ -1,5 dB, mono 44,1 kHz, 16 bits.
