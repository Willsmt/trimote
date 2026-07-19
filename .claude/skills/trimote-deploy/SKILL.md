---
name: trimote-deploy
description: Aplicar SEMPRE que mexer em deploy, Vercel, Neon, variáveis de ambiente, NextAuth/OAuth config, ou no script de build.
---

# Deploy e ambientes

- O `migrate deploy` roda DENTRO do script build (antes do next build) e o sitemap consulta o banco na static generation. Neon inacessível = deploy BLOQUEADO (a Vercel não promove build quebrado; o deploy anterior segue servindo). Isso é desenho fail-closed, NÃO dívida — não "consertar" com fail-open sem decisão explícita.
- Preview compartilha DATABASE_URL e NEXTAUTH_SECRET com Production. NÃO adicionar URL de Preview (*.vercel.app) às Authorized redirect URIs do Google: o redirect_uri_mismatch atual é o ÚNICO fail-closed impedindo sessão de preview de escrever no banco de produção, e vive FORA do repo (console do Google). Se um dia precisar de login em Preview: primeiro desacoplar o banco (Neon branch + NEXTAUTH_SECRET próprio no environment Preview), só depois registrar a URI. Nunca ao contrário.
- Deployment Protection da Vercel está DESLIGADA (medido) — não contar com ela como barreira.
