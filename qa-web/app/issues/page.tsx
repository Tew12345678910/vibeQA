import { Suspense } from "react";

import { IssuesPageClient } from "@/components/browserqa/IssuesPageClient";

export default function IssuesPage() {
  return (
    <Suspense>
      <IssuesPageClient />
    </Suspense>
  );
}
