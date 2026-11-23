"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthCard } from "./AuthCard";
import { Field } from "./Field";
import { clientHref } from "./client-href";
import type { SignInBrand } from "@/features/brand";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "../types";

export function ResetPasswordForm({ token, brand }: { token: string | null; brand?: SignInBrand | null }) {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!token) {
    return (
      <AuthCard title="This link does not work" subtitle="It may have expired or been used already. Ask for a new one." brand={brand}>
        <Link className="fd-btn is-fill fd-lgo" href={clientHref("/forgot-password", brand)}>Ask for a new link</Link>
      </AuthCard>
    );
  }
  if (done) {
    return (
      <AuthCard title="Password changed" subtitle="You are signed out everywhere. Sign in with your new password." brand={brand}>
        <Link className="fd-btn is-fill fd-lgo" href={clientHref("/sign-in", brand)}>Sign in</Link>
      </AuthCard>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || expired) return;
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
    // The server also answers 400 for a long password. Stop it here so 400 below means a dead link.
    if (password.length > MAX_PASSWORD_LENGTH) return setError(`Use at most ${MAX_PASSWORD_LENGTH} characters.`);
    if (password !== again) return setError("The two passwords are not the same.");
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newPassword: password, token }),
      });
      if (response.ok) return setDone(true);
      if (response.status === 400) setExpired(true);
      setError(response.status === 400 ? "This link has expired. Ask for a new one." : "Something went wrong. Try again.");
    } catch {
      setError("No connection. Check your internet and try again.");
    }
    setBusy(false);
  }

  return (
    <AuthCard title="Choose a new password" subtitle={`Use at least ${MIN_PASSWORD_LENGTH} characters.`} brand={brand}>
      <form className="fd-lf" onSubmit={submit} noValidate>
        <Field label="New password" name="new-password" type="password" autoComplete="new-password" value={password} onChange={setPassword} />
        <Field label="New password again" name="new-password-again" type="password" autoComplete="new-password" value={again} onChange={setAgain} />
        {error ? <p className="fd-lerr" role="alert">{error}</p> : null}
        {expired ? (
          <Link className="fd-btn is-fill fd-lgo" href={clientHref("/forgot-password", brand)}>Ask for a new link</Link>
        ) : (
          <button type="submit" className="fd-btn is-fill fd-lgo" disabled={busy}>{busy ? "Saving" : "Save password"}</button>
        )}
      </form>
    </AuthCard>
  );
}
