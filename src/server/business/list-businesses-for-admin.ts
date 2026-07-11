import { prisma } from "@/server/db/client";

/**
 * Listagem de negocios para a area ADMIN (issue #14). LEITURA PURA. Cada negocio traz seus DONOS
 * (nome + email) para o ADMIN saber quem e dono do que.
 *
 * Autorizacao: e poder de PLATAFORMA — a pagina chama `requireAdmin` antes de usar este core, entao
 * NAO ha escopo por businessId (diferente do OWNER); o ADMIN ve donos de qualquer negocio (OK).
 *
 * Filtro `role: "OWNER"`: so donos entram na lista. Hoje `BusinessRole` so tem OWNER, mas o filtro
 * deixa correto e a prova de futuro — se um STAFF for adicionado ao enum, a tela NAO passa a listar
 * staff como dono. Select minimo: apenas nome + email do usuario dono, nada alem.
 */

export interface AdminBusinessOwner {
  // Id do BusinessMember (não do User): identifica o vínculo a remover sem ambiguidade, casando com o
  // contrato do core removeOwnerForAdmin (a UI manda membershipId, nunca email).
  membershipId: string;
  name: string | null;
  email: string | null;
}

export interface AdminBusinessItem {
  id: string;
  name: string;
  slug: string;
  owners: AdminBusinessOwner[];
}

export async function listBusinessesForAdmin(): Promise<AdminBusinessItem[]> {
  const businesses = await prisma.business.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      members: {
        where: { role: "OWNER" },
        select: { id: true, user: { select: { name: true, email: true } } },
        orderBy: { user: { email: "asc" } },
      },
    },
  });

  return businesses.map((b) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
    owners: b.members.map((m) => ({ membershipId: m.id, name: m.user.name, email: m.user.email })),
  }));
}
