"use client";

import {
  CrmDataTable,
  type CrmDataTableColumn,
} from "@/components/crm-boilerplate/data-table";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";
import {
  UserDeleteForm,
  UserRoleTemplateForm,
  UserSetupLinkForm,
} from "@/components/crm-boilerplate/UserTableActions";
import {
  getUserRoleTemplate,
  type UserRoleTemplateKey,
} from "@/lib/users/role-templates";

export type UserTableRow = {
  createdAt: string;
  disabledActions: boolean;
  email: string;
  id: string;
  name: string;
  role: "ADMIN" | "USER";
  roleTemplate: UserRoleTemplateKey | null;
  setupLinkExpiresAt: string | null;
  setupLinkStatus: "ACCEPTED" | "EXPIRED" | "NONE" | "PENDING";
  setupLinkUsedAt: string | null;
  status: string;
  voiceAvailability: string;
};

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function setupStatusLabel(status: UserTableRow["setupLinkStatus"]) {
  switch (status) {
    case "PENDING":
      return "Pending";
    case "EXPIRED":
      return "Expired";
    case "ACCEPTED":
      return "Accepted";
    case "NONE":
      return "No link";
  }
}

function roleTemplateLabel(roleTemplate: UserRoleTemplateKey | null) {
  return getUserRoleTemplate(roleTemplate)?.label ?? "No template";
}

function setupStatusDetail(user: UserTableRow) {
  if (user.setupLinkStatus === "PENDING" && user.setupLinkExpiresAt) {
    return `Expires ${dateFormatter.format(new Date(user.setupLinkExpiresAt))}`;
  }

  if (user.setupLinkStatus === "ACCEPTED" && user.setupLinkUsedAt) {
    return `Used ${dateFormatter.format(new Date(user.setupLinkUsedAt))}`;
  }

  if (user.setupLinkStatus === "EXPIRED" && user.setupLinkExpiresAt) {
    return `Expired ${dateFormatter.format(new Date(user.setupLinkExpiresAt))}`;
  }

  return "No active setup email";
}

const columns: CrmDataTableColumn<UserTableRow>[] = [
  {
    id: "user",
    header: "User",
    sortable: true,
    sortValue: (user) => user.name,
    cell: (user) => (
      <div>
        <p className="font-medium text-gray-800 dark:text-white/90">
          {user.name}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {user.email}
        </p>
      </div>
    ),
  },
  {
    id: "role",
    header: "Role template",
    sortable: true,
    sortValue: (user) => roleTemplateLabel(user.roleTemplate),
    cell: (user) => (
      <UserRoleTemplateForm
        userId={user.id}
        initialBaseRole={user.role}
        initialRoleTemplate={user.roleTemplate}
        disabled={user.disabledActions}
      />
    ),
  },
  {
    id: "status",
    header: "Status",
    sortable: true,
    sortValue: (user) => user.status,
    cell: (user) => <StatusBadge>{user.status}</StatusBadge>,
  },
  {
    id: "setup",
    header: "Setup link",
    sortable: true,
    sortValue: (user) => user.setupLinkStatus,
    cell: (user) => (
      <div>
        <StatusBadge>{setupStatusLabel(user.setupLinkStatus)}</StatusBadge>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {setupStatusDetail(user)}
        </p>
      </div>
    ),
  },
  {
    id: "availability",
    header: "Phone",
    sortable: true,
    sortValue: (user) => user.voiceAvailability,
    cell: (user) => (
      <span className="text-sm text-gray-600 dark:text-gray-300">
        {user.voiceAvailability.toLowerCase().replaceAll("_", " ")}
      </span>
    ),
  },
  {
    id: "created",
    header: "Created",
    sortable: true,
    sortValue: (user) => user.createdAt,
    cell: (user) => dateFormatter.format(new Date(user.createdAt)),
  },
];

function userSearchValue(user: UserTableRow) {
  return `${user.name} ${user.email} ${user.role} ${roleTemplateLabel(user.roleTemplate)} ${user.status} ${user.voiceAvailability} ${setupStatusLabel(user.setupLinkStatus)}`;
}

function renderUserRowActions(user: UserTableRow) {
  return (
    <>
      <UserSetupLinkForm
        userId={user.id}
        disabled={user.status !== "ACTIVE"}
        variant={user.setupLinkStatus === "PENDING" ? "resend" : "send"}
      />
      <UserDeleteForm userId={user.id} disabled={user.disabledActions} />
    </>
  );
}

export default function UsersTable({ users }: { users: UserTableRow[] }) {
  return (
    <CrmDataTable
      data={users}
      columns={columns}
      getRowId={(user) => user.id}
      searchPlaceholder="Search users..."
      initialPageSize={25}
      initialSort={{ columnId: "user", direction: "asc" }}
      emptyState="No users match this search."
      getSearchValue={userSearchValue}
      renderRowActions={renderUserRowActions}
    />
  );
}
