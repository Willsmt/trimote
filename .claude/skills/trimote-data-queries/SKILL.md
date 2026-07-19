---
name: trimote-data-queries
description: Aplicar SEMPRE que escrever queries ou lógica envolvendo datas/horários, dinheiro, agregações ou paginação (booking, ledger, relatórios).
---

# Tempo, dinheiro e queries

- Armazenamento SEMPRE em UTC. Lógica temporal de negócio opera no fuso do negócio (Business.timezone / America/Sao_Paulo), com conversão EXPLÍCITA via Luxon. Nunca depender do fuso do servidor.
- Agregações via `prisma.$queryRaw` TIPADO e PARAMETRIZADO (não groupBy) com `AT TIME ZONE $tz`.
- Limites de período: derivar UMA vez (fuso→UTC) e usar como range no WHERE, preservando o índice `(businessId, occurredAt)`. NUNCA aplicar função sobre `occurredAt` no WHERE.
- Dinheiro em `Prisma.Decimal`; serializar para string na fronteira Server/Client.
- Listagens: keyset pagination `(occurredAt, id) desc` com `take = pageSize + 1`. Não usar offset.
