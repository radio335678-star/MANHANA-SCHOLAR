import { Link } from "wouter";
import { Database, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VaultCitationEntry } from "@workspace/vault-citations";

type Props = {
  workspaceId: number;
  resourceCount: number;
  catalog: VaultCitationEntry[];
  unknownKeys?: string[];
  className?: string;
};

export function VaultEvidenceBar({
  workspaceId,
  resourceCount,
  catalog,
  unknownKeys = [],
  className,
}: Props) {
  const hasSources = resourceCount > 0;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 px-4 py-2 border-b text-xs shrink-0",
        hasSources
          ? "bg-primary/5 border-primary/15 text-foreground"
          : "bg-amber-50 border-amber-200 text-amber-950",
        className
      )}
    >
      {hasSources ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
      ) : (
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
      )}
      <span className="font-medium">
        {hasSources
          ? `Evidence-backed AI: ${resourceCount} vault source${resourceCount === 1 ? "" : "s"}`
          : "No vault sources — add papers before citing"}
      </span>
      {hasSources && catalog.length > 0 && (
        <span className="text-muted-foreground hidden sm:inline">
          Citations use keys {catalog.slice(0, 4).map((c) => `[${c.key}]`).join(", ")}
          {catalog.length > 4 ? "…" : ""}
        </span>
      )}
      {unknownKeys.length > 0 && (
        <span className="text-destructive font-medium">
          Unverified keys: {unknownKeys.join(", ")}
        </span>
      )}
      <Button variant="outline" size="sm" className="h-7 text-xs ml-auto gap-1" asChild>
        <Link href={`/workspaces/${workspaceId}/vault`}>
          <Database className="w-3 h-3" />
          {hasSources ? "Manage vault" : "Add sources"}
          <ExternalLink className="w-3 h-3 opacity-50" />
        </Link>
      </Button>
    </div>
  );
}
