"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthCard } from "./AuthCard";
import { Field } from "./Field";
import { clientHref } from "./client-href";
import type { SignInBrand } from "@/features/brand";

export function ForgotPasswordForm({ brand }: { brand?: SignInBrand | null }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, redirectTo: clientHref("/reset-password", brand) }),
      });
      // The same answer for every email, so nobody can test who has an account.
      if (response.ok || response.status === 400) setSent(true);
      else setError(response.status === 429 ? "Too many tries. Wait a minute and try again." : "Something went wrong. Try again.");
    } catch {
      setError("No connection. Check your internet and try again.");
    }
    setBusy(false);
  }

  if (sent) {
    return (
      <AuthCard title="Check your email" subtitle="If that email has an account, a link to choose a password is on its way. The link works for 24 hours." brand={brand}>
        <Link className="fd-btn is-fill fd-lgo" href={clientHref("/sign-in", brand)}>Back to sign in</Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Reset your password" subtitle="Enter your email. We send a link to choose a new password." brand={brand}>
      <form className="fd-lf" onSubmit={submit} noValidate>
        <Field label="Email" name="email" type="email" autoComplete="username" value={email} onChange={setEmail} />
        {error ? <p className="fd-lerr" role="alert">{error}</p> : null}
        <button type="submit" className="fd-btn is-fill fd-lgo" disabled={busy || email.length === 0}>
          {busy ? "Sending" : "Send the link"}
        </button>
        <Link className="fd-btn is-plain fd-lgo" href={clientHref("/sign-in", brand)}>Back to sign in</Link>
      </form>
    </AuthCard>
  );
}
