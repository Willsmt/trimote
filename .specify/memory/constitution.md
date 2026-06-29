<!--
SYNC IMPACT REPORT
==================
Versão: (template inicial) → 1.0.0
Tipo de bump: Ratificação inicial (de template não preenchido para constituição concreta)

Princípios definidos (7, conforme solicitado pelo autor do projeto):
  I.   Segurança Primeiro (mindset Blue Team)
  II.  Integridade Garantida no Banco de Dados
  III. Qualidade de Código — SOLID e Clean Code
  IV.  Test-First na Lógica de Domínio
  V.   Convenções de Commit, Idioma e Documentação
  VI.  Escopo Disciplinado
  VII. Tempo — UTC no Armazenamento, America/Sao_Paulo na Lógica

Seções adicionadas:
  - Padrões de Segurança e Integridade de Dados (Seção 2)
  - Fluxo de Desenvolvimento e Qualidade (Seção 3)
  - Governança

Seções removidas: nenhuma (placeholders do template substituídos por conteúdo concreto)

Templates dependentes verificados:
  ✅ .specify/templates/plan-template.md   — "Constitution Check" usa gate dinâmico
                                              ([Gates determined based on constitution file]);
                                              nenhuma edição necessária.
  ✅ .specify/templates/spec-template.md    — genérico; sem referências conflitantes a princípios.
  ✅ .specify/templates/tasks-template.md    — tests marcados como OPTIONAL no template; o
                                              Princípio IV torna teste-primeiro OBRIGATÓRIO para
                                              lógica de domínio (disponibilidade/conflito). O
                                              template segue válido — a constituição prevalece e
                                              "solicita" os testes para esse domínio.
  ✅ .specify/templates/checklist-template.md — genérico; nenhuma edição necessária.

TODOs deferidos: nenhum.
-->

# Trimote Constitution

## Core Principles

### I. Segurança Primeiro (mindset Blue Team)

A segurança é tratada como requisito de primeira classe, não como ajuste posterior.

- Segredos (chaves de API, tokens, credenciais de banco de dados) DEVEM ser fornecidos
  exclusivamente por variáveis de ambiente / arquivo `.env`. O `.env` NUNCA é commitado e
  DEVE constar no `.gitignore`.
- Toda entrada externa DEVE ser validada de forma estrita no servidor. A validação de
  client-side é apenas conveniência de UX e NUNCA é confiável isoladamente como barreira
  de segurança ou de integridade.
- Mensagens de erro, respostas de API e logs NÃO DEVEM vazar segredos, dados sensíveis ou
  detalhes internos que facilitem exploração.

**Razão**: o projeto manipula cadastros e agendamentos com dados pessoais; uma postura
defensiva (Blue Team) reduz a superfície de ataque desde o primeiro commit.

### II. Integridade Garantida no Banco de Dados

A consistência dos dados é responsabilidade do banco, não apenas da aplicação.

- Regras de unicidade DEVEM ser garantidas por constraints no banco de dados (ex.: `UNIQUE`),
  não apenas por checagem na camada de aplicação.
- Regras de não-sobreposição (conflito de agendamento) DEVEM ser garantidas por constraints
  e/ou transações no banco (ex.: constraints de exclusão, índices, ou transações com nível
  de isolamento adequado).
- Duplicidade de cadastro e conflito de agendamento DEVEM ser impossíveis no nível de dados,
  mesmo sob requisições concorrentes.

**Razão**: validação apenas em aplicação sofre condições de corrida; a única garantia
confiável de unicidade e não-sobreposição é no armazenamento.

### III. Qualidade de Código — SOLID e Clean Code

O código DEVE ser pequeno, legível e autoexplicativo.

- Módulos e funções DEVEM ser pequenos, coesos e seguir os princípios SOLID.
- Nomes DEVEM tornar a intenção óbvia; comentários NÃO DEVEM repetir o que o código já diz.
  Comentários existem para explicar o "porquê", não o "o quê".
- O tratamento de erro DEVE ser explícito. Logs DEVEM ser significativos para diagnóstico e
  NUNCA DEVEM conter dados sensíveis (ver Princípio I).

**Razão**: legibilidade e baixo acoplamento mantêm o sistema sustentável e auditável.

### IV. Test-First na Lógica de Domínio

A lógica de domínio crítica é desenvolvida orientada a testes.

- Para a lógica de disponibilidade e de conflito de agendamento, um teste falhando DEVE ser
  escrito ANTES da implementação (Red → Green → Refactor).
