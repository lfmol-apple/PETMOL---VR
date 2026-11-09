# Padrão de espécies do PETMOL

**Princípio:** o PETMOL nunca mostra, a um tutor, algo que não se aplica ao bicho dele. Um card de vacina para um coelho,
"vermífugo de Nuvem em dia?" para um peixe ou "CÃO" no cartaz de um cavalo tiram a credibilidade do app inteiro.

Regra de ouro: **o que não está declarado para a espécie, não aparece** (negar por padrão).

## Onde fica a regra (fonte única)

- App: `apps/web/src/lib/speciesCare.ts` (`speciesCare(species)`).
- Servidor: `species_applies()` em `services/price-service/src/admin/broadcast_router.py` (espelho do app).
- Nomes e emojis: `speciesLabel`, `speciesNoun`, `speciesPosterEmoji` (`speciesCare.ts`) e `petSpeciesEmoji` (`petTaxonomy.ts`).

## Matriz

| Capacidade | Cão | Gato | Coelho, cavalo, texto livre, "outro" | Peixe, pássaro, hamster |
|---|---|---|---|---|
| Vacina (card da Home) | sim | sim | não | não |
| Vermífugo / Antipulgas | sim | sim | não | não |
| Coleira | sim | não | não | não |
| Lembrete de passeio | sim | sim | não | não |
| Banho e Tosa | sim | sim | sim | **não** |
| Cio | só fêmea não castrada | só fêmea não castrada | não | não |
| Raça (lista) | sim | sim | não | não |
| Alimentação, Loja, PetShops, Emergência, Pet Sumido, foto, peso | sim | sim | sim | sim |

Espécie ausente = **cão** (pets antigos). A espécie pode ser um texto livre do tutor ("cavalo", "furão"): tudo que não for
`dog`/`cat` cai em "outro".

## Como criar uma funcionalidade nova

1. Pergunte: **isto serve a todo bicho?** Se não, declare a capacidade em `speciesCare` (ex.: `care.walk`) e escreva a linha
   na matriz acima.
2. Na tela, use `care.xxx`. **Nunca** `pet.species === 'dog'` ou `'cat'` direto: o teste `src/lib/speciesRule.test.ts` falha
   e diz como corrigir. (Os usos antigos e legítimos estão congelados na lista do próprio teste.)
3. Texto e emoji: use `speciesLabel` / `petSpeciesEmoji` / `speciesPosterEmoji`. Nunca presuma "Cachorro" ou 🐶. Sem espécie
   informada em alertas, o texto é "Pet".
4. Notificação ou campanha do servidor: se o assunto não vale para toda espécie, marque a meta com `"care"` no
   `GOAL_CATALOG`; o público e os nomes citados passam a considerar só os pets a quem se aplica.
5. Nada de aviso de erro ou de "não suportado" ao tutor: o que não se aplica simplesmente não aparece.

## Pontos conhecidos para melhorar

- Peso: só `kg` e `lb`. Para hamster ou pássaro (gramas) seria melhor oferecer `g`.
- Raça: sem lista para espécies fora cão/gato (campo livre seria um próximo passo).
- Cio: só cão e gato por enquanto. Ritmos próprios (cadela: 5/6 meses, 1/2/3 semanas; gata: sazonal, 2/3/4 semanas, 4/7/10 dias) em `lib/heatCycles.ts` (HEAT_PROFILES) e `pets/heat_care.py`; mudar um, mudar o outro.
