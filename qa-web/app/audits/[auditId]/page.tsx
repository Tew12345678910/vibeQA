import { notFound } from "next/navigation";

import { AuditDetailClient } from "@/components/AuditDetailClient";

type Props = {
  params: Promise<{ auditId: string }>;
};

export default async function AuditDetailsPage({ params }: Props) {
  const { auditId } = await params;
  if (!auditId) {
    notFound();
  }

  return <AuditDetailClient auditId={auditId} />;
}
