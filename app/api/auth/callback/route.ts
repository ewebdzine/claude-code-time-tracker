import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  verifyMagicToken,
  isAllowed,
  createSessionToken,
  sessionCookieMaxAge,
} from "@/lib/auth";

/**
 * GET /api/auth/callback?token=…&next=…
 * Verifies the emailed token, sets the session cookie, redirects into the app.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const nextPath = req.nextUrl.searchParams.get("next");

  const email = token ? await verifyMagicToken(token) : null;
  if (!email || !isAllowed(email)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?error=This%20link%20is%20invalid%20or%20expired.";
    return NextResponse.redirect(url);
  }

  const dest = req.nextUrl.clone();
  dest.pathname = nextPath && nextPath.startsWith("/") ? nextPath.split("?")[0] : "/";
  dest.search = nextPath && nextPath.includes("?") ? nextPath.slice(nextPath.indexOf("?")) : "";

  const res = NextResponse.redirect(dest);
  res.cookies.set(SESSION_COOKIE, await createSessionToken(email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionCookieMaxAge,
  });
  return res;
}
