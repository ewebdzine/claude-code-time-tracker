"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setMessage("");
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setState("sent");
      } else {
        setState("error");
        setMessage(data.error ?? "Something went wrong.");
      }
    } catch {
      setState("error");
      setMessage("Network error. Try again.");
    }
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "#0b0b0f",
        color: "#e7e7ea",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        padding: "1.5rem",
      }}
    >
      <div style={{ width: "100%", maxWidth: 360 }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 650, marginBottom: 4 }}>
          Claude Code Time Tracker
        </h1>
        <p style={{ color: "#9a9aa2", fontSize: "0.9rem", marginBottom: 24 }}>
          Enter your email to get a sign-in link.
        </p>

        {state === "sent" ? (
          <div
            style={{
              background: "#12261a",
              border: "1px solid #1f5236",
              borderRadius: 10,
              padding: "14px 16px",
              fontSize: "0.9rem",
            }}
          >
            Check your inbox — a sign-in link is on its way. It’s valid for 15
            minutes.
          </div>
        ) : (
          <form onSubmit={submit}>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "11px 13px",
                borderRadius: 10,
                border: "1px solid #2a2a33",
                background: "#15151c",
                color: "#e7e7ea",
                fontSize: "0.95rem",
                marginBottom: 12,
              }}
            />
            <button
              type="submit"
              disabled={state === "sending"}
              style={{
                width: "100%",
                padding: "11px 13px",
                borderRadius: 10,
                border: "none",
                background: state === "sending" ? "#3a3a45" : "#6d5efc",
                color: "white",
                fontSize: "0.95rem",
                fontWeight: 600,
                cursor: state === "sending" ? "default" : "pointer",
              }}
            >
              {state === "sending" ? "Sending…" : "Email me a link"}
            </button>
            {state === "error" && (
              <p style={{ color: "#ff8f8f", fontSize: "0.85rem", marginTop: 12 }}>
                {message}
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
