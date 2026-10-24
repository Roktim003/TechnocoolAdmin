import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";
import { NotificationsInbox } from "./NotificationsInbox";

export const metadata: Metadata = { title: "Notifications" };

/** Everyone signed in has an inbox (the app layout already requires a session). */
export default function NotificationsPage() {
  return (
    <>
      <PageHeader title="Notifications" description="Approvals, transfers, counts and low-stock alerts for you." />
      <NotificationsInbox />
    </>
  );
}
