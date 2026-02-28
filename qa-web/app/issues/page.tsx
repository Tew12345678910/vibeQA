import { IssuesPageClient } from "@/components/browserqa/IssuesPageClient";
import { SecurityDashboardClient } from "@/components/security/SecurityDashboardClient";

export default function IssuesPage() {
  return (
    <div className="space-y-10">
      <IssuesPageClient />
      <SecurityDashboardClient />
    </div>
  );
}

