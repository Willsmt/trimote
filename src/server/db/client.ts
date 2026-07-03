import { Prisma, PrismaClient } from "@prisma/client";

// Singleton do Prisma Client — evita múltiplas conexões em hot-reload no desenvolvimento.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Remove o "detail" do Postgres (pode conter ids, horários ou dados sensíveis) e limita o tamanho,
// garantindo que o log nunca vaze dado sensível (Princípio I).
function sanitizeDbError(message: string): string {
  return message
    .split(/\bdetail\b/i)[0]
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    // Logging por evento (não imprime automaticamente) para podermos filtrar e sanitizar.
    log: [{ emit: "event", level: "error" }],
  });

  client.$on("error", (event: Prisma.LogEvent) => {
    const message = event.message ?? "";
    // A violação da exclusion constraint é um evento de negócio ESPERADO (horário já ocupado),
    // tratado e traduzido em createBookingForUser — não deve poluir o log de erros.
    if (message.includes("booking_no_overlap") || message.includes("23P01")) {
      return;
    }
    // Conflito de nome entre serviços ATIVOS (feature 002) — também esperado, traduzido em
    // name_taken. O Prisma mapeia o índice parcial para P2002 sem expor o nome do índice, então
    // filtramos por operação + campo. NÃO silencia outras unique violations: e-mail duplicado, por
    // exemplo, tem target "user.*" e fields (`email`). Cobre create e update de Service.
    const target = String(event.target ?? "");
    if (
      target.startsWith("service.") &&
      message.includes("Unique constraint failed on the fields: (`name`)")
    ) {
      return;
    }
    console.error(`[prisma] ${sanitizeDbError(message)}`);
  });

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
