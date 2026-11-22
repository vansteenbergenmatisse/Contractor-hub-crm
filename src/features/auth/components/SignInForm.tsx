"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthCard } from "./AuthCard";
import { Field } from "./Field";
import { clientHref } from "./client-href";
import type { SignInBrand } from "@/features/brand";

export function SignInForm({ brand }: { brand?: SignInBrand | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keep, setKeep] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, rememberMe: keep }),
      });
      if (response.ok) {
        router.push("/");
        router.refresh();
        return;
      }
      setError(
        response.status === 429
          ? "Too many tries. Wait a minute and try again."
          : response.status === 403
            ? "This login is turned off. Ask Forge Forward."
            : "That email and password do not match.",
      );
    } catch {
      setError("No connection. Check your internet and try again.");
    }
    setBusy(false);
  }

  return (
    <AuthCard title="Sign in" subtitle="Use the email and password for your account." brand={brand}>
      <form className="fd-lf" onSubmit={submit} noValidate>
        <Field label="Email" name="email" type="email" autoComplete="username" value={email} onChange={setEmail} />
        <Field label="Password" name="password" type="password" autoComplete="current-password" value={password} onChange={setPassword} />
        <div className="fd-lrow">
          <label className="fd-lkeep">
            <input type="checkbox" checked={keep} onChange={(event) => setKeep(event.target.checked)} />
            <span>Keep me signed in</span>
          </label>
          <Link className="fd-link fd-lforgot" href={clientHref("/forgot-password", brand)}>Forgot password?</Link>
        </div>
        {error ? <p className="fd-lerr" role="alert">{error}</p> : null}
        <button type="submit" className="fd-btn is-fill fd-lgo" disabled={busy || email.length === 0 || password.length === 0}>
          {busy ? "Signing in" : "Sign in"}
        </button>
      </form>
    </AuthCard>
  );
}
