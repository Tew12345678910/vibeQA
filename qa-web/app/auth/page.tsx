import { redirect } from "next/navigation";

// Auth is now GitHub-only via Supabase — redirect to the login page.
export default function AuthPage() {
  redirect("/login");
}
