"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { switchBusiness } from "@/server/actions/switch-business";

// Tela de SELEÇÃO de negócio (007, US2). Renderizada pelas páginas de dono quando o estado é
// needs_selection — dono de 2+ negócios sem negócio ativo na sessão. É um ESTADO DE UI, não um erro:
// escolher grava na sessão (switchBusiness) e recarrega; a página original então resolve 'active' e
// renderiza normalmente. Distinta do BusinessSwitcher (troca persistente entre páginas já ativas):
// aqui o dono ainda não tem ativo, então oferecemos a primeira escolha explícita.
export interface BusinessSelectionScreenProps {
  options: { businessId: string; name: string }[];
}

export function BusinessSelectionScreen({ options }: BusinessSelectionScreenProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(businessId: string) {
    startTransition(async () => {
      await switchBusiness({ businessId });
      router.refresh();
    });
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-8">
      <header>
        <h1 className="text-2xl font-bold">Selecione o negócio</h1>
        <p className="text-sm text-neutral-500">
          Você é dono de mais de um negócio. Escolha em qual deseja trabalhar.
        </p>
      </header>
      <ul className="flex flex-col gap-2">
        {options.map((b) => (
          <li key={b.businessId}>
            <button
              type="button"
              disabled={pending}
              onClick={() => choose(b.businessId)}
              className="w-full rounded border border-neutral-300 p-3 text-left hover:bg-neutral-50 disabled:opacity-50"
            >
              {b.name}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
