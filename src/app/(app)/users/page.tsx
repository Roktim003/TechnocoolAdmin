import type { Metadata } from "next";
import { AccessDenied } from "@/components/shell/PageStates";
import { PageHeader } from "@/components/shell/PageHeader";
import { allowedFor } from "../guard";
import { UsersAdmin } from "./_components/UsersAdmin";

export const metadata: Metadata = { title: "Users & roles" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string }> }) {
  const principal = await allowedFor("/users");
  if (!principal) return <AccessDenied what="Users & roles" />;
  const { q, tab } = await searchParams;

  return (
    <>
      <PageHeader title="Users & roles" description="Manage who can sign in, what each role can do, and review login activity." />
      <UsersAdmin currentUserId={principal.userId} initialQuery={q ?? ""} initialTab={tab === "roles" || tab === "history" ? tab : "users"} />
    </>
  );
}
