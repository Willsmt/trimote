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

// Botão de WhatsApp (#53), reaproveitado nos dois pontos onde aparece (bloco incondicional e
// fallback de "agenda em preparação") pra não duplicar o SVG escrito à mão. Ícone decorativo
// (aria-hidden/focusable=false): o texto do link já identifica o destino pro leitor de tela.
function WhatsappButton({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={styles.btnFantasma}>
      <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
        <path d="M12.05 2C6.495 2 2 6.495 2 12.05c0 1.876.507 3.633 1.393 5.147L2.023 22l4.933-1.323A9.988 9.988 0 0 0 12.05 22.1c5.555 0 10.05-4.495 10.05-10.05C22.1 6.495 17.605 2 12.05 2zm0 18.323a8.243 8.243 0 0 1-4.204-1.158l-.301-.179-3.114.812.83-3.03-.197-.31a8.221 8.221 0 0 1-1.256-4.408c0-4.549 3.702-8.25 8.25-8.25 4.548 0 8.25 3.701 8.25 8.25 0 4.549-3.702 8.273-8.258 8.273z" />
      </svg>
      Falar no WhatsApp
    </a>
  );
}

// Botão "Como chegar" (#54): mesmo estilo/padrão do WhatsappButton, ícone de pin decorativo.
function ComoChegarButton({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={styles.btnFantasma}>
      <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
      </svg>
      Como chegar
    </a>
  );
}

// cache() do React deduplica dentro da MESMA request: generateMetadata e o componente da página
// chamam esta função com o mesmo slug e o Next reaproveita o resultado, evitando 2 queries.
const getBusinessBySlug = cache((slug: string) =>
  prisma.business.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      timezone: true,
      whatsapp: true,
      endereco: true,
      _count: { select: { openingHours: true } },
    },
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

  // Botão de WhatsApp (#53): incondicional, não gated por sessão — visível a qualquer visitante,
  // igual ao mockup. null quando o dono não preencheu o campo (#52); nenhum bloco renderiza.
  const whatsappHref = business.whatsapp
    ? `https://wa.me/${business.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(
        `Olá! Vim pela página de ${business.name} e queria falar com você.`,
      )}`
    : null;

  // Botão "Como chegar" (#54): busca por texto no Google Maps, sem geocoding — null quando o dono
  // não preencheu o endereço (#54); nenhum bloco renderiza.
  const comoChegarHref = business.endereco
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.endereco)}`
    : null;

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
          {(openingHoursLabel || business.endereco) && (
            <div className={styles.meta}>
              {openingHoursLabel && <span>{openingHoursLabel}</span>}
              {business.endereco && <span>{business.endereco}</span>}
            </div>
          )}
        </div>
      </div>
      <main className="mx-auto flex max-w-xl flex-col gap-6 p-8">
        {(whatsappHref || comoChegarHref) && (
          <div className={styles.acoesDono}>
            {whatsappHref && <WhatsappButton href={whatsappHref} />}
            {comoChegarHref && <ComoChegarButton href={comoChegarHref} />}
          </div>
        )}
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
          <>
            <p className="text-sm text-neutral-500">
              {business.name} está preparando a agenda. Volte em breve para marcar seu horário por aqui.
            </p>
            {whatsappHref && <WhatsappButton href={whatsappHref} />}
          </>
        )}
      </main>
    </>
  );
}
