"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, User } from "lucide-react";

import { useSession, signOut } from "@/lib/auth-client";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export function ProfileClient() {
  const router = useRouter();
  const { session, isPending } = useSession();

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!isPending && !session?.user) {
      router.replace("/login");
    }
    if (session?.user) {
      const meta = session.user.user_metadata;
      setName(meta?.full_name ?? meta?.name ?? "");
    }
  }, [session, isPending, router]);

  async function handleUpdateName(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: err } = await supabase.auth.updateUser({
        data: { full_name: name.trim() },
      });
      if (err) {
        setError(err.message || "Failed to update name.");
        return;
      }
      setSuccess("Name updated.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to update name.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    setError("");
    try {
      await signOut();
      router.replace("/login");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to sign out.",
      );
      setBusy(false);
    }
  }

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  if (!session?.user) return null;

  const user = session.user;
  const meta = user.user_metadata;
  const displayName: string =
    meta?.full_name ?? meta?.name ?? user.email ?? "?";
  const initials = displayName
    .split(" ")
    .map((w: string) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen items-start justify-center bg-slate-950 px-4 pt-12">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-white">Profile</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            disabled={busy}
          >
            <LogOut className="mr-1.5 h-4 w-4" />
            Sign Out
          </Button>
        </div>

        {/* Avatar + identity */}
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-blue-500 text-xl font-bold text-slate-950">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-medium text-white">
                {displayName}
              </p>
              <p className="truncate text-sm text-slate-400">{user.email}</p>
            </div>
          </CardContent>
        </Card>

        {/* Edit name */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <User className="h-4 w-4" />
              Account Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleUpdateName}>
              <div className="space-y-1.5">
                <Label htmlFor="profile-name" className="text-slate-300">
                  Display Name
                </Label>
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300">Email</Label>
                <Input
                  value={user.email ?? ""}
                  disabled
                  className="opacity-60"
                />
              </div>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save Changes"}
              </Button>
            </form>

            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
            {success && (
              <p className="mt-3 text-sm text-emerald-400">{success}</p>
            )}
          </CardContent>
        </Card>

        {/* Account info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-slate-100">Account Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">User ID</span>
              <span className="font-mono text-slate-300">{user.id}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-slate-400">Email Verified</span>
              <span className="text-slate-300">
                {user.email_confirmed_at ? "Yes" : "No"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
