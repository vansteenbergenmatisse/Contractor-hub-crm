"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthCard } from "./AuthCard";
import { Field } from "./Field";
import { MIN_PASSWORD_LENGTH } from "../types";

// `email` is null when the invite is not valid (unknown, used or expired); one message for all.
export function InviteAcceptForm({ code, email }: { code: string; email: string | null }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (email === null) {
    return (
      <AuthCard title="This invite does not work" subtitle="The link has expired or was already used. Ask Forge Forward for a new one.">
        <Link className="fd-btn is-plain fd-lgo" href="/sign-in">Go to sign in</Link>
      </AuthCard>
    );
  }
  if (done) {
    return (
      <AuthCard title="You are in" subtitle="Your account is ready. Sign in with your email and the password you just chose.">
        <Link className="fd-btn is-fill fd-lgo" href="/sign-in">Sign in</Link>
      </AuthCard>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setNameError(null);
    setPasswordError(null);
    setFormError(null);
    if (name.trim().length === 0) return setNameError("Enter your name.");
    if (password.length < MIN_PASSWORD_LENGTH) return setPasswordError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
    setBusy(true);
    try {
      const response = await fetch(`/api/invites/${encodeURIComponent(code)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
      if (response.ok) return setDone(true);
      setFormError(response.status === 404 ? "This invite has expired or was already used." : "Something went wrong. Try again.");
    } catch {
      setFormError("No connection. Check your internet and try again.");
    }
    setBusy(false);
  }

  return (
    <AuthCard title="Welcome" subtitle="Choose a password to finish your account.">
      <form className="fd-lf" onSubmit={submit} noValidate>
        <Field label="Email" name="email" type="email" autoComplete="username" value={email} onChange={() => {}} readOnly />
        <Field label="Your name" name="name" autoComplete="name" value={name} onChange={setName} error={nameError} />
        <Field label="Password" name="password" type="password" autoComplete="new-password" value={password} onChange={setPassword} error={passwordError} />
        {formError ? <p className="fd-lerr" role="alert">{formError}</p> : null}
        <button type="submit" className="fd-btn is-fill fd-lgo" disabled={busy}>{busy ? "Creating" : "Create my account"}</button>
      </form>
    </AuthCard>
  );
}