- Esses testes DEVEM cobrir casos de borda de horário, sobreposição e concorrência.
- Demais áreas SHOULD ter testes proporcionais ao risco, mas a regra teste-primeiro é
  NÃO-NEGOCIÁVEL para disponibilidade e conflito de agendamento.

**Razão**: a corretude de agendamento é o núcleo do produto; regressões silenciosas aqui
são inaceitáveis.

### V. Convenções de Commit, Idioma e Documentação

O projeto adota convenções uniformes e verificáveis.

- Todo commit DEVE seguir Conventional Commits (ex.: `feat:`, `fix:`, `refactor:`, `test:`).
- Nomes de objetos de banco de dados e de código (tabelas, colunas, classes, funções,
  variáveis) DEVEM estar em inglês.
- Comentários e conteúdo de documentação DEVEM estar em português.
- O `README` DEVE ser atualizado a cada nova feature ou nova dependência.

**Razão**: convenções consistentes reduzem atrito de colaboração e tornam o histórico e a
documentação navegáveis.

### VI. Escopo Disciplinado

Cada mudança permanece focada no problema atual.

- Mudanças DEVEM se limitar ao problema em questão.
- Código ou lógica que já funciona em outra parte do sistema NÃO DEVE ser refatorado nem
  alterado sem pedido explícito.
- Melhorias oportunistas fora de escopo SHOULD ser registradas separadamente, não embutidas
  na mudança atual.

**Razão**: alterações focadas são mais fáceis de revisar, testar e reverter, e reduzem o
risco de regressões colaterais.

### VII. Tempo — UTC no Armazenamento, America/Sao_Paulo na Lógica

O tratamento de tempo é explícito e padronizado.

- Toda data/hora DEVE ser armazenada em UTC.
- Toda lógica temporal de negócio (disponibilidade, agendamento, exibição) DEVE operar no
  fuso `America/Sao_Paulo`, convertendo a partir de UTC.
- Conversões de fuso DEVEM ser explícitas no código; NÃO DEVE haver dependência implícita do
  fuso do servidor ou do sistema operacional.

**Razão**: separar armazenamento (UTC) da lógica de apresentação (America/Sao_Paulo) evita
erros de horário de verão e ambiguidades de agendamento.

## Padrões de Segurança e Integridade de Dados

Estes padrões complementam e tornam operacionais os Princípios I e II:

- Configuração sensível NUNCA é versionada; um arquivo de exemplo (ex.: `.env.example`) SHOULD
  documentar as variáveis necessárias sem valores reais.
- Toda operação que cria ou altera cadastro/agendamento DEVE validar a entrada no servidor e
  respeitar as constraints de banco; falhas de constraint DEVEM ser tratadas de forma explícita,
  não silenciada.
- Operações que dependem de unicidade ou não-sobreposição DEVEM ser executadas dentro de uma
  transação que garanta atomicidade sob concorrência.

## Fluxo de Desenvolvimento e Qualidade

- Lógica de domínio crítica segue teste-primeiro (Princípio IV) e DEVE ter testes verdes antes
  de ser considerada concluída.
- Revisões de código (PRs) DEVEM verificar conformidade com esta constituição, em especial os
  Princípios I (segredos/validação), II (constraints de banco) e VI (escopo).
- Commits seguem Conventional Commits (Princípio V) e o `README` é atualizado junto da feature
  ou dependência que o exige.
- Toda complexidade adicionada DEVE ser justificável frente ao Princípio III (Clean Code/SOLID)
  e ao Princípio VI (escopo disciplinado).

## Governance

Esta constituição prevalece sobre quaisquer outras práticas do projeto Trimote.

- **Emendas**: alterações a esta constituição DEVEM ser documentadas (o que mudou e por quê),
  aprovadas em revisão e acompanhadas, quando aplicável, de um plano de migração.
- **Versionamento**: o número de versão segue versionamento semântico:
  - **MAJOR**: remoção ou redefinição incompatível de princípios ou de governança.
  - **MINOR**: adição de um novo princípio/seção ou expansão material de orientação.
  - **PATCH**: esclarecimentos, correções de redação e refinamentos não-semânticos.
- **Conformidade**: toda PR/revisão DEVE verificar aderência aos princípios; complexidade não
  justificada DEVE ser rejeitada ou simplificada. Orientações de desenvolvimento em tempo de
  execução residem no `CLAUDE.md` e na documentação do projeto.

**Version**: 1.0.0 | **Ratified**: 2026-06-29 | **Last Amended**: 2026-06-29
