"use client";

import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function messageFromError(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return fallback;
}

export function AuthEmailPasswordPanel() {
  const { data: session, isPending, refetch } = authClient.useSession();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function onSignUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    setError("");

    try {
      const payloadName = name.trim() || email.trim().split("@")[0] || "User";
      const { error: signUpError } = await authClient.signUp.email({
        name: payloadName,
        email: email.trim(),
        password,
      });

      if (signUpError) {
        setError(messageFromError(signUpError, "Failed to create account."));
        return;
      }

      setStatus("Account created and signed in.");
      setName("");
      setEmail("");
      setPassword("");
      await refetch();
    } catch (caught) {
      setError(messageFromError(caught, "Failed to create account."));
    } finally {
      setBusy(false);
    }
  }

  async function onSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    setError("");

    try {
      const { error: signInError } = await authClient.signIn.email({
        email: signInEmail.trim(),
        password: signInPassword,
      });

      if (signInError) {
        setError(messageFromError(signInError, "Invalid credentials."));
        return;
      }

      setStatus("Signed in.");
      setSignInEmail("");
      setSignInPassword("");
      await refetch();
    } catch (caught) {
      setError(messageFromError(caught, "Failed to sign in."));
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    setBusy(true);
    setStatus("");
    setError("");

    try {
      const { error: signOutError } = await authClient.signOut();
      if (signOutError) {
        setError(messageFromError(signOutError, "Failed to sign out."));
        return;
      }
      setStatus("Signed out.");
      await refetch();
    } catch (caught) {
      setError(messageFromError(caught, "Failed to sign out."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Sign Up</CardTitle>
          <CardDescription>Create an account with email and password.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3" onSubmit={onSignUp}>
            <div className="grid gap-1.5">
              <Label htmlFor="signup-name">Name</Label>
              <Input
                id="signup-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Alex"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="signup-email">Email</Label>
              <Input
                id="signup-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="alex@example.com"
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="signup-password">Password</Label>
              <Input
                id="signup-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
              />
            </div>
            <Button type="submit" disabled={busy || isPending}>
              {busy ? "Working..." : "Create Account"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sign In</CardTitle>
          <CardDescription>Use your existing email and password.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3" onSubmit={onSignIn}>
            <div className="grid gap-1.5">
              <Label htmlFor="signin-email">Email</Label>
              <Input
                id="signin-email"
                type="email"
                value={signInEmail}
                onChange={(event) => setSignInEmail(event.target.value)}
                placeholder="alex@example.com"
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="signin-password">Password</Label>
              <Input
                id="signin-password"
                type="password"
                value={signInPassword}
                onChange={(event) => setSignInPassword(event.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={busy || isPending}>
              {busy ? "Working..." : "Sign In"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Session</CardTitle>
          <CardDescription>
            {session?.user
              ? `Signed in as ${session.user.email}`
              : "No active session."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={onSignOut} disabled={busy || !session?.user}>
            Sign Out
          </Button>
          {status ? <p className="text-sm text-emerald-700">{status}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
