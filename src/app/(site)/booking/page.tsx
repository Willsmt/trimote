import { permanentRedirect } from "next/navigation";

// F007 (US4/R2): agendar só existe no contexto de um negócio (/b/[slug]). A rota global /booking
// (herança da instalação única) redireciona permanentemente para a home — não lista serviços de
// nenhum negócio (anti-vazamento). Descoberta é pelo slug do negócio.
export default function BookingPage() {
  permanentRedirect("/");
}
