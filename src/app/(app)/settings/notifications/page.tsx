import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";
import { NotificationPreferences } from "./NotificationPreferences";

export const metadata: Metadata = { title: "Notification settings" };

export default function NotificationSettingsPage() {
  return (
    <>
      <PageHeader title="Notification settings" description="Email on or off for each kind of notification." />
      <NotificationPreferences />
    </>
  );
}
