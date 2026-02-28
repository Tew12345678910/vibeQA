import { Suspense } from "react";

import { ProjectDetailClient } from "@/components/browserqa/ProjectDetailClient";

type Props = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectDetailPage({ params }: Props) {
  const { projectId } = await params;
  return (
    <Suspense>
      <ProjectDetailClient projectId={projectId} />
    </Suspense>
  );
}
