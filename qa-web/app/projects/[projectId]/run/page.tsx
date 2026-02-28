import { Suspense } from "react";

import { ProjectRunClient } from "@/components/browserqa/ProjectRunClient";

type Props = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectRunPage({ params }: Props) {
  const { projectId } = await params;
  return (
    <Suspense>
      <ProjectRunClient projectId={projectId} />
    </Suspense>
  );
}
