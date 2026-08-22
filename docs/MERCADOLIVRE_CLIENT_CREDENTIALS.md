# Mercado Livre Client Credentials

PETMOL usa Mercado Livre apenas como fonte backend de catálogo/preço em shadow mode. Não há OAuth de usuário, callback, PKCE, Authorization Code nem Refresh Token.

## Variáveis

```env
MERCADOLIVRE_CLIENT_ID=5264011878653004
MERCADOLIVRE_CLIENT_SECRET=
ENABLE_ML_PROVIDER=false
MERCADOLIVRE_PUBLIC_OFFERS_ENABLED=false
MERCADOLIVRE_AFFILIATE_ENABLED=false
```

- `MERCADOLIVRE_CLIENT_SECRET`: configurar somente no env do backend/VPS. Nunca colocar no frontend, banco, logs, commit ou chat.
- `ENABLE_ML_PROVIDER`: liga a consulta backend/shadow.
- `MERCADOLIVRE_PUBLIC_OFFERS_ENABLED`: controla exposição em `/search`; padrão desligado.
- `MERCADOLIVRE_AFFILIATE_ENABLED`: só deve ser ligado quando existir método oficial de monetização implementado.

Em produção com `AFFILIATE_ONLY_COMMERCE=true` ou `ENV=prod`, o ML não deve aparecer para tutores enquanto não houver afiliado oficial confirmado.

## Contrato OAuth Confirmado

Endpoint oficial usado:

```bash
POST https://api.mercadolibre.com/oauth/token
Content-Type: application/x-www-form-urlencoded
Accept: application/json

grant_type=client_credentials
client_id=...
client_secret=...
```

O backend usa `Authorization: Bearer <access_token>` nas chamadas para `https://api.mercadolibre.com/sites/MLB/search`.

## Checklist Manual Para VPS

1. Editar o arquivo de env backend da VPS.
2. Definir `MERCADOLIVRE_CLIENT_SECRET` diretamente no servidor.
3. Opcional para shadow mode: definir `ENABLE_ML_PROVIDER=true`.
4. Manter `MERCADOLIVRE_PUBLIC_OFFERS_ENABLED=false`.
5. Reiniciar a API apenas em janela autorizada.
6. Validar status via endpoint admin `/debug/ml/status`; ele não retorna token nem secret.

## Teste Em Shadow Mode

Com secret configurado e provider ligado apenas no backend:

```bash
cd services/price-service
ENABLE_ML_PROVIDER=true MERCADOLIVRE_PUBLIC_OFFERS_ENABLED=false PYTHONPATH=. .venv/bin/python -m pytest tests/test_mercadolivre_client_credentials.py
```

Para inspeção manual local, use o provider em script interno/backend, nunca expondo URL direta para tutores.

## Rollback

1. Definir `ENABLE_ML_PROVIDER=false`.
2. Garantir `MERCADOLIVRE_PUBLIC_OFFERS_ENABLED=false`.
3. Reiniciar API em janela autorizada.
4. Se necessário, reverter o PR antes do merge ou fazer novo PR removendo a integração.
