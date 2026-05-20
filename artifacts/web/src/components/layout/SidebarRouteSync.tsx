import { useEffect } from "react";
import { useLocation } from "wouter";
import { useSidebar } from "@/components/ui/sidebar";

/** Closes the mobile drawer when the route changes. */
export function SidebarRouteSync() {
  const [location] = useLocation();
  const { setOpenMobile } = useSidebar();

  useEffect(() => {
    setOpenMobile(false);
  }, [location, setOpenMobile]);

  return null;
}
