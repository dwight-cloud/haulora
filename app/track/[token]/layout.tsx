// Public shipper view — no app shell, no nav, no auth. Bare layout overrides
// the dispatcher sidebar styles so this page renders edge-to-edge.
export default function PublicTrackingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
