import { Nav } from "@/components/Nav";
import { getSession } from "@/lib/auth";
import { DashboardClient } from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const s = await getSession();
  const apiKey = process.env.NEXT_PUBLIC_HERE_API_KEY ?? "";
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <DashboardClient apiKey={apiKey} accountName={s?.accountName ?? "Demo fleet"} />
      </main>
    </>
  );
}
