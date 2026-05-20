import { Link, useLocation } from "wouter";
import {
  BookOpen,
  LayoutDashboard,
  FileText,
  UserCircle,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, match: (path: string) => path === "/dashboard" },
  { href: "/workspaces", label: "Workspaces", icon: FileText, match: (path: string) => path.startsWith("/workspaces") },
  { href: "/profile", label: "Profile Settings", icon: UserCircle, match: (path: string) => path === "/profile" },
] as const;

function NavItems() {
  const [location] = useLocation();
  const { setOpenMobile, isMobile } = useSidebar();

  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <SidebarMenu>
      {NAV_ITEMS.map(({ href, label, icon: Icon, match }) => (
        <SidebarMenuItem key={href}>
          <SidebarMenuButton
            asChild
            isActive={match(location)}
            tooltip={label}
          >
            <Link href={href} onClick={closeMobile}>
              <Icon />
              <span>{label}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="MANTHANA">
              <Link href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                  <BookOpen className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-serif font-bold tracking-tight">MANTHANA</span>
                  <span className="truncate text-xs text-sidebar-foreground/70">Thesis workspace</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <NavItems />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <p className="px-2 py-1 text-[10px] text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
          Ctrl+B to toggle sidebar
        </p>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
