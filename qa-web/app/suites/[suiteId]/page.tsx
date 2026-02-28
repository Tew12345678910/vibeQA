import { SuiteDetailClient } from "@/components/browserqa/SuiteDetailClient";

type Props = {
  params: Promise<{ suiteId: string }>;
};

export default async function SuiteDetailPage({ params }: Props) {
  const { suiteId } = await params;
  return <SuiteDetailClient suiteId={suiteId} />;
}
