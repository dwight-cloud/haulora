import { TrackingClient } from "./TrackingClient";

export const dynamic = "force-dynamic";

export default async function PublicTrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const apiKey = process.env.NEXT_PUBLIC_HERE_API_KEY ?? "";
  return <TrackingClient token={token} apiKey={apiKey} />;
}
