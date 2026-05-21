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
  SidebarTrigger,
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
          <SidebarMenuItem>
            <div className="flex w-full items-center justify-center px-1 py-0.5 group-data-[collapsible=icon]:px-0">
              <SidebarTrigger
                className="h-8 w-8 shrink-0 border border-sidebar-border/80 bg-sidebar-accent/30 hover:bg-sidebar-accent"
                title="Collapse sidebar"
              />
            </div>
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

      <SidebarRail />
    </Sidebar>
  );
}
