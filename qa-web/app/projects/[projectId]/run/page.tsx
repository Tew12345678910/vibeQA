import { Suspense } from "react";

import { ProjectRunClient } from "@/components/browserqa/ProjectRunClient";

type Props = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ runId?: string }>;
};

export default async function ProjectRunPage({ params, searchParams }: Props) {
  const [{ projectId }, { runId }] = await Promise.all([params, searchParams]);
  return (
    <Suspense>
      <ProjectRunClient projectId={projectId} initialRunId={runId} />
    </Suspense>
  );
}
