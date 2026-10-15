import { Nav } from "@/components/Nav";
import { PreviewClient } from "./PreviewClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Driver app — Haulora" };

export default function DriverPreviewPage() {
  return (
    <>
      <Nav />
      <main className="min-h-screen bg-bitumen-900 px-4 py-6 md:px-6 md:py-10">
        <PreviewClient />
      </main>
    </>
  );
}
