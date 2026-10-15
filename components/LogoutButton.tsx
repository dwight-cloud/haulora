"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }
  return (
    <button
      type="button"
      onClick={logout}
      className="inline-flex min-h-[44px] items-center rounded-lg border border-bitumen-200 bg-white px-3 text-xs font-semibold text-bitumen-600 shadow-sm transition hover:border-bitumen-300 hover:text-bitumen-900 md:min-h-0 md:py-1.5"
    >
      Sign out
    </button>
  );
}
