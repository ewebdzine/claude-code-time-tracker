import { NextRequest, NextResponse } from "next/server";
import { authConfigured, isAllowed, createMagicToken, sendMagicLink } from "@/lib/auth";

/**
 * POST /api/auth/request  { email }
 * Emails a magic sign-in link — but only if the address is allow-listed.
 * Always responds 200 so the endpoint can't be used to enumerate addresses.
 */
export async function POST(req: NextRequest) {
  if (!authConfigured()) {
    return NextResponse.json({ error: "Auth is not configured." }, { status: 400 });
  }

  let email = "";
  try {
    ({ email } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  if (isAllowed(email)) {
    try {
      const token = await createMagicToken(email);
      const base = process.env.APP_URL ?? req.nextUrl.origin;
      const link = `${base}/api/auth/callback?token=${encodeURIComponent(token)}`;
      await sendMagicLink(email, link);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to send email." },
        { status: 500 }
      );
    }
  }

  // Uniform response whether or not the address was allow-listed.
  return NextResponse.json({ ok: true });
}
