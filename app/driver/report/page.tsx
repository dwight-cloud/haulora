import { Suspense } from "react";
import { ReportClient } from "./ReportClient";

export const metadata = { title: "Report a road problem — Haulora Driver" };

export default function DriverReportPage() {
  return <Suspense fallback={null}><ReportClient /></Suspense>;
}
