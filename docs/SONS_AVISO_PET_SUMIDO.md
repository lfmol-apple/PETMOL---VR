# Sons do aviso "pet sumido perto de você"

Dois sons de escolha do dono. **O som do PETMOL está LIGADO por padrão no servidor** (decisão de 26/09/2026, PR #563) e só toca em quem atualizar para a versão que traz os arquivos; quem não atualizou continua ouvindo o som do sistema. **Voltar ao padrão a qualquer momento:** `PUSH_SOUND_STYLE=default` + reiniciar.

| Estilo (`PUSH_SOUND_STYLE`) | Som | iOS | Android |
|---|---|---|---|
| `default` | Som do sistema (como era antes; **é só para onde voltar**) | — | canal `petmol_default` |
| `petmol` (**padrão atual**) | Sino curto + voz alegre dizendo "Pétmol!" (1,1 s) | `petmol.caf` | canal `petsumido_petmol` (`res/raw/petmol.wav`) |
| `latido` | Dois latidos de cão (1,1 s) | `latido.caf` | canal `petsumido_latido` (`res/raw/latido.wav`) |

## Como trocar / voltar ao padrão (sem nova versão do app)
1. No `api.env` do servidor: `PUSH_SOUND_STYLE=default` (volta ao som do sistema), `latido` (troca pelo latido) ou `petmol` (padrão do código; apagar a linha também vale).
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
