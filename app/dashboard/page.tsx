import { redirect } from "next/navigation";

/** Bare /dashboard has no content of its own — send staff to the reports queue. */
export default function DashboardIndexPage() {
  redirect("/dashboard/reports");
}
