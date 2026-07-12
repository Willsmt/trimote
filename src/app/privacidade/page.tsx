import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de Privacidade — Trimote",
  description:
    "Como o Trimote coleta, usa, armazena e protege seus dados pessoais, em conformidade com a LGPD.",
};

// Política de Privacidade (issue #36). Página PÚBLICA e estática: sem guarda de sessão (qualquer um
// pode ler) e sem dados dinâmicos, então renderiza como conteúdo estático. Conteúdo transcrito
// fielmente do texto oficial (11 seções) em JSX — nada de markdown/lib de markdown. Estilo espelha
// os tokens do app (paleta neutral, acento neutral-900, links emerald-700, max-w-3xl).

// Seção numerada: título como h2 com âncora, para caber links diretos e leitura no sumário.
function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="flex flex-col gap-3">
      <h2 className="text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

// Destaque (os blockquotes "Importante"/"Nota" do texto): aviso lateral, não é parágrafo comum.
function Callout({ children }: { children: React.ReactNode }) {
  return (
    <aside className="border-l-4 border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-700">
      {children}
    </aside>
  );
}

const linkClass = "text-emerald-700 underline";

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Política de Privacidade</h1>
        <p className="text-sm text-neutral-500">
          Última atualização: 12 de julho de 2026
        </p>
      </header>

      <div className="flex flex-col gap-4 text-neutral-800">
        <p>
          Esta Política de Privacidade explica como o <strong>Trimote</strong> (“nós”,
          “plataforma”), acessível em{" "}
          <a href="https://trimote.com.br" className={linkClass}>
            trimote.com.br
          </a>
          , coleta, usa, armazena e protege os dados pessoais de quem utiliza o serviço. Ela foi
          elaborada em conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei nº
          13.709/2018 — “LGPD”).
        </p>
        <p>Ao usar o Trimote, você declara ter lido e compreendido esta Política.</p>
      </div>

      <hr className="border-neutral-200" />

      <Section id="responsavel" title="1. Quem é o responsável pelos seus dados (Controlador)">
        <p>O responsável pelo tratamento dos dados pessoais coletados pela plataforma é:</p>
        <p>
          <strong>Willians Martins Silva de Gois</strong>, pessoa física, na qualidade de desenvolvedor e operador
          do Trimote.
          <br />
          <strong>Contato para assuntos de privacidade:</strong>{" "}
          <a href="mailto:willmarthins@gmail.com" className={linkClass}>
            willmarthins@gmail.com
          </a>
        </p>
        <p>
          Este é o canal oficial para dúvidas, solicitações e exercício de direitos relacionados aos
          seus dados pessoais, conforme descrito na seção 8.
        </p>
        <Callout>
          <strong>Importante sobre estabelecimentos parceiros:</strong> o Trimote é uma plataforma
          que barbearias e estabelecimentos usam para gerenciar seus agendamentos. Quando você
          agenda um horário, o estabelecimento escolhido também é responsável pelos seus dados (é o
          “controlador” daquela relação), e o Trimote atua como a ferramenta que operacionaliza o
          serviço. O estabelecimento vê os dados necessários para atendê-lo, conforme a seção 5.
        </Callout>
      </Section>

      <Section id="dados" title="2. Quais dados coletamos">
        <p>
          Coletamos apenas os dados necessários para o funcionamento do serviço de agendamento. São
          eles:
        </p>
        <p>
          <strong>Dados fornecidos pelo login com o Google.</strong> Ao entrar no Trimote com sua
          conta Google, recebemos do Google seu <strong>nome</strong>, seu{" "}
          <strong>endereço de e-mail</strong> e sua <strong>foto de perfil</strong>. Não temos
          acesso à sua senha do Google nem a outros dados da sua conta.
        </p>
        <p>
          <strong>Telefone / WhatsApp (opcional).</strong> Você pode, se quiser, informar seu número
          de celular/WhatsApp na sua página de perfil. Esse campo não é obrigatório para usar a
          plataforma.
        </p>
        <p>
          <strong>Dados de agendamento.</strong> Quando você marca um horário, registramos o serviço
          escolhido, a data e a hora, o estabelecimento e o status do agendamento (ativo, concluído,
          cancelado).
        </p>
        <p>
          <strong>Registros financeiros do estabelecimento.</strong> Os estabelecimentos usam o
          Trimote para registrar atendimentos e valores. Se você é cliente cadastrado, seus
          atendimentos podem ser vinculados ao seu cadastro. O estabelecimento também pode registrar
          atendimentos avulsos digitando apenas um nome de identificação, sem que a pessoa tenha
          conta na plataforma.
        </p>
        <p>
          <strong>Dados técnicos essenciais.</strong> Para manter você conectado com segurança,
          usamos cookies estritamente necessários (veja a seção 6). Não utilizamos ferramentas de
          rastreamento, publicidade ou análise de comportamento.
        </p>

        <h3 className="text-base font-semibold">Dados sensíveis</h3>
        <p>
          O Trimote <strong>não coleta dados pessoais sensíveis</strong> (como dados de saúde, origem
          racial, convicções religiosas, entre outros definidos no art. 5º, II, da LGPD). Os serviços
          registrados na plataforma são serviços de barbearia e estética capilar, sem informação de
          natureza sensível.
        </p>

        <h3 className="text-base font-semibold">Dados de crianças e adolescentes</h3>
        <p>
          O Trimote é destinado a maiores de 18 anos ou a menores devidamente assistidos por seus
          responsáveis. Não coletamos intencionalmente dados de crianças. Se um responsável
          identificar que uma criança forneceu dados sem consentimento, pode solicitar a exclusão
          pelo canal da seção 1.
        </p>
      </Section>

      <Section id="finalidades" title="3. Para que usamos seus dados (Finalidades)">
        <p>Usamos seus dados exclusivamente para:</p>
        <ul className="flex list-disc flex-col gap-2 pl-6">
          <li>
            <strong>Criar e manter sua conta</strong> e permitir seu acesso à plataforma;
          </li>
          <li>
            <strong>Realizar e gerenciar seus agendamentos</strong> com os estabelecimentos;
          </li>
          <li>
            <strong>Permitir que o estabelecimento entre em contato com você</strong> sobre o seu
            atendimento — por exemplo, confirmar, lembrar ou avisar sobre mudanças no horário (é para
            isso que serve o telefone/WhatsApp, quando informado);
          </li>
          <li>
            <strong>Manter os registros financeiros</strong> dos atendimentos, para o controle do
            próprio estabelecimento e para o cumprimento de obrigações legais e fiscais;
          </li>
          <li>
            <strong>Garantir a segurança</strong> da plataforma e prevenir fraudes.
          </li>
        </ul>
        <p>
          <strong>
            Não usamos seus dados para marketing, publicidade ou envio de promoções.
          </strong>{" "}
          Caso isso venha a mudar no futuro, pediremos seu consentimento específico e informaremos
          você antes.
        </p>
      </Section>

      <Section id="base-legal" title="4. Com que base legal tratamos seus dados">
        <p>
          A LGPD exige uma base legal para cada tratamento. As nossas são:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-neutral-100 text-left">
                <th className="border border-neutral-300 p-2">Dado / atividade</th>
                <th className="border border-neutral-300 p-2">Base legal (LGPD)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-neutral-300 p-2">
                  Nome, e-mail, foto (conta e login)
                </td>
                <td className="border border-neutral-300 p-2">Execução de contrato (art. 7º, V)</td>
              </tr>
              <tr>
                <td className="border border-neutral-300 p-2">Agendamentos</td>
                <td className="border border-neutral-300 p-2">Execução de contrato (art. 7º, V)</td>
              </tr>
              <tr>
                <td className="border border-neutral-300 p-2">
                  Telefone/WhatsApp para contato sobre o atendimento
                </td>
                <td className="border border-neutral-300 p-2">
                  Execução de contrato / legítimo interesse (art. 7º, V e IX)
                </td>
              </tr>
              <tr>
                <td className="border border-neutral-300 p-2">Registros financeiros</td>
                <td className="border border-neutral-300 p-2">
                  Cumprimento de obrigação legal (art. 7º, II) e legítimo interesse do
                  estabelecimento (art. 7º, IX)
                </td>
              </tr>
              <tr>
                <td className="border border-neutral-300 p-2">
                  Cookies essenciais de sessão e segurança
                </td>
                <td className="border border-neutral-300 p-2">
                  Legítimo interesse / execução de contrato (art. 7º, IX e V)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="compartilhamento" title="5. Com quem compartilhamos seus dados">
        <p>
          O Trimote <strong>não vende seus dados</strong> e não os compartilha com terceiros para
          fins de publicidade. Seus dados são acessados apenas por quem é necessário para o serviço
          funcionar:
        </p>
        <p>
          <strong>O estabelecimento onde você agenda.</strong> O estabelecimento (barbearia) vê os
          dados necessários para atendê-lo: seu nome, seus agendamentos e, se você informou, seu
          telefone/WhatsApp — para poder confirmar ou avisar sobre o seu horário. Um estabelecimento
          vê apenas os dados dos clientes que agendaram com ele.
        </p>
        <p>
          <strong>Prestadores de serviço que operam a plataforma (operadores).</strong> Para
          funcionar, o Trimote se apoia em serviços de tecnologia que processam dados sob nossas
          instruções:
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-6">
          <li>
            <strong>Neon</strong> — serviço de banco de dados onde suas informações ficam
            armazenadas. Os dados são hospedados em servidores localizados no{" "}
            <strong>Brasil (região de São Paulo)</strong>.
          </li>
          <li>
            <strong>Vercel</strong> — serviço de hospedagem que mantém a plataforma no ar.
          </li>
          <li>
            <strong>Google</strong> — usado exclusivamente para o login (autenticação) da sua conta.
          </li>
        </ul>
        <p>
          Alguns desses prestadores são empresas internacionais e podem realizar operações de
          processamento fora do Brasil (por exemplo, registros técnicos de funcionamento). O
          armazenamento principal dos seus dados permanece no Brasil.
        </p>
        <p>
          <strong>Autoridades públicas,</strong> quando exigido por lei, ordem judicial ou
          requisição de autoridade competente.
        </p>
      </Section>

      <Section id="cookies" title="6. Cookies">
        <p>
          O Trimote usa <strong>apenas cookies estritamente necessários</strong> para o
          funcionamento da plataforma. Eles servem para manter você conectado com segurança durante o
          uso e para proteger o login contra fraudes.
        </p>
        <p>
          <strong>
            Não usamos cookies de rastreamento, de publicidade ou de análise de comportamento.
          </strong>{" "}
          Por serem essenciais ao funcionamento do serviço, esses cookies não dependem do seu
          consentimento prévio, conforme o entendimento da ANPD — mas você tem direito à informação
          clara sobre eles, que é o propósito desta seção.
        </p>
        <p>Os cookies que utilizamos:</p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-neutral-100 text-left">
                <th className="border border-neutral-300 p-2">Cookie</th>
                <th className="border border-neutral-300 p-2">Finalidade</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-neutral-300 p-2">Cookie de sessão</td>
                <td className="border border-neutral-300 p-2">
                  Manter você conectado à sua conta
                </td>
              </tr>
              <tr>
                <td className="border border-neutral-300 p-2">Cookie de segurança (CSRF)</td>
                <td className="border border-neutral-300 p-2">
                  Proteger o login contra requisições fraudulentas
                </td>
              </tr>
              <tr>
                <td className="border border-neutral-300 p-2">
                  Cookies de autenticação (login Google)
                </td>
                <td className="border border-neutral-300 p-2">
                  Realizar o processo de login com segurança
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Esses cookies não armazenam dados pessoais no seu navegador além de um identificador seguro
          da sua sessão.
        </p>
      </Section>

      <Section id="retencao" title="7. Por quanto tempo guardamos seus dados">
        <p>
          Mantemos seus dados pessoais pelo tempo necessário para as finalidades desta Política:
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-6">
          <li>
            <strong>Dados de conta e agendamento:</strong> enquanto sua conta estiver ativa.
          </li>
          <li>
            <strong>Registros financeiros:</strong> pelo prazo necessário ao cumprimento de
            obrigações legais e fiscais (tipicamente 5 anos), que pode ser superior ao tempo de uso
            da conta.
          </li>
          <li>
            <strong>Dados de sessão (cookies):</strong> expiram automaticamente conforme descrito na
            seção 6.
          </li>
        </ul>
        <p>
          Quando os dados não forem mais necessários, serão eliminados ou anonimizados, ressalvadas
          as hipóteses de guarda obrigatória previstas em lei.
        </p>
      </Section>

      <Section id="direitos" title="8. Seus direitos">
        <p>A LGPD garante a você, como titular dos dados, o direito de:</p>
        <ul className="flex list-disc flex-col gap-2 pl-6">
          <li>
            <strong>Confirmar</strong> que tratamos seus dados e <strong>acessar</strong> os dados
            que temos sobre você;
          </li>
          <li>
            <strong>Corrigir</strong> dados incompletos, inexatos ou desatualizados;
          </li>
          <li>
            <strong>Solicitar a eliminação</strong> dos seus dados, quando aplicável;
          </li>
          <li>
            <strong>Solicitar informações</strong> sobre com quem compartilhamos seus dados;
          </li>
          <li>
            <strong>Revogar consentimento</strong>, quando o tratamento se basear nele;
          </li>
          <li>
            <strong>Se opor</strong> a um tratamento em determinadas situações.
          </li>
        </ul>
        <p>
          Você mesmo pode, a qualquer momento,{" "}
          <strong>atualizar ou remover seu telefone/WhatsApp</strong> diretamente na sua{" "}
          <Link href="/profile" className={linkClass}>
            página de perfil
          </Link>{" "}
          na plataforma.
        </p>
        <p>
          Para exercer qualquer um desses direitos, escreva para{" "}
          <a href="mailto:willmarthins@gmail.com" className={linkClass}>
            willmarthins@gmail.com
          </a>
          . Responderemos no menor prazo possível.
        </p>
        <Callout>
          <strong>Nota sobre exclusão de conta:</strong> atualmente, a exclusão completa da conta e
          dos dados associados é feita mediante solicitação pelo e-mail acima, de forma manual.
          Alguns registros — como lançamentos financeiros com retenção fiscal obrigatória — podem
          precisar ser mantidos ou anonimizados em vez de apagados, para cumprir a lei.
        </Callout>
      </Section>

      <Section id="seguranca" title="9. Segurança dos dados">
        <p>
          Adotamos medidas técnicas para proteger seus dados, incluindo: conexões criptografadas
          (HTTPS), cookies de sessão protegidos (HttpOnly e Secure), controle de acesso de forma que
          cada estabelecimento veja apenas os dados dos seus próprios clientes, e armazenamento em
          provedor de banco de dados no Brasil. Nenhum sistema é totalmente imune a riscos, mas
          trabalhamos para reduzi-los continuamente.
        </p>
      </Section>

      <Section id="alteracoes" title="10. Alterações nesta Política">
        <p>
          Podemos atualizar esta Política periodicamente. A data da última atualização está no topo
          do documento. Mudanças relevantes serão comunicadas pelos meios disponíveis na plataforma.
        </p>
      </Section>

      <Section id="contato" title="11. Contato">
        <p>Dúvidas sobre esta Política ou sobre o tratamento dos seus dados:</p>
        <p>
          <strong>Willians Martins Silva de Gois</strong> —{" "}
          <a href="mailto:willmarthins@gmail.com" className={linkClass}>
            willmarthins@gmail.com
          </a>
        </p>
      </Section>

      <hr className="border-neutral-200" />

      <p className="text-sm italic text-neutral-500">
        Esta Política reflete o funcionamento do Trimote na data da última atualização. O serviço
        está em desenvolvimento; caso funcionalidades que alterem o tratamento de dados sejam
        adicionadas, esta Política será revista.
      </p>
    </main>
  );
}
