Municípios do Brasil (UF, nome, latitude e longitude do ponto de referência de cada município; 5.571 linhas).
Fonte: github.com/kelvins/municipios-brasileiros (licença MIT), a partir de dados do IBGE. Usado SÓ para converter, na hora da
consulta, uma coordenada de GPS em cidade/estado APROXIMADOS (município de referência mais próximo). Nada é gravado de volta.

municipios_ibge.csv — 5.571 municípios com código IBGE (API de localidades do IBGE, baixada em 14/11/2026). Base canônica para normalizar nomes
de cidade e para as listas de estado/cidade da segmentação (ver geo_names.py).

ibge_nomes_sexo.csv — frequências por sexo de nomes do Censo (API pública de nomes do IBGE), só nomes com 2.000+ ocorrências. Usado, desligado por
padrão, para estimar na hora da consulta o sexo provável pelo primeiro nome (ver tutor_sex.py). Nenhum nome de tutor foi enviado a lugar algum.
