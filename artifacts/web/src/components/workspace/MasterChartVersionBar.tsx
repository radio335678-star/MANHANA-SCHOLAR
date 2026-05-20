import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Database, Trash2 } from "lucide-react";

export type VersionMeta = {
  version: number;
  modelUsed?: string | null;
  vaultResourceId?: number | null;
  available: boolean;
};

export function MasterChartVersionBar({
  versions,
  selectedVersion,
  currentVersion,
  onSelect,
  onDelete,
  deletingVersion,
}: {
  versions: VersionMeta[];
  selectedVersion: number;
  currentVersion: number;
  onSelect: (version: number) => void;
  onDelete?: (version: number) => void;
  deletingVersion?: number | null;
}) {
  if (versions.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
      <span className="text-xs text-muted-foreground shrink-0 font-medium uppercase tracking-wider">
        Versions
      </span>
      {versions.map((v) => {
        const isSelected = v.version === selectedVersion;
        const isCurrent = v.version === currentVersion;
        const isDeleting = deletingVersion === v.version;
        return (
          <div key={v.version} className="flex items-center shrink-0">
            <Button
              type="button"
              variant={isSelected ? "default" : "outline"}
              size="sm"
              disabled={!v.available || isDeleting}
              className={cn("h-8 gap-1.5 px-3 rounded-r-none", !v.available && "opacity-50")}
              onClick={() => onSelect(v.version)}
            >
              v{v.version}
              {isCurrent && (
                <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 ml-0.5">
                  current
                </Badge>
              )}
              {v.vaultResourceId ? (
                <span title="Saved to vault">
                  <Database className="w-3 h-3 text-green-600" />
                </span>
              ) : null}
            </Button>
            {onDelete && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isDeleting}
                className="h-8 px-2 rounded-l-none border-l-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                title={`Delete v${v.version}`}
                onClick={() => onDelete(v.version)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
