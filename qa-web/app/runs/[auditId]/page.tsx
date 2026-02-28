import { RunDetailClient } from "@/components/browserqa/RunDetailClient";

type Props = {
  params: Promise<{ auditId: string }>;
};

export default async function RunDetailPage({ params }: Props) {
  const { auditId } = await params;
  return <RunDetailClient auditId={auditId} />;
}
