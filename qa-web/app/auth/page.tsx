import { AuthEmailPasswordPanel } from "@/components/AuthEmailPasswordPanel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AuthPage() {
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Authentication</CardTitle>
          <CardDescription>
            Email/password authentication backed by Better Auth + Neon Postgres. Email verification is disabled.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AuthEmailPasswordPanel />
        </CardContent>
      </Card>
    </div>
  );
}
