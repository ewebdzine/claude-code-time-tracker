/**
 * Passwordless magic-link auth for the hosted (Vercel) deployment.
 *
 * Stateless by design — no database. A short-lived signed token is emailed as a
 * link; clicking it mints a longer-lived signed session cookie. Sign-in is
 * restricted to the addresses in ALLOWED_EMAILS.
 *
 * Edge-safe: uses `jose` + Web APIs only (this module is imported by
 * middleware, which runs on the edge runtime).
 */

import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "cct_session";
const MAGIC_TTL = "15m";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

/** Auth is only enforced when a secret is configured (i.e. on the deploy). */
export function authConfigured(): boolean {
  return Boolean(process.env.AUTH_SECRET);
}

function secretKey(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

/** Allowlisted addresses, lower-cased. Empty ⇒ nobody can sign in. */
export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowed(email: string): boolean {
  return allowedEmails().includes(email.trim().toLowerCase());
}

async function sign(email: string, purpose: "magic" | "session", ttl: string | number): Promise<string> {
  return new SignJWT({ purpose })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email.trim().toLowerCase())
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(secretKey());
}

async function verify(token: string, purpose: "magic" | "session"): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.purpose !== purpose || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export const createMagicToken = (email: string) => sign(email, "magic", MAGIC_TTL);
export const verifyMagicToken = (token: string) => verify(token, "magic");

export const createSessionToken = (email: string) =>
  sign(email, "session", `${SESSION_TTL_SECONDS}s`);
export const verifySessionToken = (token: string) => verify(token, "session");

export const sessionCookieMaxAge = SESSION_TTL_SECONDS;

/**
 * Send the magic link via Resend's REST API (no SDK dependency).
 * Falls back to Resend's sandbox sender, which delivers to the Resend
 * account owner's own address — perfect for a single-user dashboard.
 */
export async function sendMagicLink(email: string, link: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  const from = process.env.MAGIC_FROM ?? "onboarding@resend.dev";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: "Your sign-in link — Claude Code Time Tracker",
      text: `Click to sign in (valid 15 minutes):\n\n${link}\n\nIf you didn't request this, ignore this email.`,
      html:
        `<p>Click to sign in to <strong>Claude Code Time Tracker</strong> (valid 15 minutes):</p>` +
        `<p><a href="${link}">Sign in</a></p>` +
        `<p style="color:#888;font-size:12px">If you didn't request this, ignore this email.</p>`,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend send failed (${res.status}): ${body.slice(0, 300)}`);
  }
}
