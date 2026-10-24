"use client";

import { useCallback, useEffect, useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { Notification } from "@/components/ui/Notification";
import { api, errorMessage } from "@/lib/api-client";
import { UsersTab } from "./UsersTab";
import { RolesTab } from "./RolesTab";
import { LoginHistoryTab } from "./LoginHistoryTab";
import type { Notice, RoleDto, WarehouseDto } from "./types";
import styles from "./users.module.css";

type TabKey = "users" | "roles" | "history";

export function UsersAdmin({ currentUserId, initialQuery, initialTab }: { currentUserId: string; initialQuery: string; initialTab: TabKey }) {
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseDto[]>([]);

  const notify = useCallback((n: Notice) => {
    setNotice(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const loadRoles = useCallback(async () => {
    try {
      setRoles((await api<{ data: RoleDto[] }>("/roles")).data);
    } catch (err) {
      notify({ kind: "error", title: "Could not load roles", message: errorMessage(err) });
    }
  }, [notify]);

  useEffect(() => {
    void loadRoles();
    api<{ data: WarehouseDto[] }>("/warehouses")
      .then((r) => setWarehouses(r.data))
      .catch((err) => notify({ kind: "error", title: "Could not load warehouses", message: errorMessage(err) }));
  }, [loadRoles, notify]);

  const changeTab = (key: TabKey) => {
    setTab(key);
    setNotice(null);
    const url = new URL(window.location.href);
    if (key === "users") url.searchParams.delete("tab");
    else url.searchParams.set("tab", key);
    window.history.replaceState(null, "", url);
  };

  return (
    <div className={styles.admin}>
      {notice ? (
        <Notification kind={notice.kind} title={notice.title} onClose={() => setNotice(null)} className={styles.notice}>
          {notice.message}
        </Notification>
      ) : null}
      <Tabs
        label="Users and roles sections"
        selected={tab}
        onChange={changeTab}
        items={[
          { key: "users", label: "Users" },
          { key: "roles", label: "Roles & permissions" },
          { key: "history", label: "Login history" },
        ]}
      />
      <div className={styles.panel} role="tabpanel">
        {tab === "users" ? (
          <UsersTab roles={roles} warehouses={warehouses} currentUserId={currentUserId} initialQuery={initialQuery} notify={notify} onUsersChanged={loadRoles} />
        ) : tab === "roles" ? (
          <RolesTab roles={roles} reloadRoles={loadRoles} notify={notify} />
        ) : (
          <LoginHistoryTab notify={notify} />
        )}
      </div>
    </div>
  );
}
