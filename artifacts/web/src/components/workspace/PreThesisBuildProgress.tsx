import { Loader2, CheckCircle2, Circle, AlertCircle, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { TelemetryEvent } from "@/hooks/usePreThesisBuildStream";

const AGENTS = [
  { id: "agent_1", label: "University Guideline Fetcher", step: 1 },
  { id: "agent_2", label: "Structure Mapper", step: 2 },
  { id: "agent_3", label: "Chapter Blueprint Writer", step: 3 },
  { id: "agent_4", label: "Guidelines Validator", step: 4 },
  { id: "agent_5", label: "Reference MD Compiler", step: 5 },
  { id: "agent_6", label: "Quality Check", step: 6 },
] as const;

function agentStatus(
  agentId: string,
  telemetry: TelemetryEvent[],
  building: boolean,
): "pending" | "active" | "done" {
  const starts = telemetry.filter((t) => t.agent === agentId && t.type === "agent_start");
  const laterAgents = AGENTS.filter((a) => a.step > AGENTS.find((x) => x.id === agentId)!.step);
  const anyLaterStarted = laterAgents.some((a) =>
    telemetry.some((t) => t.agent === a.id && t.type === "agent_start"),
  );
  if (anyLaterStarted || telemetry.some((t) => t.type === "complete")) return "done";
  if (starts.length > 0 && building) return "active";
  if (starts.length > 0 && !building) return "done";
  return "pending";
}

type PreThesisBuildProgressProps = {
  workspaceTitle: string;
  telemetry: TelemetryEvent[];
  progress: number;
  building: boolean;
  error: string | null;
  onRetry?: () => void;
};

export function PreThesisBuildProgress({
  workspaceTitle,
  telemetry,
  progress,
  building,
  error,
  onRetry,
}: PreThesisBuildProgressProps) {
  const latestMessage = telemetry.length > 0 ? telemetry[telemetry.length - 1]?.message : "";

  return (
    <Card className="border-border shadow-lg max-w-3xl mx-auto">
      <CardHeader className="space-y-2">
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="w-5 h-5" />
          <span className="text-sm font-medium">AI Pre-Thesis Setup</span>
        </div>
        <CardTitle className="font-serif text-xl">{workspaceTitle}</CardTitle>
        <CardDescription>
          {error
            ? "Something went wrong while preparing your pre-thesis reference."
            : building
              ? "Running deep web research and compiling your university-ready pre-thesis structure…"
              : "Pre-thesis build finished."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Overall progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
          {latestMessage && building && (
            <p className="text-xs text-muted-foreground truncate">{latestMessage}</p>
          )}
        </div>

        <div className="grid gap-2">
          {AGENTS.map((agent) => {
            const status = agentStatus(agent.id, telemetry, building);
            return (
              <div
                key={agent.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                  status === "active" && "border-primary bg-primary/5",
                  status === "done" && "border-green-200 bg-green-50/50 dark:bg-green-950/20",
                )}
              >
                {status === "done" ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                ) : status === "active" ? (
                  <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                )}
                <span className="font-medium">
                  Agent {agent.step}: {agent.label}
                </span>
              </div>
            );
          })}
        </div>

        {telemetry.length > 0 && (
          <div className="rounded-lg border bg-muted/30 max-h-40 overflow-y-auto p-3 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground mb-2">Live activity</p>
            {telemetry.slice(-12).map((t, i) => (
              <p key={i} className="text-xs text-foreground/80 leading-relaxed">
                <span className="text-muted-foreground font-mono">
                  [{t.agent ?? t.type}]
                </span>{" "}
                {t.message}
              </p>
            ))}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <p>{error}</p>
              {onRetry && (
                <Button size="sm" variant="outline" onClick={onRetry} className="gap-2">
                  <RefreshCw className="w-3.5 h-3.5" /> Retry build
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
