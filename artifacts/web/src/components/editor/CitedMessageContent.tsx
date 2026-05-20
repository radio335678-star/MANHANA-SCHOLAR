import type { ReactNode } from "react";
import type { VaultCitationCatalog } from "@workspace/vault-citations";
import { cn } from "@/lib/utils";

const KEY_RE = /\[V(\d+)\]/gi;

type Props = {
  content: string;
  catalog: VaultCitationCatalog;
  className?: string;
};

export function CitedMessageContent({ content, catalog, className }: Props) {
  const parts: ReactNode[] = [];
  let last = 0;
  let i = 0;

  for (const m of content.matchAll(KEY_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) {
      parts.push(content.slice(last, idx));
    }
    const key = `V${m[1]}`;
    const entry = catalog[key];
    parts.push(
      <span
        key={`${key}-${i++}`}
        title={entry ? `${entry.title} — ${entry.authorYear}` : "Unknown vault source"}
        className={cn(
          "rounded px-0.5 font-medium",
          entry ? "bg-primary/15 text-primary" : "bg-destructive/10 text-destructive"
        )}
      >
        [{key}]
        {entry && (
          <span className="text-[10px] font-normal text-muted-foreground ml-0.5">
            ({entry.authorYear})
          </span>
        )}
      </span>
    );
    last = idx + m[0].length;
  }

  if (last < content.length) {
    parts.push(content.slice(last));
  }

  return <span className={className}>{parts.length ? parts : content}</span>;
}
