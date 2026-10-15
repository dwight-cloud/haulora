import type { Metadata, Viewport } from "next";
import { HelperPanel } from "@/components/HelperPanel";
import { DriverShell } from "@/components/driver/DriverShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Haulora Driver",
  description: "Today's delivery jobs, updates from dispatch, and a one-tap way to report a road problem.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Haulora Driver", statusBarStyle: "black-translucent" },
  other: { "apple-mobile-web-app-capable": "yes", "mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  themeColor: "#1C1A17",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * The driver app shell: no dispatcher sidebar. A slim top bar, a centred
 * column (max 560px on a laptop), a bottom tab bar with 56px targets, and the
 * same Ask Haulora helper as the office side.
 */
export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <DriverShell>{children}</DriverShell>
      <HelperPanel />
    </div>
  );
}
