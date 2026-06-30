import Link from "next/link";

import { listServices } from "@/server/actions/list-services";

// Renderizada por requisição (dados sempre atuais; sem acesso ao banco em build).
export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const services = await listServices();
  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-2xl font-bold">Serviços</h1>
        <p className="text-sm text-neutral-500">Conheça os serviços oferecidos pela barbearia.</p>
      </header>

      {services.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhum serviço cadastrado.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {services.map((service) => (
            <li
              key={service.id}
              className="flex items-center justify-between rounded border border-neutral-300 p-3"
            >
              <div>
                <p className="font-medium">{service.name}</p>
                <p className="text-sm text-neutral-500">{service.durationMinutes} min</p>
              </div>
              <span className="font-medium">{currency.format(Number(service.price))}</span>
            </li>
          ))}
        </ul>
      )}

      <Link href="/booking" className="text-sm font-medium underline">
        Agendar um serviço
      </Link>
    </main>
  );
}
