import { Nav } from "@/components/Nav";
import { PERMIT_DIRECTORY } from "@/lib/permits";

export default function PermitsPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-3xl font-black">OS/OW permit directory</h1>
        <p className="text-ink-500">State permit offices for oversize/overweight loads — direct phone, website, and online systems.</p>

        <section className="mt-6 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-card">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-left text-xs font-semibold uppercase tracking-widest text-ink-500">
              <tr>
                <th className="px-4 py-2">State</th>
                <th className="px-4 py-2">Office</th>
                <th className="px-4 py-2">Phone</th>
                <th className="px-4 py-2">Online</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {PERMIT_DIRECTORY.map((p) => (
                <tr key={p.state}>
                  <td className="px-4 py-2 font-mono font-bold">{p.state}</td>
                  <td className="px-4 py-2">
                    <a href={p.website} target="_blank" rel="noreferrer" className="text-ink-900 hover:underline">{p.name}</a>
                  </td>
                  <td className="px-4 py-2 font-mono">{p.phone ?? "—"}</td>
                  <td className="px-4 py-2">
                    {p.onlineSystem
                      ? <a href={p.onlineSystem} target="_blank" rel="noreferrer" className="text-ink-900 font-bold hover:underline">Apply online</a>
                      : <span className="text-ink-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </>
  );
}
