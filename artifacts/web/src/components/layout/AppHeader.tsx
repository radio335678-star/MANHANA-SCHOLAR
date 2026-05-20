import { SidebarTrigger } from "@/components/ui/sidebar";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 md:px-4">
      <SidebarTrigger className="-ml-1" />
      <span className="font-serif text-sm font-bold tracking-tight md:hidden">MANTHANA</span>
      <span className="ml-auto hidden text-[10px] text-muted-foreground lg:inline">
        <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">Ctrl</kbd>
        {" + "}
        <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">B</kbd>
        {" toggle sidebar"}
      </span>
    </header>
  );
}
