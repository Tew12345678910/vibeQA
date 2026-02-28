import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ auditId: string }>;
};

export default async function RunDetailPage({ params }: Props) {
  const { auditId } = await params;
  redirect(`/issues?runId=${encodeURIComponent(auditId)}`);
}
