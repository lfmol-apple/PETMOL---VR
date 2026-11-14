# Campanhas push — Etapa A: localização por origem

Somente leitura: nada aqui grava dados do tutor, envia notificação ou muda flag/limite. Coordenadas e cadastro guardados nunca são alterados.

## Origens (sempre identificadas na tela e na contagem)
| Origem | Fonte | Natureza |
|---|---|---|
| `cadastro` | estado/cidade digitados pelo tutor | declarada |
| `ip_direto` | geo-IP do evento mais recente do próprio tutor (`user_id` no evento) | aproximada |
| `ip_aparelho` | geo-IP de eventos anteriores ao login do mesmo aparelho (`anonymous_id`) | aproximada |
| `gps` | última posição (`location_source='gps'`) → município de referência mais próximo (≤ 60 km), offline | aproximada |

"Melhor disponível" = cadastro → IP → GPS, campo a campo; cada tutor entra com a origem que usou (`origin_breakdown`).

## Regra segura do aparelho (calculada a cada consulta)
Eventos sem tutor só valem para o tutor do aparelho se, em TODO o histórico até "agora": o `anonymous_id` tem exatamente 1 tutor e no máximo 1 plataforma. Surgiu um 2º tutor ou outra plataforma → os eventos anônimos deixam de valer na hora. Eventos já marcados com um tutor são sempre só dele. Empate de horário: prefere o dado do próprio tutor.

## Campos novos (27 filtros no total)
`location_ip_state/city`, `location_gps_state/city`, `location_best_state/city` (todos aproximados: exigem ciência). `location_registered_*` (cadastro) e `location_gps_radius`/`location_geoip_region` seguem como estavam.

## GPS → município
`src/admin/data/municipios_br.csv` (5.571 municípios; fonte kelvins/municipios-brasileiros, MIT, dados IBGE). Ponto de referência de cada município, não polígono: perto de divisas pode apontar o vizinho. Por isso é sempre "aproximada".

## Painel
`GET /audience/location-coverage` (somente leitura): cobertura real por origem entre os alcançáveis. Cobertura ≠ precisão.

## Medição em produção (14/11/2026, SQL equivalente, leitura)
Alcançáveis 1.289: IP direto 838; direto + aparelho seguro 1.270 (98,5%); concordância região pré×pós-login 94% (aleatório 14%). Aparelhos: 11.290; 70 com 2+ tutores e 11 com 2+ plataformas (com tutor) excluídos.

## Riscos
- Município de referência ≠ município que contém o ponto (divisas, municípios grandes).
- IP móvel/VPN pode apontar para outra cidade; cobertura alta não é precisão.
- Aparelho emprestado a um segundo tutor invalida os anônimos antigos (conservador por desenho).
- Leitura extra no `analytics_product_events` por consulta de localização (índices `anonymous_id` e `user_id,received_at` já existem).
