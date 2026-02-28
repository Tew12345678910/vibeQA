import { redirect } from "next/navigation";

export default async function ProjectDetailPage() {
  redirect("/projects/new");
}
