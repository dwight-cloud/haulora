import { Nav } from "@/components/Nav";
import { CustomersClient } from "./CustomersClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customers — Haulio" };

export default function CustomersPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <CustomersClient />
      </main>
    </>
  );
}
