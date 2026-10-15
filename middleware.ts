import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth-core";

async function getSessionFromRequest(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
    ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  return verifySession(token);
}

const DISPATCHER_ROUTES = ["/dashboard", "/fleet", "/loads", "/customers", "/disruptions", "/decisions", "/agents", "/approvals", "/evals", "/plan", "/sequence", "/tours", "/team", "/driver-preview"];
const DRIVER_ROUTES = ["/driver"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const needsDispatcher = DISPATCHER_ROUTES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const needsDriver = DRIVER_ROUTES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!needsDispatcher && !needsDriver) return NextResponse.next();

  const session = await getSessionFromRequest(req);
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (needsDispatcher && session.role !== "dispatcher") {
    return NextResponse.redirect(new URL("/driver", req.url));
  }
  // Driver pages accept either role: a dispatcher may click through the
  // driver app (read-only in spirit) without signing out.
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*", "/fleet/:path*", "/loads/:path*", "/customers/:path*", "/disruptions/:path*", "/decisions/:path*", "/agents/:path*", "/approvals/:path*", "/evals/:path*", "/plan/:path*", "/sequence/:path*", "/tours/:path*", "/team/:path*",
    "/driver/:path*", "/driver-preview",
  ],
};
