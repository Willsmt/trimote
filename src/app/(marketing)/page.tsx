import type { Metadata } from "next";
import Link from "next/link";

import styles from "@/components/landing/landing.module.css";
import { ScrollReveal } from "@/components/landing/scroll-reveal";
import { BalanceCounter } from "@/components/landing/balance-counter";
import { BookingDemo } from "@/components/landing/booking-demo";
import { WhatsappFab } from "@/components/landing/whatsapp-fab";
import { LandingNav } from "@/components/landing/landing-nav";

// Landing pública de venda (issue #38), portada de specs/landing/trimote-landing-completa.html.
// Server component: quase tudo é estático (SSR = bom p/ SEO e no-JS); só o reveal, o contador do
// saldo e a demo de agendamento são ilhas client. Tema escuro/Fraunces vêm do layout (marketing).

// Destino único dos CTAs "Agendar uma conversa". Número em E.164 sem o "+" (formato wa.me):
// 55 (Brasil) + 11 (DDD) + 956697013.
const WHATSAPP_NUMERO = "5511956697013";
const WHATSAPP_MENSAGEM = "Olá! Quero conhecer o Trimote para o meu negócio.";
const whatsappHref = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(WHATSAPP_MENSAGEM)}`;

export const metadata: Metadata = {
  title: "Trimote — Agenda e caixa do seu negócio num lugar só",
  description:
    "O cliente agenda sozinho pelo seu link; cada atendimento já entra no caixa do dia. Menos WhatsApp e caderno, mais dia sob controle.",
};

export default function LandingPage() {
  return (
    <>
      {/* Nav FORA do `.cena` (irmã das seções, filha direta do shell da landing): position:sticky só
          gruda dentro do próprio pai, então dentro do `.cena` (nav+hero) ela soltava ao fim do hero.
          Como filha de `.root`, o pai é a página inteira e a nav acompanha todo o scroll. */}
      <LandingNav whatsappHref={whatsappHref} />
      <div className={styles.cena}>
        <header className={styles.hero}>
          <div className={`${styles.wrap} ${styles.heroGrid}`}>
            <div>
              <span className={`${styles.eyebrow} ${styles.rise} ${styles.d1}`}>
                <span className={styles.pip} aria-hidden="true" /> Agenda e caixa, num lugar só
              </span>
              <h1 className={`${styles.rise} ${styles.d2}`}>
                O cliente agenda sozinho.
                <br />
                Você cuida do resto.
              </h1>
              <p className={`${styles.sub} ${styles.rise} ${styles.d3}`}>
                O Trimote junta a agenda e o caixa do seu negócio num lugar só. Você manda o link, o
                cliente escolhe o horário livre, e cada atendimento já entra no financeiro do dia.
              </p>
              <div className={`${styles.heroCtas} ${styles.rise} ${styles.d4}`}>
                <a href={whatsappHref} className={`${styles.btn} ${styles.btnPrimario} ${styles.btnLg}`}>
                  Agendar uma conversa
                </a>
                <Link
                  href="/b/trimote-barbearia"
                  className={`${styles.btn} ${styles.btnSecundario} ${styles.btnLg}`}
                >
                  Ver uma página de exemplo
                </Link>
              </div>
            </div>
            <div className={styles.palco}>
              <div className={styles.mock}>
                <div className={styles.mockTop}>
                  <span className={styles.fraunces}>Hoje</span>
                  <span className={styles.badgeOuro}>7 atendimentos</span>
                </div>
                <div className={`${styles.linha} ${styles.l1}`}>
                  <div>
                    <div className={styles.desc}>Corte + barba</div>
                    <div className={styles.meta}>10:30 · Marcos</div>
                  </div>
                  <span className={`${styles.valor} ${styles.entrada}`}>+ R$ 55,00</span>
                </div>
                <div className={`${styles.linha} ${styles.l2}`}>
                  <div>
                    <div className={styles.desc}>Corte</div>
                    <div className={styles.meta}>11:15 · João</div>
                  </div>
                  <span className={`${styles.valor} ${styles.entrada}`}>+ R$ 35,00</span>
                </div>
                <div className={`${styles.linha} ${styles.l3}`}>
                  <div>
                    <div className={styles.desc}>Lâminas (reposição)</div>
                    <div className={styles.meta}>12:02 · despesa</div>
                  </div>
                  <span className={`${styles.valor} ${styles.saida}`}>− R$ 42,90</span>
                </div>
                <div className={styles.mockTotal}>
                  <span className={styles.label}>Saldo do dia</span>
                  <BalanceCounter />
                </div>
              </div>
              <div className={styles.toast} aria-hidden="true">
                <div className={styles.check}>✓</div>
                <div>
                  <div className={styles.tTit}>Agendamento confirmado</div>
                  <div className={styles.tSub}>Sexta, 14:00 · pelo link</div>
                </div>
              </div>
            </div>
          </div>
        </header>
      </div>

      <div className={styles.trust}>
        <div className={`${styles.wrap} ${styles.trustIn}`}>
          <div className={styles.trustItem} data-reveal data-reveal-step="1">
            <span className={styles.tick}>✓</span> Dados no Brasil
          </div>
          <div className={styles.trustItem} data-reveal data-reveal-step="2">
            <span className={styles.tick}>✓</span> Política de privacidade pública
          </div>
          <div className={styles.trustItem} data-reveal data-reveal-step="3">
            <span className={styles.tick}>✓</span> Zero rastreamento
          </div>
        </div>
      </div>

      <section className={styles.bloco} id="como">
        <div className={styles.wrap}>
          <div className={styles.cabeca} data-reveal>
            <span className={styles.eyebrow}>O que você ganha</span>
            <h2>Menos WhatsApp e caderno. Mais dia sob controle.</h2>
            <p>Três coisas resolvidas de uma vez: o cliente agenda, o dia se organiza, o caixa se fecha.</p>
          </div>
          <div className={styles.features}>
            <div className={`${styles.card} ${styles.wide}`} data-reveal data-reveal-step="1">
              <div className={styles.ic} aria-hidden="true">
                ◷
              </div>
              <h3>O cliente agenda sozinho</h3>
              <p>
                Sua página com seus serviços e horários. Manda o link ou o QR; o cliente escolhe o
                horário livre e pronto. Menos WhatsApp, menos caderno, sem você no meio de cada
                marcação.
              </p>
            </div>
            <div className={styles.card} data-reveal data-reveal-step="2">
              <div className={styles.ic} aria-hidden="true">
                ▤
              </div>
              <h3>O dia inteiro num lugar</h3>
              <p>Quem vem, a que horas, por qual serviço. Confirma, cancela e remarca sem trocar de tela.</p>
            </div>
            <div className={styles.card} data-reveal data-reveal-step="3">
              <div className={styles.ic} aria-hidden="true">
                ▦
              </div>
              <h3>O caixa se fecha sozinho</h3>
              <p>
                Cada atendimento vira entrada. Lance despesas e veja o saldo do dia na hora, sem
                planilha no fim do expediente.
              </p>
            </div>
            <div className={styles.card} data-reveal data-reveal-step="4">
              <div className={styles.ic} aria-hidden="true">
                ⊘
              </div>
              <h3>Dois clientes nunca no mesmo horário</h3>
              <p>O sistema recusa choque de horário na origem. Overbooking não acontece.</p>
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.bloco} ${styles.blocoContinua}`} id="demo">
        <div className={`${styles.wrap} ${styles.demoGrid}`}>
          <div className={styles.demoTxt} data-reveal data-reveal-step="1">
            <span className={styles.eyebrow}>Do lado do cliente</span>
            <h2>É assim que seu cliente agenda.</h2>
            <p>
              Sem app, sem cadastro complicado, sem esperar você responder. Ele abre o link, escolhe o
              horário e confirma. Experimente aqui do lado.
            </p>
            <div className={styles.nota}>
              <span className={styles.notaPip} aria-hidden="true" /> <b>Clicável</b> — escolha um
              horário e confirme.
            </div>
          </div>
          <div className={styles.painel} data-reveal data-reveal-step="2">
            <BookingDemo />
          </div>
        </div>
      </section>

      <section className={`${styles.bloco} ${styles.blocoContinua}`}>
        <div className={styles.wrap}>
          <div className={styles.cabeca} data-reveal style={{ maxWidth: 560 }}>
            <span className={styles.eyebrow}>A diferença no dia a dia</span>
            <h2>Como é hoje. Como fica.</h2>
          </div>
          <div className={styles.compara}>
            <div className={styles.col} data-reveal data-reveal-step="1">
              <div className={styles.colTitulo}>Hoje</div>
              <ul>
                <li>
                  <span className={styles.m}>·</span> WhatsApp o dia todo pra marcar horário
                </li>
                <li>
                  <span className={styles.m}>·</span> Caderno ou planilha pra lembrar quem vem
                </li>
                <li>
                  <span className={styles.m}>·</span> Caixa só no fim do mês, no chute
                </li>
                <li>
                  <span className={styles.m}>·</span> Horário marcado em dobro sem perceber
                </li>
              </ul>
            </div>
            <div className={styles.seta} data-reveal data-reveal-step="2" aria-hidden="true">
              →
            </div>
            <div className={`${styles.col} ${styles.colDepois}`} data-reveal data-reveal-step="3">
              <div className={styles.colTitulo}>Com Trimote</div>
              <ul>
                <li>
                  <span className={styles.m}>✓</span> Cliente agenda sozinho pelo link
                </li>
                <li>
                  <span className={styles.m}>✓</span> O dia inteiro numa tela só
                </li>
                <li>
                  <span className={styles.m}>✓</span> Saldo do dia na hora, sem planilha
                </li>
                <li>
                  <span className={styles.m}>✓</span> Choque de horário bloqueado na origem
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.bloco} ${styles.blocoContinua}`}>
        <div className={`${styles.wrap} ${styles.criador}`} data-reveal>
          <blockquote>
            &ldquo;Você fala direto com quem construiu. Não tem call center nem robô. Eu configuro seu
            negócio com você e ajusto o que precisar.&rdquo;
          </blockquote>
          <div className={styles.assina}>
            — <b>Willians</b>, criador do Trimote
          </div>
        </div>
      </section>

      <section className={`${styles.bloco} ${styles.blocoContinua}`} id="contato">
        <div className={styles.wrap}>
          <div className={styles.ctaFinal} data-reveal>
            <h2>Pronto pra parar de gerenciar tudo no WhatsApp?</h2>
            <p>Agende uma conversa e eu mostro o Trimote rodando no seu negócio.</p>
            <a href={whatsappHref} className={`${styles.btn} ${styles.btnPrimario} ${styles.btnLg}`}>
              Agendar uma conversa
            </a>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={`${styles.wrap} ${styles.footIn}`}>
          <div className={styles.logo} style={{ fontSize: 18 }}>
            trimote<span className={styles.dot}>.</span>
          </div>
          <div className={styles.footLinks}>
            <a href="#como">Como funciona</a>
            <Link href="/privacidade">Privacidade</Link>
            <a href="#contato">Contato</a>
          </div>
          <div className={styles.footCopy}>© 2026 Trimote</div>
        </div>
      </footer>

      <ScrollReveal />
      <WhatsappFab href={whatsappHref} />

      {/* Fallback sem JS: o reveal esconde [data-reveal] até o IntersectionObserver marcar data-visto.
          Sem JS o observer nunca roda, então forçamos visibilidade. Só afeta a landing (só ela emite
          [data-reveal]). */}
      <noscript>
        <style>{"[data-reveal]{opacity:1 !important;transform:none !important}"}</style>
      </noscript>
    </>
  );
}
