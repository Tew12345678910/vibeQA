import { TldrPage } from "@/components/browserqa/TldrPage";

export const metadata = {
  title: "TL;DR — Vibe QA",
  description:
    "The problem, the dual RAG + browser-use pipeline, and who Vibe QA is built for — in 60 seconds.",
};

export default function TldrRoute() {
  return <TldrPage />;
}
