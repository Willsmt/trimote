---
name: trimote-database
description: Aplicar SEMPRE que editar prisma/schema.prisma, criar ou editar migrations, ou desenhar constraints e unicidade.
---

# Banco de dados: integridade e migrations

- Integridade é responsabilidade do BANCO: unicidade via constraint UNIQUE (não só checagem na aplicação); não-sobreposição de agendamento via exclusion constraint `booking_no_overlap` (EXCLUDE USING gist com tstzrange, btree_gist). Duplicidade e conflito devem ser impossíveis no nível de dados, mesmo sob concorrência.
- Operações que dependem de unicidade/não-sobreposição rodam em transação atômica; falha de constraint é tratada explicitamente, nunca silenciada.
- Migration DESTRUTIVA (rename/drop) NÃO vai num deploy só. O `migrate deploy` roda no build enquanto o deploy anterior serve tráfego: rename/drop derruba produção nessa janela. Destrutiva vira expand/contract em dois deploys: (1) adiciona o novo e escreve nos dois; (2) remove o velho quando o código novo está servindo. Exemplo do que NÃO fazer sozinho: `20260703120000_rename_business`.
- Renames de tabela/coluna: `prisma migrate dev --create-only` + SQL editado à mão com `ALTER TABLE ... RENAME` (o SQL ingênuo do Prisma faz DROP+CREATE e perde dados/índices/exclusion constraint).
