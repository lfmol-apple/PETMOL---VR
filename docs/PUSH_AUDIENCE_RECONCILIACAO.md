# Campanhas push — Etapa 2: reconciliação do motor com o backup de 12/11/2026

**Escopo:** motor de segmentação e contagem (somente leitura). Nada envia notificação. Sem dado individual neste documento.
**Como foi feito:** cópia do backup de 12/11/2026 04:15 UTC restaurada num banco **temporário local** (apagado depois) e o script
`services/price-service/scripts/reconcile_push_audience.py` comparou o motor com um **oráculo em SQL puro** (escrito de forma independente),
em transação somente leitura (com controle negativo: o banco recusa escrita). Data de referência fixa: 2026-11-12T04:15:00Z.

## Resultado
- **31 cenários, motor = oráculo em todos** (matches e alcançáveis), incluindo escopos de pets (algum / mesmo / todos), atividade nas
  4 faixas, GPS, geo-IP, cidade/estado, alimentação e cuidados pelas definições do produto, e combinações E/OU.
- O público **"Todos" do envio avulso atual** e o do motor sem filtro são **exatamente o mesmo conjunto** (1.206 tutores).
- As 4 faixas de atividade somam o total de tutores (2.551).

## Diferenças em relação à primeira auditoria (mesma cópia)
| Item | 1ª auditoria | Motor | Explicação |
|---|---:|---:|---|
| Alcançáveis por push | 1.212 | **1.206** | A 1ª contou **6 assinaturas de navegador de contas que não existem mais** (aparelhos órfãos). O motor só considera tutores existentes |
| Push navegador | 32 | **26** | Mesmo motivo (6 órfãs) |
| Ração cadastrada (tutores) | 1.259 | **1.243** | A 1ª usou "plano ativo" e ignorou `deleted_at`; o motor usa a definição do produto (`_feeding_configured_pet_ids`) |
| Atividade 7 dias | 617 | 616 | Corte exato em agora−7d (a 1ª usou data de calendário) |
| Atividade mais de 30 dias | 816 | 817 | idem |
| Todos os demais (tutores, gato, gata, cão e gato, vários pets, castrados, vacina, parasitas, banho e tosa, medicação, cidade, estado, GPS, iPhone, Android) | — | — | **idênticos** |

**Higiene de dados (fora do escopo, não corrigido):** existem 6 assinaturas de navegador ATIVAS de contas inexistentes. Não recebem push
(o envio parte da tabela de usuários), mas inflam contagens que partam de `push_subscriptions`.

