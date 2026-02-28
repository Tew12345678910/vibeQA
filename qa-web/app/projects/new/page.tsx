import { Suspense } from "react";

import { NewProjectPipelineClient } from "@/components/browserqa/NewProjectPipelineClient";

export default function NewProjectPage() {
  return (
    <Suspense>
      <NewProjectPipelineClient />
    </Suspense>
  );
}
