import { Suspense } from "react";

import { ProjectsPageClient } from "@/components/browserqa/ProjectsPageClient";

export default function ProjectsPage() {
  return (
    <Suspense>
      <ProjectsPageClient />
    </Suspense>
  );
}
