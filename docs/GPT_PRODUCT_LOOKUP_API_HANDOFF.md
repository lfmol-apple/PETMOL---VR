# PETMOL - Handoff para GPT: Product Lookup API Funcional

## Objetivo

Substituir/adicionar uma API de consulta de produto por codigo de barras que funcione de verdade no backend FastAPI do PETMOL.

Fluxo esperado:

```text
scanner -> /api/product-lookup -> petmol_db -> APIs externas gratuitas/funcionais -> manual
```

O frontend deve continuar simples: ele chama apenas o backend.

## Problema atual

O PETMOL ja tem:

- scanner lendo codigo
- endpoint `POST /api/product-lookup`
- memoria propria `scanned_product_memory`
- endpoint `POST /api/product-lookup/confirm`
- fallback manual

Mas as fontes gratuitas atuais nem sempre identificam produtos brasileiros/medicamentos.

Ordem atual no backend:

```text
1. petmol_db
2. Open Food Facts
3. UPCitemdb
4. BarcodeLookup HTML best-effort
5. found=false/manual
```

## Bloqueio especifico do BarcodeLookup

O usuario sugeriu a URL direta:

```text
https://www.barcodelookup.com/7896006217244
```

Foi implementado um fallback HTML best-effort para:

```text
https://www.barcodelookup.com/{code}
```

Porem, em teste server-side real, a resposta foi:

```json
{
  "provider": "barcodelookup",
  "message": "HTTP 403"
}
```

Em curl local, o site tambem retornou uma pagina de verificacao Cloudflare:

```text
Checking if the site connection is secure...
Enable JavaScript and cookies to continue
```

Portanto, nao tratar BarcodeLookup HTML como fonte confiavel. Nao usar Selenium/Cloudflare bypass. A tarefa e plugar uma API que funcione.

## Arquivos principais

Backend:

- `services/price-service/src/product_lookup.py`
- `services/price-service/src/main.py`
- `services/price-service/src/db.py`

Frontend:

- `apps/web/src/features/product-detection/resolver.ts`
- `apps/web/src/features/product-detection/types.ts`
- `apps/web/src/components/ProductDetectionSheet.tsx`
- `apps/web/src/components/ProductBarcodeScanner.tsx`
- `apps/web/src/lib/productScanner.ts`
- `apps/web/src/lib/api.ts`

## Contrato do endpoint atual

### Lookup

```http
POST /api/product-lookup
Content-Type: application/json

{
  "code": "7896006217244"
}
```

Resposta encontrada:

```json
{
  "code": "7896006217244",
  "found": true,
  "name": "Nome do produto",
  "brand": "Marca",
  "category": "medication",
  "source": "nome_da_api",
  "confidence": 0.8,
  "suggest_manual_registration": false,
  "errors": []
}
```

Resposta nao encontrada:

```json
{
  "code": "7896006217244",
  "found": false,
  "name": null,
  "brand": null,
  "category": "other",
  "source": "none",
  "confidence": 0.0,
  "suggest_manual_registration": true,
  "errors": [
    {
      "provider": "provider-name",
      "message": "nao encontrado"
    }
  ]
}
```

### Confirmacao/aprendizado

```http
POST /api/product-lookup/confirm
Content-Type: application/json

{
  "code": "7896006217244",
  "name": "Nome confirmado",
  "brand": "Marca",
  "category": "medication",
  "manufacturer": "Fabricante",
  "presentation": "10mg",
  "source": "user_confirmed"
}
```

Esse endpoint salva/atualiza a tabela `scanned_product_memory`. Depois disso, o lookup do mesmo codigo deve retornar:

```json
{
  "source": "petmol_db",
  "confidence": 1.0
}
```

## Regras de implementacao

- Nao mover lookup para o frontend.
- Nao quebrar `petmol_db` como primeira fonte.
- Nao remover fallback manual.
- Nao depender de API paga sem deixar configuracao opcional por env.
- Nao usar scraping com bypass anti-bot.
- Se uma API falhar, retornar JSON seguro e seguir para proxima fonte.
- Timeout curto por provider.
- Logs no backend:
  - codigo recebido
  - provider chamado
  - status
  - encontrou ou nao encontrou

## Testes esperados

Rodar no backend:

```bash
PYTHONPATH=. ../../.venv/bin/python -m py_compile src/product_lookup.py src/main.py
```

Rodar no frontend:

```bash
npx tsc --noEmit
```

Testar:

```bash
curl -i -H 'Content-Type: application/json' \
  -d '{"code":"7896006217244"}' \
  https://petmol.com.br/api/product-lookup
```

Testar tambem um codigo conhecido em Open Food Facts:

```bash
curl -i -H 'Content-Type: application/json' \
  -d '{"code":"3017620422003"}' \
  https://petmol.com.br/api/product-lookup
```

## Estado de producao antes deste handoff

Deploy estava funcionando e health checks passavam.

Validado:

- `POST /api/product-lookup/confirm` salva em `petmol_db`.
- lookup seguinte retorna `source: petmol_db`.
- Open Food Facts funciona, mas pode rate-limit (`HTTP 429`).
- UPCitemdb funciona como fallback, mas cobertura e limitada.
- BarcodeLookup HTML esta implementado, mas retornou `HTTP 403` em producao para `7896006217244`.

## O que o proximo GPT deve fazer

Encontrar e plugar uma fonte/API que realmente resolva codigos brasileiros como `7896006217244`, mantendo o contrato acima.

Se exigir chave, usar env var e fallback seguro:

```text
PRODUCT_LOOKUP_API_KEY
```

ou nome especifico da API escolhida.

Nao quebrar:

```text
petmol_db -> provider externo -> manual
```

