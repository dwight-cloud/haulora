import { JobClient } from "./JobClient";

export const metadata = { title: "Delivery job — Haulora Driver" };

export default async function DriverJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <JobClient id={id} />;
}
