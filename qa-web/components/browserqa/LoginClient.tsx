"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Github } from "lucide-react";

import { useSession, signInWithGitHub } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function LoginClient() {
  const router = useRouter();
  const { session, isPending } = useSession();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!isPending && session?.user) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <p className="text-slate-300">
          You are already signed in as{" "}
          <span className="font-semibold text-white">{session.user.email}</span>
          .
        </p>
        <Button onClick={() => router.push("/profile")}>Go to Profile</Button>
      </div>
    );
  }

  async function handleGitHubSignIn() {
    setBusy(true);
    setError("");
    try {
      await signInWithGitHub();
      // Browser is redirected to GitHub — no further action needed here
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to start sign-in.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-emerald-500">
            <Bot className="h-6 w-6 text-slate-950" />
          </div>
          <h1 className="text-2xl font-semibold text-white">VibeQA</h1>
          <p className="mt-1 text-sm text-slate-400">Sign in to continue</p>
        </div>

        <Button
          className="w-full gap-2 bg-emerald-500 text-slate-950 hover:bg-emerald-400"
          onClick={handleGitHubSignIn}
          disabled={busy || isPending}
        >
          <Github className="h-4 w-4" />
          {busy ? "Redirecting…" : "Continue with GitHub"}
        </Button>

        {error && <p className="text-center text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}
