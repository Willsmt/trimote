<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at specs/007-multi-tenancy/plan.md
<!-- SPECKIT END -->

## Regras sempre ativas

- Grep nesta sessão passa pelo hook rtk (semântica ripgrep): ignora dotfiles e arquivos gitignorados por padrão, sem avisar. Grep vazio NÃO é evidência de ausência — é evidência de ausência nos arquivos visíveis. Para auditoria (segredo hardcoded, credencial, config), usar rtk proxy grep -rn ... ou flags de hidden/no-ignore, e dizer no report qual variante foi usada. Medido em 17/07: grep de DATABASE_URL_NEON_TEST retornou vazio com o .env.neon-prod intacto no disco.
- Rastreamento/analytics exige reavaliar LGPD ANTES do merge. O Trimote seta apenas cookies essenciais (NextAuth; auditado 2026-07-11, zero rastreamento). Adicionar Vercel Analytics, Speed Insights, GA, Meta Pixel ou qualquer script de terceiro que colete comportamento muda essa classificação e exige atualizar Política de Privacidade + aviso de cookies ANTES de mergear. Ligar Web Analytics no dashboard da Vercel conta como adicionar rastreamento.

## Convenções

- Conventional Commits (commitlint ativo). Branch de issue `NNN-nome` criada ANTES do primeiro commit; merge via `--no-ff`. Código em inglês, docs/comentários em português. README atualizado a cada feature ou dependência nova.

## Arquitetura de contexto

- Regras específicas por área vivem em `.claude/skills/trimote-*` e são carregadas sob demanda pelo gatilho de cada skill. Ao criar regra nova, prefira adicioná-la à skill do domínio correspondente (ou criar uma nova) em vez de inflar este arquivo.
- Histórico curado das features: `specs/feature-history.md` (consulta sob demanda, não carregado em contexto).
- Governança formal: `.specify/memory/constitution.md` (prevalece sobre tudo).
