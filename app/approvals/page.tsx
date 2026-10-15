import { redirect } from "next/navigation";

/** The approvals queue now lives at /decisions. */
export default function ApprovalsRedirect() {
  redirect("/decisions");
}
