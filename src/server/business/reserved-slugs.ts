// Fonte ÚNICA da validação de slug (F007, Clarify #3 / research D7). Importada pelo core de criação
// de negócio (admin-create-business), pelos testes de slug e referenciada pela migração de backfill.
// Um slug é a porta pública /b/[slug]; não pode colidir com rotas do app.

/** Rotas do app que NÃO podem virar slug de negócio. */
export const RESERVED_SLUGS: readonly string[] = [
  "admin",
  "api",
  "b",
  "booking",
  "owner",
  "login",
  "my-bookings",
  "my-spending",
];

/** Formato URL-safe (kebab-case): minúsculas/dígitos separados por hífen único. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Deriva um slug kebab-case a partir de um nome: sem acentos, minúsculo, hífen entre grupos. */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove diacríticos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isValidSlugFormat(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.includes(slug);
}
