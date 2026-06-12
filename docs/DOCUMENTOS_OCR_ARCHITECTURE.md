# Arquitetura: OCR & Classificador de Documentos Pet

O novo módulo permite centralizar e organizar a vida clínica do pet.

## 1. O Que Foi Feito no Back-end (Python/FastAPI)

1. **`document_classifier.py`**:
   - Uma classe que recebe os bytes de uma imagem/documento e chama o Gemini `1.5-pro`.
   - Utilizamos um sistema avançado de "Prompt Engineering" para forçar o retorno do LLM em JSON estrito.
   - Analisa e extrai dados ricos: tipo_documento, categoria_aba (exames, receitas, laudos, etc), clínica, veterinário, resumo, e carimbo de vacina.

2. **Rotas em `router.py`**:
   - `POST /vision/documents/classify`: Ponto de entrada para o Frontend enviar o Base64. Devolve as entidades processadas.

## 2. O Que Fazer no Front-end (Next.js)

Para consumir esta API de forma perfeita e construir as abas da interface:

### Passo A: Criar a Função Fetcher (Upload e Chamada à API)
Em `apps/web/src/features/pets/services/documentService.ts`:
```typescript
export async function classifyDocument(petId: string, imageBase64: string, token: string) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/vision/documents/classify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      pet_id: petId,
      image_base64: imageBase64.replace(/^data:image\/[a-z]+;base64,/, '')
    })
  });
  
  if (!response.ok) throw new Error("Erro na classificação");
  return response.json(); // Retorna o JSON com a categoria, resumo, médica, etc.
}
```

### Passo B: Interface - As 5 Abas
- **Exames**: Filtra documentos com `categoria_aba === 'exames'`
- **Receitas**: Filtra `categoria_aba === 'receitas'`
- **Laudos**: Filtra `categoria_aba === 'laudos'`
- **Comprovantes**: Filtra `categoria_aba === 'comprovantes'`
- **Fotos**: Filtra `categoria_aba === 'fotos'`

### Passo C: Como Integrar no fluxo de UX
Ao arrastar um documento:
1. Sobe o estado `<UploadSpinner />`
2. Envia Base64 pro Python, o Python responde.
3. Se `contem_selo_vacina` for `true`, abra o modal: *"Detectamos selos de vacina! Deseja registrar essas doses na caderneta principal?"*
4. Se o usuário quiser arquivar, mostre os dados que a IA extraiu para ele editar antes de salvar no Banco de Dados (Firestore/Postgres) da aba correspondente.
