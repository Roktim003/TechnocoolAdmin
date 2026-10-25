"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SelectField, TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { ContentSwitcher } from "@/components/ui/Tabs";
import { Tag } from "@/components/ui/Tag";
import { api, errorMessage, type Page } from "@/lib/api-client";
import { formatDateTime } from "@/shared/time/format";
import { UserFormModal } from "./UserFormModal";
import { SetPasswordModal } from "./SetPasswordModal";
import type { Notify, RoleDto, UserDto, WarehouseDto } from "./types";
import styles from "./users.module.css";

type StatusFilter = "all" | "active" | "disabled";

interface Props {
  roles: RoleDto[];
  warehouses: WarehouseDto[];
  currentUserId: string;
  initialQuery: string;
  notify: Notify;
  /** Role user-counts change when users are created or moved. */
  onUsersChanged: () => void;
}

export function UsersTab({ roles, warehouses, currentUserId, initialQuery, notify, onUsersChanged }: Props) {
  const [q, setQ] = useState(initialQuery);
  const [debouncedQ, setDebouncedQ] = useState(initialQuery);
  const [roleId, setRoleId] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sort, setSort] = useState("name");
  const [result, setResult] = useState<Page<UserDto> | null>(null);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<UserDto | "new" | null>(null);
  const [passwordFor, setPasswordFor] = useState<UserDto | null>(null);
  const [confirmDisable, setConfirmDisable] = useState<UserDto | null>(null);
  const [confirmLogoutAll, setConfirmLogoutAll] = useState<UserDto | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResult(
        await api<Page<UserDto>>("/users", {
          query: { page, pageSize, sort, q: debouncedQ, roleId, status: status === "all" ? undefined : status },
        }),
      );
    } catch (err) {
      notify({ kind: "error", title: "Could not load users", message: errorMessage(err) });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sort, debouncedQ, roleId, status, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const afterChange = (title: string, message?: string) => {
    notify({ kind: "success", title, message });
    void load();
    onUsersChanged();
  };

  async function setEnabled(user: UserDto, enable: boolean) {
    setBusy(true);
    try {
      await api(`/users/${user.id}/${enable ? "enable" : "disable"}`, { method: "POST" });
      setConfirmDisable(null);
      afterChange(enable ? "User enabled" : "User disabled", enable ? `${user.name} can log in again.` : `${user.name} was signed out everywhere and can no longer log in.`);
    } catch (err) {
      notify({ kind: "error", title: enable ? "Could not enable user" : "Could not disable user", message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function logoutAll(user: UserDto) {
    setBusy(true);
    try {
      const r = await api<{ data: { sessionsRevoked: number } }>(`/users/${user.id}/logout-all`, { method: "POST" });
      setConfirmLogoutAll(null);
      afterChange("Logged out of all devices", `${user.name} must log in again on every device (${r.data.sessionsRevoked} session${r.data.sessionsRevoked === 1 ? "" : "s"} ended).`);
    } catch (err) {
      notify({ kind: "error", title: "Could not log out the user", message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const sortHeader = (field: string, label: string) => {
    const active = sort === field || sort === `-${field}`;
    const desc = sort === `-${field}`;
    return (
      <button
        type="button"
        onClick={() => setSort(active && !desc ? `-${field}` : field)}
        className={styles.sortButton}
        aria-label={`Sort by ${label}`}
      >
        {label} {active ? (desc ? "↓" : "↑") : ""}
      </button>
    );
  };

  const columns: Column<UserDto>[] = [
    {
      key: "name",
      header: sortHeader("name", "Name"),
      render: (u) => (
        <div className={styles.nameCell}>
          <span>{u.name}</span>
          {u.email ? <span className={styles.subtle}>{u.email}</span> : null}
        </div>
      ),
    },
    { key: "username", header: sortHeader("username", "Username"), render: (u) => <span className={styles.mono}>{u.username}</span> },
    { key: "role", header: "Role", render: (u) => u.role.name, className: styles.nowrap },
    {
      key: "warehouses",
      header: "Warehouses",
      render: (u) => (
        <span className={styles.tags}>
          {u.warehouses.map((w) => (
            <Tag key={w.id} kind="blue" title={w.name}>
              {w.code}
            </Tag>
          ))}
        </span>
      ),
    },
    { key: "phone", header: "Phone", render: (u) => <span className={styles.nowrap}>{u.phone ?? "—"}</span> },
    { key: "lastLogin", header: sortHeader("lastLoginAt", "Last login"), render: (u) => <span className={styles.nowrap}>{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}</span> },
    {
      key: "status",
      header: "Status",
      render: (u) => (
        <span className={styles.tags}>
          {u.status === "active" ? <Tag kind="green">Active</Tag> : <Tag kind="red">Disabled</Tag>}
          {u.isLocked ? (
            <Tag kind="yellow" title="Locked after too many failed logins. Set a new password to unlock.">
              Locked
            </Tag>
          ) : null}
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="visually-hidden">Actions</span>,
      align: "end",
      render: (u) => (
        <div className={styles.rowActions}>
          <Button kind="ghost" size="sm" onClick={() => setEditing(u)}>
            Edit
          </Button>
          <Button kind="ghost" size="sm" onClick={() => setPasswordFor(u)}>
            Set password
          </Button>
          <Button kind="ghost" size="sm" onClick={() => setConfirmLogoutAll(u)} disabled={u.status !== "active"}>
            Log out all devices
          </Button>
          {u.status === "active" ? (
            <Button kind="ghost" size="sm" onClick={() => setConfirmDisable(u)} disabled={u.id === currentUserId} title={u.id === currentUserId ? "You cannot disable your own account" : undefined}>
              Disable
            </Button>
          ) : (
            <Button kind="ghost" size="sm" onClick={() => setEnabled(u, true)} disabled={busy}>
              Enable
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        caption="Users"
        columns={columns}
        rows={result?.data ?? []}
        rowKey={(u) => u.id}
        loading={loading}
        emptyMessage={debouncedQ || roleId || status !== "all" ? "No users match these filters." : "No users yet."}
        toolbar={
          <div className={styles.toolbar}>
            <TextField
              label="Search"
              type="search"
              placeholder="Name, username, phone or email"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              fieldClassName={styles.searchField}
            />
            <SelectField
              label="Role"
              value={roleId}
              onChange={(e) => {
                setRoleId(e.target.value);
                setPage(1);
              }}
              fieldClassName={styles.filterField}
            >
              <option value="">All roles</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </SelectField>
            <ContentSwitcher
              label="Status"
              selected={status}
              onChange={(s) => {
                setStatus(s);
                setPage(1);
              }}
              items={[
                { key: "all", label: "All" },
                { key: "active", label: "Active" },
                { key: "disabled", label: "Disabled" },
              ]}
            />
            <div className={styles.toolbarEnd}>
              <Button onClick={() => setEditing("new")}>
                Add user <span aria-hidden="true">+</span>
              </Button>
            </div>
          </div>
        }
        footer={
          result ? (
            <Pagination
              page={result.meta.page}
              pageSize={result.meta.pageSize}
              total={result.meta.total}
              onChange={(p, s) => {
                setPage(p);
                setPageSize(s);
              }}
            />
          ) : null
        }
      />

      {editing ? (
        <UserFormModal
          user={editing === "new" ? null : editing}
          roles={roles}
          warehouses={warehouses}
          isSelf={editing !== "new" && editing.id === currentUserId}
          onClose={() => setEditing(null)}
          onSaved={(u, created) => {
            setEditing(null);
            afterChange(created ? "User created" : "User updated", created ? `${u.name} (${u.username}) can now log in.` : `Changes to ${u.name} were saved.`);
          }}
        />
      ) : null}

      {passwordFor ? (
        <SetPasswordModal
          user={passwordFor}
          onClose={() => setPasswordFor(null)}
          onSaved={(u) => {
            setPasswordFor(null);
            afterChange("Password set", `${u.name} was signed out of every device and must log in with the new password.`);
          }}
        />
      ) : null}

      <Modal
        open={!!confirmDisable}
        size="sm"
        label="Disable user"
        title={`Disable ${confirmDisable?.name ?? ""}?`}
        primaryText="Disable"
        primaryKind="danger"
        submitting={busy}
        onClose={() => setConfirmDisable(null)}
        onSubmit={() => confirmDisable && setEnabled(confirmDisable, false)}
      >
        <p>They will be signed out of every device immediately and will not be able to log in until re-enabled.</p>
      </Modal>

      <Modal
        open={!!confirmLogoutAll}
        size="sm"
        label="Log out all devices"
        title={`Log out ${confirmLogoutAll?.name ?? ""} everywhere?`}
        primaryText="Log out all devices"
        primaryKind="danger"
        submitting={busy}
        onClose={() => setConfirmLogoutAll(null)}
        onSubmit={() => confirmLogoutAll && logoutAll(confirmLogoutAll)}
      >
        <p>Every browser and phone signed in as this user is signed out at once. They can log in again with their password. Use this when a phone is lost or a password may be known to someone else.</p>
      </Modal>
    </>
  );
}
