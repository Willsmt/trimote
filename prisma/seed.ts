import "dotenv/config";

import { PrismaClient, Prisma } from "@prisma/client";

// Dados pré-cadastrados do MVP (sem painel do dono — escopo). Idempotente via ids fixos.
const prisma = new PrismaClient();

const BARBERSHOP_ID = "barbershop-trimote";

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
  await prisma.barbershop.upsert({
    where: { id: BARBERSHOP_ID },
    update: { name: "Trimote Barbearia" },
    create: {
      id: BARBERSHOP_ID,
      name: "Trimote Barbearia",
      timezone: "America/Sao_Paulo",
    },
  });

  for (const oh of OPENING_HOURS) {
    await prisma.openingHours.upsert({
      where: { barbershopId_weekday: { barbershopId: BARBERSHOP_ID, weekday: oh.weekday } },
      update: { opensAtMinutes: oh.opensAtMinutes, closesAtMinutes: oh.closesAtMinutes },
      create: { barbershopId: BARBERSHOP_ID, ...oh },
    });
  }

  for (const s of SERVICES) {
    await prisma.barbershopService.upsert({
      where: { id: s.id },
      update: {
        name: s.name,
        price: new Prisma.Decimal(s.price),
        durationMinutes: s.durationMinutes,
      },
      create: {
        id: s.id,
        barbershopId: BARBERSHOP_ID,
        name: s.name,
        price: new Prisma.Decimal(s.price),
        durationMinutes: s.durationMinutes,
      },
    });
  }

  // Painel do dono (feature 002): promove (ou cria) o usuário OWNER a partir de OWNER_EMAIL (FR-001a).
  // Idempotente: se já existe um User com esse e-mail (ex.: criado pelo login Google), apenas define
  // role = OWNER; senão, cria um placeholder que o login real depois casa por e-mail. Sem UI de gestão.
  const ownerEmail = process.env.OWNER_EMAIL;
  if (ownerEmail) {
    await prisma.user.upsert({
      where: { email: ownerEmail },
      update: { role: "OWNER" },
      create: { email: ownerEmail, role: "OWNER" },
    });
    console.log(`Seed concluído: barbearia, expediente, serviços e OWNER (${ownerEmail}).`);
  } else {
    console.log(
      "Seed concluído: barbearia, expediente e serviços. (OWNER_EMAIL não definido — nenhum OWNER promovido.)",
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
