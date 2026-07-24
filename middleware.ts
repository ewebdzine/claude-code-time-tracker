import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, authConfigured, verifySessionToken, isAllowed } from "@/lib/auth";

/**
 * Gate every page/API route behind the magic-link session — but only when auth
 * is configured (AUTH_SECRET set). Locally, with no secret, the dashboard stays
 * wide open so `npm run dev` needs no login.
 */
export async function middleware(req: NextRequest) {
  if (!authConfigured()) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const email = token ? await verifySessionToken(token) : null;
  if (email && isAllowed(email)) return NextResponse.next();

  const { pathname, search } = req.nextUrl;

  // API routes get a clean 401 rather than an HTML redirect.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  // Protect everything except Next internals, the login page, and auth routes.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/auth).*)"],
};
