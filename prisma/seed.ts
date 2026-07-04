import "dotenv/config";

import { PrismaClient, Prisma } from "@prisma/client";

// Dados pré-cadastrados do MVP (sem painel do dono — escopo). Idempotente via ids fixos.
const prisma = new PrismaClient();

const BUSINESS_ID = "business-trimote";

// Expediente: segunda a sábado, 09:00–18:00 (em minutos desde a meia-noite, hora local).
// Domingo (weekday 0) fica sem linha => fechado.
const OPENING_HOURS = [1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  opensAtMinutes: 9 * 60,
  closesAtMinutes: 18 * 60,
}));

const SERVICES = [
  { id: "service-corte", name: "Corte", price: "40.00", durationMinutes: 30 },
  { id: "service-barba", name: "Barba", price: "30.00", durationMinutes: 30 },
  { id: "service-corte-barba", name: "Corte + Barba", price: "65.00", durationMinutes: 60 },
];

async function main() {
  await prisma.business.upsert({
    where: { id: BUSINESS_ID },
    update: { name: "Trimote Barbearia" },
    create: {
      id: BUSINESS_ID,
      name: "Trimote Barbearia",
      // F007: slug da porta publica /b/[slug]. Imutavel pela UI (nao atualizado no update).
      slug: "trimote-barbearia",
      timezone: "America/Sao_Paulo",
    },
  });

  for (const oh of OPENING_HOURS) {
    await prisma.openingHours.upsert({
      where: { businessId_weekday: { businessId: BUSINESS_ID, weekday: oh.weekday } },
      update: { opensAtMinutes: oh.opensAtMinutes, closesAtMinutes: oh.closesAtMinutes },
      create: { businessId: BUSINESS_ID, ...oh },
    });
  }

  for (const s of SERVICES) {
    await prisma.service.upsert({
      where: { id: s.id },
      update: {
        name: s.name,
        price: new Prisma.Decimal(s.price),
        durationMinutes: s.durationMinutes,
      },
      create: {
        id: s.id,
        businessId: BUSINESS_ID,
        name: s.name,
        price: new Prisma.Decimal(s.price),
        durationMinutes: s.durationMinutes,
      },
    });
  }

  // Bootstrap do 1o ADMIN (F007, FR-020/FR-022): a UNICA elevação feita fora da plataforma. Promove o
  // operador (OWNER_EMAIL) a Role.ADMIN e o vincula como dono (BusinessMember OWNER) do negócio
  // showroom. Idempotente. A partir daqui, toda administração é via /admin.
  const ownerEmail = process.env.OWNER_EMAIL;
  if (ownerEmail) {
    const operator = await prisma.user.upsert({
      where: { email: ownerEmail },
      update: { role: "ADMIN" },
      create: { email: ownerEmail, role: "ADMIN" },
    });
    await prisma.businessMember.upsert({
      where: { userId_businessId: { userId: operator.id, businessId: BUSINESS_ID } },
      update: {},
      create: { userId: operator.id, businessId: BUSINESS_ID, role: "OWNER", createdBy: operator.id },
    });
    console.log(`Seed concluído: negócio showroom, expediente, serviços; ADMIN + dono (${ownerEmail}).`);
  } else {
    console.log(
      "Seed concluído: negócio, expediente e serviços. (OWNER_EMAIL não definido — nenhum ADMIN/dono.)",
    );
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    await prisma.$disconnect();
    process.exit(1);
  });
