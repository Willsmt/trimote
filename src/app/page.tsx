// Landing pública (007, fix do smoke T044/BUG 2). Pós-T036a não há mais catálogo/rota global de
// agendamento: o acesso a cada barbearia é pelo link/QR próprio dela (/b/[slug]). A home NÃO lista
// negócios (não é marketplace — fora do escopo F007) e NÃO linka para rotas removidas (/services,
// /booking); só orienta o cliente sobre como chegar até a barbearia.
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-2xl font-bold">Trimote</h1>
      <p className="text-neutral-600">Agendamento online de barbearia</p>
      <p className="text-sm text-neutral-500">
        O acesso a cada barbearia é pelo link ou QR code da própria barbearia. Peça o endereço de
        agendamento ao seu barbeiro.
      </p>
    </main>
  );
}
