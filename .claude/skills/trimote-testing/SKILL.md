---
name: trimote-testing
description: Aplicar SOMENTE ao escrever ou revisar testes (Vitest, tests/unit, tests/integration).
---

# Testes

- Test-first é NÃO-NEGOCIÁVEL para disponibilidade e conflito de agendamento: teste falhando ANTES da implementação (Red → Green → Refactor), cobrindo bordas de horário, sobreposição e concorrência.
- Demais áreas: testes proporcionais ao risco.
- Regressão da suíte completa é critério de DESIGN, não detalhe: a suíte inteira verde é condição de conclusão de qualquer feature.
- Estrutura: tests/integration/<domínio> e tests/unit/<domínio>. Testes de integração batem no Postgres real (Docker :5433).
- Smoke test manual pelo Willians antes de todo merge é requisito institucional — nenhuma automação substitui esse gate.