## Saída do script
```
banco: zz_push_audience_tmp | referência: 2026-11-12T04:15:00+00:00 | transação SOMENTE LEITURA
controle negativo: escrita recusada pelo banco (read-only transaction) ✔

== 1) MOTOR × ORÁCULO SQL (matches / alcançáveis)
  ✔ todos os tutores                                 motor  2551/ 1206 | oráculo  2551/ 1206
  ✔ plataforma iPhone                                motor   736/  734 | oráculo   736/  734
  ✔ plataforma Android                               motor   459/  457 | oráculo   459/  457
  ✔ plataforma navegador                             motor    26/   26 | oráculo    26/   26
  ✔ tutor com gato                                   motor   253/  130 | oráculo   253/  130
  ✔ tutor com cão e gato                             motor    55/   42 | oráculo    55/   42
  ✔ tutor só de cão                                  motor  1926/ 1020 | oráculo  1926/ 1020
  ✔ mais de um pet                                   motor   358/  247 | oráculo   358/  247
  ✔ sem nenhum pet                                   motor   345/   40 | oráculo   345/   40
  ✔ gata (o MESMO pet é gato e fêmea)                motor   151/   76 | oráculo   151/   76
  ✔ gato E fêmea (pets podem ser diferentes)         motor   161/   85 | oráculo   161/   85
  ✔ TODOS os pets são cães                           motor  1926/ 1020 | oráculo  1926/ 1020
  ✔ algum pet castrado = sim                         motor   724/  396 | oráculo   724/  396
  ✔ raça contém 'golden'                             motor   106/   64 | oráculo   106/   64
  ✔ idade ≥ 12 meses                                 motor  1095/  611 | oráculo  1095/  611
  ✔ peso entre 5 e 20 kg                             motor   770/  435 | oráculo   770/  435
  ✔ ração cadastrada (definição do produto)          motor  1243/  817 | oráculo  1243/  817
  ✔ marca da ração contém 'premier'                  motor   153/  112 | oráculo   153/  112
  ✔ tem vacina registrada                            motor   591/  433 | oráculo   591/  433
  ✔ tem vermífugo/antipulgas/coleira                 motor   473/  362 | oráculo   473/  362
  ✔ tem banho e tosa                                 motor   298/  232 | oráculo   298/  232
  ✔ tem medicação                                    motor    61/   46 | oráculo    61/   46
  ✔ atividade: últimos 7 dias                        motor   616/  350 | oráculo   616/  350
  ✔ atividade: 8 a 30 dias                           motor  1107/  516 | oráculo  1107/  516
  ✔ atividade: mais de 30 dias                       motor   817/  339 | oráculo   817/  339
  ✔ atividade: sem registro                          motor    11/    1 | oráculo    11/    1
  ✔ estado cadastrado = SP                           motor    49/   36 | oráculo    49/   36
  ✔ cidade cadastrada = Belo Horizonte               motor    11/    7 | oráculo    11/    7
  ✔ GPS a até 50 km de BH                            motor    75/   60 | oráculo    75/   60
  ✔ geo-IP (última região) = São Paulo               motor   388/  211 | oráculo   388/  211
  ✔ COMBINADO: gato E ativo nos últimos 7 dias       motor    52/   36 | oráculo    52/   36
  ✔ COMBINADO (OU): iPhone OU GPS perto de BH        motor   773/  756 | oráculo   773/  756

== 1b) HIGIENE: aparelhos ATIVOS de contas que não existem mais: navegador 6, app 0 (o motor ignora; a 1ª auditoria contou)

== 2) UNIVERSO
  tutores 2551 | alcançáveis 1206 | sem push 1341 | opt-out com push 4
  alcançáveis por canal: {'ios': 734, 'android': 457, 'web': 26, 'mais_de_um_canal': 10}

== 3) COMPARAÇÃO COM A PRIMEIRA AUDITORIA (mesma cópia de 12/11)
  tutores                                    1ª auditoria  2551 | motor  2551 | igual
  alcançáveis por push                       1ª auditoria  1212 | motor  1206 | diferença -6
  push iPhone                                1ª auditoria   736 | motor   736 | igual
  push Android                               1ª auditoria   459 | motor   459 | igual
  push navegador                             1ª auditoria    32 | motor    26 | diferença -6
  com gato                                   1ª auditoria   253 | motor   253 | igual
  com gata (fêmea)                           1ª auditoria   151 | motor   151 | igual
  cão e gato                                 1ª auditoria    55 | motor    55 | igual
  mais de um pet                             1ª auditoria   358 | motor   358 | igual
  pets castrados = sim (PETS)                1ª auditoria   898 | motor   898 | igual
  ração cadastrada (tutores)                 1ª auditoria  1259 | motor  1243 | diferença -16
  vacina (tutores)                           1ª auditoria   591 | motor   591 | igual
  vermífugo/antipulgas/coleira (tutores)     1ª auditoria   473 | motor   473 | igual
  banho e tosa (tutores)                     1ª auditoria   298 | motor   298 | igual
  medicação (tutores)                        1ª auditoria    61 | motor    61 | igual
  algum cuidado (vacina/parasita/banho)      1ª auditoria   853 | motor   853 | igual
  cidade cadastrada                          1ª auditoria   167 | motor   167 | igual
  estado cadastrado                          1ª auditoria   149 | motor   149 | igual
  GPS (source=gps)                           1ª auditoria   822 | motor   822 | igual
  (a 1ª auditoria ignorou 'apagado' (deleted_at) e usou 'plano ativo' como ração cadastrada; o motor usa as definições do produto)

== 4) ATIVIDADE: quatro faixas distintas (data de referência exata)
  últimos 7 dias               616
  8 a 30 dias                 1107
  mais de 30 dias              817
  sem atividade registrada      11
  soma 2551 (deve ser igual ao total de tutores: ✔) | 1ª auditoria (≥05/11: 617 · 13/10–04/11: 1107 · antes: 816 · sem evento: 11) usava cortes diferentes

== 5) DESEMPENHO (PostgreSQL, cópia local; mediana de 7 execuções)
  sem filtro                     mediana      10 ms | máx      10 ms
  1 filtro simples (gato)        mediana      27 ms | máx      91 ms
  11 filtros combinados (OU)     mediana     128 ms | máx     189 ms
  sugestões de marca                  10 ms (15 sugestões) | eventos na tabela: 146595
  consultas por contagem complexa: ver transação única; tutores 2551, pets 2735

== 6) SESSÃO SOMENTE LEITURA DO ENDPOINT
  ✔ a sessão usada pelos endpoints recusa escrita no próprio banco

RESULTADO: TUDO CONFERE
```

## Limites e otimizações futuras
O motor carrega tutores, pets e conjuntos de ids em memória a cada consulta (teto explícito `MAX_USERS_IN_MEMORY = 50.000`; acima disso
recusa com 503). Medido: ≈10 ms sem filtro, ≈130 ms com 11 filtros combinados, 2.551 tutores / 2.735 pets / 146.595 eventos. Se a base
crescer: cache curto dos conjuntos-base, pré-agregação da atividade por tutor e empurrar as regras mais seletivas para SQL — mantendo a
mesma semântica e o teste diferencial (`tests/test_push_audience.py`) como guarda.
