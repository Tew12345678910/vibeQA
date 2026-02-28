import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ auditId: string }>;
};

export default async function AuditAliasPage({ params }: Props) {
  const { auditId } = await params;
  redirect(`/runs/${auditId}`);
}
