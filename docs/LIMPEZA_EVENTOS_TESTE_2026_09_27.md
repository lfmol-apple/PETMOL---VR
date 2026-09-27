# Limpeza de eventos de teste na landing (27/09/2026)

Durante o desenvolvimento do comercial do Pet Sumido, alguns testes automatizados rodaram contra o
servidor de produção de verdade (frontend local, backend apontando pra API ao vivo) e geraram eventos
reais na tabela `analytics_product_events`, com `utm_source=instagram`, misturando-se com tráfego real
de campanha nas telas "Aquisição e campanhas" e "Comercial na entrada" do Mission Control.

## Como foram achados
Assinatura impossível para um visitante real: o vídeo "terminou" a menos de 3 segundos depois de
"começar" (o teste avança o vídeo direto pro fim, em vez de assistir). Um filme de 27 ou 45 segundos
nunca termina assim de verdade. Ver `src/admin/analytics/test_traffic_cleanup.py`.

## O que foi apagado
Só os eventos de landing (`app_open`, `session_start`, `landing_view`, `landing_intro_*`,
`landing_download_click`, `landing_store_redirect`) do mesmo `anonymous_id` das sessões que bateram
nessa assinatura. Nunca toca em conta, pet, vacina ou qualquer dado operacional.

## Como rodar (uma vez, e remover depois)
```
curl -s -X GET    https://www.petmol.com.br/api/v1/admin/analytics/test-traffic-audit  -H "Authorization: Bearer <JWT do admin>"   # prévia, não apaga
curl -s -X DELETE https://www.petmol.com.br/api/v1/admin/analytics/test-traffic-audit  -H "Authorization: Bearer <JWT do admin>"   # apaga
```
Depois de rodar e confirmar o resultado, remover as duas rotas e `test_traffic_cleanup.py` num PR de limpeza.
