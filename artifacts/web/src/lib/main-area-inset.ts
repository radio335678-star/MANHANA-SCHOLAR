import { cn } from "@/lib/utils";

/** Fixed positioning for chrome rails (header/banner) within the main pane beside the sidebar. */
export function mainAreaFixedClass(isMobile: boolean, sidebarCollapsed: boolean): string {
  if (isMobile) {
    return "left-0 right-0 w-full";
  }
  if (sidebarCollapsed) {
    return "left-[var(--sidebar-width-icon)] right-0 w-[calc(100%-var(--sidebar-width-icon))]";
  }
  return "left-[var(--sidebar-width)] right-0 w-[calc(100%-var(--sidebar-width))]";
}

export function mainAreaFixedCn(
  isMobile: boolean,
  sidebarCollapsed: boolean,
  edge: "top" | "bottom",
): string {
  return cn(
    "fixed z-40 px-3 sm:px-4",
    mainAreaFixedClass(isMobile, sidebarCollapsed),
    edge === "top" ? "top-0 pt-0" : "bottom-0 pb-0",
  );
}
