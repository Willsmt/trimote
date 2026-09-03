import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/server/db/client";
import { listServicesForBusiness } from "@/server/actions/list-services";
import { getAvailableSlots } from "@/server/actions/get-available-slots";
import { getCurrentUser } from "@/server/auth/session";
import { todayInZone, formatOpeningHours } from "@/domain/time";
import { BookingFlow } from "@/components/booking-flow";
import { SignInButton } from "@/components/auth-buttons";
import { listOpeningHoursPublic } from "@/server/actions/list-opening-hours-public";
import styles from "../../public-page.module.css";

export const dynamic = "force-dynamic";

// Paleta de fallback de capa (specs/landing/CONSTITUICAO-VISUAL.md, seção "Paleta de capa"):
// escolha determinística por hash do slug — o mesmo negócio sempre cai na mesma cor. Algoritmo
// portado exatamente do mockup (specs/public-page/trimote-pagina-publica-mockup.html).
const CAPA_CORES = ["tekhelet", "noite", "tinta", "carmesim", "mata", "bronze"] as const;

function corDoSlug(slug: string): (typeof CAPA_CORES)[number] {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return CAPA_CORES[hash % CAPA_CORES.length];
}

// Iniciais do negócio pra capa sem foto (Camada 2 adiciona upload). Mesmas regras do mockup: até
// duas palavras com mais de 2 caracteres (ignora "de", "do", "da" etc.), primeira letra de cada.
function iniciaisDe(nome: string): string {
  const palavras = nome
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 2);
  return palavras
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

// cache() do React deduplica dentro da MESMA request: generateMetadata e o componente da página
// chamam esta função com o mesmo slug e o Next reaproveita o resultado, evitando 2 queries.
const getBusinessBySlug = cache((slug: string) =>
  prisma.business.findUnique({
    where: { slug },
    select: { id: true, name: true, timezone: true, _count: { select: { openingHours: true } } },
  }),
);

// Título da aba reflete o negócio (antes ficava com o "Trimote" genérico do layout raiz). Sem
// notFound() aqui: o componente da página já trata o 404 real; um fallback genérico basta.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const business = await getBusinessBySlug(slug);
  if (!business) {
    return { title: "Agendamento" };
  }
  return { title: `${business.name} — agendamento` };
}

// Página pública do negócio por slug (007, US4). Porta de entrada do cliente (QR/Instagram): mostra os
// serviços DAQUELE negócio e agenda nele (o serviço carrega o businessId). Slug inválido → 404 tratado.
export default async function BusinessPublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  // Retorno pós-login: dica de UI para restaurar o slot pretendido (revalidada abaixo, nunca confiada).
  searchParams: Promise<{ serviceId?: string; startsAt?: string }>;
}) {
  const { slug } = await params;
  const business = await getBusinessBySlug(slug);
  if (!business) notFound();

  const services = await listServicesForBusiness(business.id);
  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const serviceOptions = services.map((s) => ({
    id: s.id,
    name: s.name,
    priceLabel: currency.format(Number(s.price)),
    durationMinutes: s.durationMinutes,
  }));

  // Negócio recém-criado (issue #12): sem serviço ativo ou sem expediente, a agenda ainda não opera.
  // Sem expediente o BookingFlow mostraria "Nenhum horário livre nesse dia." em TODO dia — parece
  // agenda lotada, quando o negócio nunca abre. Mensagem contextual no lugar, nunca o fluxo enganoso.
  const isReadyForBooking = serviceOptions.length > 0 && business._count.openingHours > 0;

  // Expediente formatado pra capa (#50): leitura pública, sem gate — o cliente vê o horário de
  // funcionamento antes mesmo de escolher um serviço.
  const openingHours = await listOpeningHoursPublic(business.id);
  const openingHoursLabel = formatOpeningHours(openingHours);

  // Gate de login: a página continua PÚBLICA (visitante navega os slots). Lemos a sessão UMA vez só
  // para decidir o comportamento do CLIQUE no cliente. Escopo mínimo — um booleano, nunca dados da sessão.
  const isAuthenticated = Boolean(await getCurrentUser());

  // Restauração pós-login (dica de UI, NUNCA fonte de verdade): se o callbackUrl trouxe serviceId +
  // startsAt, REVALIDAMOS no servidor — o serviço tem de ser DESTE negócio e o slot tem de continuar
  // livre AGORA. O que decide o agendamento continua sendo requireUser + a constraint na mutação.
  const { serviceId: rawServiceId, startsAt: rawStartsAt } = await searchParams;
  let restored: { serviceId: string; date: string; startsAt: string } | undefined;
  let restoreError = false;
  if (isReadyForBooking && rawServiceId && rawStartsAt) {
    const belongsToBusiness = serviceOptions.some((s) => s.id === rawServiceId);
    const startInstant = new Date(rawStartsAt);
    const validInstant = !Number.isNaN(startInstant.getTime());
    if (belongsToBusiness && validInstant) {
      const date = todayInZone(startInstant, business.timezone);
      const availability = await getAvailableSlots({ serviceId: rawServiceId, date });
      if (availability.ok && availability.slots.includes(startInstant.toISOString())) {
        restored = { serviceId: rawServiceId, date, startsAt: startInstant.toISOString() };
      } else {
        // Slot sumiu no round-trip do OAuth (ou serviço inativou): cai no fluxo normal com aviso.
        restoreError = true;
      }
    } else {
      restoreError = true;
    }
  }

  return (
    <>
      <div className={styles.capa} data-cor={corDoSlug(slug)}>
        <div className={styles.capaIniciais}>{iniciaisDe(business.name)}</div>
        <div className={styles.capaVeu} />
        <div style={{ position: "absolute", inset: 0, zIndex: 4 }}>
          <div className={styles.conta}>
            {isAuthenticated ? (
              <>
                <Link href="/my-bookings">Meus agendamentos</Link>
                <Link href="/my-spending">Meus gastos</Link>
                <Link href="/profile">Perfil</Link>
              </>
            ) : (
              <SignInButton className={styles.entrar} />
            )}
          </div>
        </div>
        <div className={styles.capaIn}>
          <h1 className={styles.fraunces}>{business.name}</h1>
          {openingHoursLabel && <div className={styles.meta}>{openingHoursLabel}</div>}
        </div>
      </div>
      <main className="mx-auto flex max-w-xl flex-col gap-6 p-8">
        <p className="text-sm text-neutral-500">
          {isReadyForBooking
            ? "Escolha um serviço, um dia e um horário livre."
            : "Agenda em preparação."}
        </p>
        {isReadyForBooking ? (
          <BookingFlow
            services={serviceOptions}
            slug={slug}
            isAuthenticated={isAuthenticated}
            restored={restored}
            restoreError={restoreError}
          />
        ) : (
          <p className="text-sm text-neutral-500">
            {business.name} está preparando a agenda. Volte em breve para marcar seu horário por aqui.
          </p>
        )}
      </main>
    </>
  );
}
