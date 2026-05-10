# PETMOL — Arquitetura Oficial

## Frontend

* apps/web → Next.js (interface do tutor)

## Backend principal

* services/price-service → API principal (FastAPI)

## Compartilhado

* shared → catálogos, regras, dados comuns

## Módulos auxiliares

* services/product-suggest → módulo futuro
* functions → legado / experimental

## Regras

* NÃO criar novos backends fora de services
* Toda lógica de negócio deve migrar para o backend principal
* Frontend não deve conter lógica crítica
