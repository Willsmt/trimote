import { redirect } from "next/navigation";

import { prisma } from "@/server/db/client";
import { getCurrentUser } from "@/server/auth/session";
import { ProfilePhoneForm } from "@/components/profile-phone-form";

export const dynamic = "force-dynamic";

// Perfil do cliente (issue #34): edição do próprio telefone/WhatsApp. Guarda de sessão como
// /my-bookings; visitante vai ao login. O phone é lido do banco (não vem na sessão).
export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/api/auth/signin?callbackUrl=/profile");
  }

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { phone: true },
  });

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-2xl font-bold">Perfil</h1>
        <p className="text-sm text-neutral-500">Seus dados de contato.</p>
      </header>
      <ProfilePhoneForm initialPhone={record?.phone ?? null} />
    </main>
  );
}
