import type { SVGProps } from "react";

type SidebarIconProps = Omit<SVGProps<SVGSVGElement>, "name">;
export type SidebarIconName =
  | "boxes"
  | "chart-column"
  | "circle-dollar-sign"
  | "clipboard-list"
  | "folder-archive"
  | "headphones"
  | "inbox"
  | "layout-dashboard"
  | "list-todo"
  | "megaphone"
  | "minus"
  | "plus"
  | "settings"
  | "square-check-big"
  | "users-round";

export function SidebarIcon({
  name,
  ...props
}: SidebarIconProps & { name: SidebarIconName }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.9}
      viewBox="0 0 24 24"
      {...props}
    >
      <use href={`/images/sidebar-icons.svg#${name}`} />
    </svg>
  );
}

export const sidebarIcons = {
  boxes: <SidebarIcon name="boxes" />,
  chartColumn: <SidebarIcon name="chart-column" />,
  circleDollarSign: <SidebarIcon name="circle-dollar-sign" />,
  clipboardList: <SidebarIcon name="clipboard-list" />,
  folderArchive: <SidebarIcon name="folder-archive" />,
  headphones: <SidebarIcon name="headphones" />,
  inbox: <SidebarIcon name="inbox" />,
  layoutDashboard: <SidebarIcon name="layout-dashboard" />,
  listTodo: <SidebarIcon name="list-todo" />,
  megaphone: <SidebarIcon name="megaphone" />,
  settings: <SidebarIcon name="settings" />,
  squareCheckBig: <SidebarIcon name="square-check-big" />,
  usersRound: <SidebarIcon name="users-round" />,
} as const;

export function SidebarMinusIcon(props: SidebarIconProps) {
  return <SidebarIcon name="minus" {...props} />;
}

export function SidebarPlusIcon(props: SidebarIconProps) {
  return <SidebarIcon name="plus" {...props} />;
}
