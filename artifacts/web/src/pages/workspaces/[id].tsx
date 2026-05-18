import { useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import {
  useGetWorkspace,
  useGetWorkspaceProgress,
  useGetVaultSummary,
  useListSections,
  useUpdateWorkspace,
  getGetWorkspaceQueryKey,
  getGetWorkspaceProgressQueryKey,
  getGetVaultSummaryQueryKey,
  getListSectionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  ArrowLeft,
  PenTool,
  Database,
  Activity,
  LayoutList,
  CheckCircle2,
  Circle,
  Clock,
  BookOpen,
  Brain,
  Settings,
  Download,
  ChevronRight,
  FileText,
  Sparkles,
  FlaskConical,
  Shield,
  Zap,
  Edit3,
  AlertCircle,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@clerk/react";

const HUMANISER_LEVELS = [
  {
    level: 0,
    name: "Raw AI",
    description: "Pure model output — structured, clinical. No voice shaping.",
    example: "The study evaluated 80 participants. Results demonstrated statistical significance (p<0.05).",
  },
  {
    level: 1,
    name: "Lightly Humanised",
    description: "Minor transitions and rhythm improvements. Subtle.",
    example: "The study enrolled 80 participants. The results were statistically significant (p<0.05).",
  },
  {
    level: 2,
    name: "Scholar Voice",
    description: "Natural academic voice. Good flow. Recommended for most sections.",
    example: "Eighty participants were enrolled in this study. The observed findings achieved statistical significance at p<0.05.",
  },
  {
    level: 3,
    name: "Confident Prose",
    description: "Confident, assertive academic voice. Ideal for Discussion and Conclusion.",
    example: "This study enrolled 80 participants; the findings were statistically significant (p<0.05), reinforcing the study hypothesis.",
  },
  {
    level: 4,
    name: "Distinctive Scholar",
    description: "Highly distinctive academic voice. Maximum humanisation. Use with care.",
    example: "In the present investigation, 80 participants were recruited; notably, the results attained statistical significance (p<0.05), lending credence to the hypothesis.",
  },
];

const PRE_THESIS_CHECKLIST = [
  {
    id: "title",
    label: "Research Title Finalised",
    description: "Title approved by guide and department",
    required: true,
  },
  {
    id: "protocol",
    label: "Protocol Registered",
    description: "CTRI/IEC protocol number obtained",
    required: true,
  },
  {
    id: "ethics",
    label: "Ethics Clearance",
    description: "IEC/IRB certificate in hand",
    required: true,
  },
  {
    id: "guide",
    label: "Guide & Co-Guide Assigned",
    description: "Names and designations confirmed",
    required: true,
  },
  {
    id: "university",
    label: "University Guidelines Fetched",
    description: "Format, font, margin, citation style downloaded",
    required: true,
  },
  {
    id: "synopsis",
    label: "Synopsis Submitted",
    description: "Synopsis approved and filed with university",
    required: false,
  },
  {
    id: "sample",
    label: "Sample Size Calculated",
    description: "Statistical justification documented",
    required: true,
  },
  {
    id: "inclusion",
    label: "Inclusion/Exclusion Criteria Defined",
    description: "Criteria documented in protocol",
    required: true,
  },
];

export default function WorkspaceDetail({ id }: { id: string }) {
  const workspaceId = parseInt(id, 10);
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [humaniserLevel, setHumaniserLevel] = useState(2);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [notesText, setNotesText] = useState("");
  const [exporting, setExporting] = useState(false);

  const { data: workspace, isLoading: isWsLoading } = useGetWorkspace(workspaceId, {
    query: { enabled: !!workspaceId, queryKey: getGetWorkspaceQueryKey(workspaceId) },
  });

  const { data: progress } = useGetWorkspaceProgress(workspaceId, {
    query: { enabled: !!workspaceId, queryKey: getGetWorkspaceProgressQueryKey(workspaceId) },
  });

  const { data: vaultSummary } = useGetVaultSummary(workspaceId, {
    query: { enabled: !!workspaceId, queryKey: getGetVaultSummaryQueryKey(workspaceId) },
  });

  const { data: sections } = useListSections(workspaceId, {
    query: { enabled: !!workspaceId, queryKey: getListSectionsQueryKey(workspaceId) },
  });

  const updateWorkspace = useUpdateWorkspace();

  const handleExport = async () => {
    setExporting(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/workspaces/${workspaceId}/export/docx`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${workspace?.title ?? "thesis"}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Thesis exported", description: "DOCX downloaded successfully." });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  if (isWsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!workspace) {
    return <div className="p-8 text-center text-muted-foreground">Workspace not found</div>;
  }

  const completionPercent = progress?.percentComplete ?? 0;
  const totalWords = sections?.reduce((acc, s) => acc + (s.wordCount ?? 0), 0) ?? 0;
  const estPages = Math.ceil(totalWords / 250);
  const checkedCount = Object.values(checkedItems).filter(Boolean).length;
  const preThesisPercent = Math.round((checkedCount / PRE_THESIS_CHECKLIST.length) * 100);

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/workspaces">
          <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground mt-0.5">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-medium">{workspace.domain}</Badge>
            {workspace.qualification && (
              <Badge variant="outline" className="font-medium">{workspace.qualification}</Badge>
            )}
            <Badge
              variant="outline"
              className={cn(
                "capitalize font-medium",
                workspace.status === "active"
                  ? "border-primary/30 text-primary bg-primary/5"
                  : workspace.status === "completed"
                  ? "border-green-300 text-green-700 bg-green-50"
                  : "border-border text-muted-foreground"
              )}
            >
              {workspace.status.replace("_", " ")}
            </Badge>
          </div>
          <h1 className="text-3xl font-serif font-bold text-foreground leading-tight">{workspace.title}</h1>
          {workspace.description && (
            <p className="text-muted-foreground max-w-3xl leading-relaxed">{workspace.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-5 pt-1 text-sm text-muted-foreground">
            {workspace.guideName && (
              <span className="flex items-center gap-1.5">
                <PenTool className="w-3.5 h-3.5" /> Guide: {workspace.guideName}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" /> Updated {format(new Date(workspace.updatedAt), "MMM d, yyyy")}
            </span>
            {totalWords > 0 && (
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> {totalWords.toLocaleString()} words · ~{estPages} pages
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
            className="gap-1.5"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Export DOCX
          </Button>
          <Link href={`/workspaces/${workspace.id}/editor`}>
            <Button size="sm" className="gap-1.5">
              <Edit3 className="w-3.5 h-3.5" /> Open Editor
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Completion",
            value: `${completionPercent}%`,
            sub: `${progress?.completedSections ?? 0}/${progress?.totalSections ?? 0} sections`,
            icon: <CheckCircle2 className="w-4 h-4 text-primary" />,
            color: "text-primary",
          },
          {
            label: "Word Count",
            value: totalWords.toLocaleString(),
            sub: `~${estPages} pages`,
            icon: <FileText className="w-4 h-4 text-foreground" />,
            color: "text-foreground",
          },
          {
            label: "Vault Resources",
            value: vaultSummary?.total ?? 0,
            sub: `${vaultSummary?.byType?.paper ?? 0} papers`,
            icon: <Database className="w-4 h-4 text-amber-500" />,
            color: "text-amber-500",
          },
          {
            label: "Pre-Thesis",
            value: `${preThesisPercent}%`,
            sub: `${checkedCount}/${PRE_THESIS_CHECKLIST.length} items`,
            icon: <Shield className="w-4 h-4 text-green-500" />,
            color: "text-green-600",
          },
        ].map((stat) => (
          <Card key={stat.label} className="border-border shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{stat.label}</span>
                {stat.icon}
              </div>
              <div className={cn("text-2xl font-serif font-bold", stat.color)}>{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{stat.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start bg-transparent border-b border-border rounded-none h-auto p-0 gap-0">
          {[
            { id: "overview", label: "Overview", icon: <LayoutList className="w-3.5 h-3.5" /> },
            { id: "pre-thesis", label: "Pre-Thesis Setup", icon: <Shield className="w-3.5 h-3.5" /> },
            { id: "humaniser", label: "AI Humaniser", icon: <Brain className="w-3.5 h-3.5" /> },
            { id: "vault", label: "Research Vault", icon: <Database className="w-3.5 h-3.5" /> },
            { id: "activity", label: "Activity", icon: <Activity className="w-3.5 h-3.5" /> },
          ].map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="flex items-center gap-1.5 px-4 py-3 text-sm rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {tab.icon} {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          {/* Progress Bar */}
          <div className="space-y-3 p-5 bg-card border border-border rounded-xl shadow-sm">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">Manuscript Progress</span>
              <span className="font-bold text-primary">{completionPercent}%</span>
            </div>
            <Progress value={completionPercent} className="h-2.5" />
            <div className="grid grid-cols-3 gap-4 pt-2">
              {[
                { label: "Not Started", value: progress?.notStartedSections ?? 0, color: "text-muted-foreground", bg: "bg-muted/30" },
                { label: "In Progress", value: progress?.inProgressSections ?? 0, color: "text-amber-600", bg: "bg-amber-50 border border-amber-100" },
                { label: "Completed", value: progress?.completedSections ?? 0, color: "text-primary", bg: "bg-primary/5 border border-primary/10" },
              ].map((stat) => (
                <div key={stat.label} className={cn("text-center p-3 rounded-lg", stat.bg)}>
                  <div className={cn("text-2xl font-serif font-bold", stat.color)}>{stat.value}</div>
                  <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Sections List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-serif font-semibold">Sections</h2>
              <Link href={`/workspaces/${workspace.id}/editor`}>
                <Button variant="ghost" size="sm" className="gap-1.5 text-primary text-xs">
                  Open Editor <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden divide-y divide-border">
              {sections && sections.length > 0 ? (
                sections.map((section, i) => (
                  <div
                    key={section.id}
                    className="px-5 py-3.5 flex items-center justify-between hover:bg-secondary/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-muted-foreground/50 w-5">{String(i + 1).padStart(2, "0")}</span>
                      <div
                        className={cn(
                          "w-2 h-2 rounded-full shrink-0",
                          section.status === "completed"
                            ? "bg-primary"
                            : section.status === "in_progress"
                            ? "bg-amber-500"
                            : "bg-muted-foreground/20"
                        )}
                      />
                      <span className="font-medium text-foreground text-sm">{section.title}</span>
                      {section.status === "in_progress" && (
                        <Badge variant="outline" className="text-xs border-amber-200 text-amber-600 bg-amber-50">In Progress</Badge>
                      )}
                      {section.status === "completed" && (
                        <Badge variant="outline" className="text-xs border-primary/20 text-primary bg-primary/5">Complete</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-5 text-sm text-muted-foreground">
                      <span className="w-20 text-right text-xs">{(section.wordCount ?? 0).toLocaleString()} words</span>
                      <Link href={`/workspaces/${workspace.id}/editor?section=${section.id}`}>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-primary px-2 gap-1">
                          <Edit3 className="w-3 h-3" /> Edit
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-10 text-center space-y-3">
                  <FileText className="w-10 h-10 mx-auto text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">No sections yet.</p>
                  <Link href={`/workspaces/${workspace.id}/editor`}>
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <Edit3 className="w-3.5 h-3.5" /> Open Editor to Add Sections
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Pre-Thesis Setup Tab */}
        <TabsContent value="pre-thesis" className="mt-6 space-y-6">
          <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-lg text-sm">
            <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
            <div className="text-blue-700">
              Complete all required items before starting to write. MANTHANA uses these inputs as locked context for all AI-generated content — your sample size, ethics number, and drug names will be consistent across every section.
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {PRE_THESIS_CHECKLIST.map((item) => {
              const isChecked = checkedItems[item.id] ?? false;
              return (
                <button
                  key={item.id}
                  onClick={() => setCheckedItems((prev) => ({ ...prev, [item.id]: !isChecked }))}
                  className={cn(
                    "flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all",
                    isChecked
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-primary/30"
                  )}
                >
                  <div className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-colors",
                    isChecked ? "bg-primary" : "border-2 border-border"
                  )}>
                    {isChecked && <CheckCircle2 className="w-4 h-4 text-white" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn("font-medium text-sm", isChecked ? "text-primary" : "text-foreground")}>
                        {item.label}
                      </span>
                      {item.required && (
                        <Badge variant="outline" className="text-xs border-red-200 text-red-600 bg-red-50">Required</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="p-5 bg-card border border-border rounded-xl shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-serif font-semibold">Pre-Thesis Completion</h3>
              <span className={cn(
                "text-sm font-bold",
                preThesisPercent === 100 ? "text-green-600" : preThesisPercent >= 50 ? "text-amber-600" : "text-muted-foreground"
              )}>
                {preThesisPercent}%
              </span>
            </div>
            <Progress value={preThesisPercent} className="h-2" />
            {preThesisPercent === 100 ? (
              <p className="text-xs text-green-600 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Pre-thesis setup complete. AI writing context is locked and ready.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> Complete all required items to lock AI context for consistent writing.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Research Notes (locked context for AI)</Label>
            <Textarea
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              placeholder="Enter key details the AI should always know: sample size (e.g. n=80), drug name and dose (e.g. Triphala Churna 3g BD), ethics number (IEC/2024/XXX), study design, primary outcome measure…"
              rows={6}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              This text is injected as system context into every AI generation and chat for this workspace.
            </p>
          </div>
        </TabsContent>

        {/* AI Humaniser Tab */}
        <TabsContent value="humaniser" className="mt-6 space-y-6">
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-100 rounded-lg text-sm">
            <Sparkles className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-amber-700">
              The Humaniser shapes how the AI writes your thesis. Higher levels produce more distinctive, natural academic prose. Set this before generating sections — it applies globally to this workspace.
            </div>
          </div>

          <div className="p-6 bg-card border border-border rounded-xl shadow-sm space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-serif font-semibold text-lg">
                    Level {humaniserLevel} — {HUMANISER_LEVELS[humaniserLevel].name}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{HUMANISER_LEVELS[humaniserLevel].description}</p>
                </div>
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold",
                  humaniserLevel <= 1 ? "bg-secondary text-muted-foreground" :
                  humaniserLevel === 2 ? "bg-primary/10 text-primary" :
                  humaniserLevel === 3 ? "bg-amber-100 text-amber-700" :
                  "bg-purple-100 text-purple-700"
                )}>
                  L{humaniserLevel}
                </div>
              </div>
              <Slider
                value={[humaniserLevel]}
                onValueChange={([v]) => setHumaniserLevel(v)}
                min={0}
                max={4}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                {HUMANISER_LEVELS.map((l) => (
                  <span key={l.level} className={cn("font-medium", humaniserLevel === l.level && "text-primary")}>{l.name.split(" ")[0]}</span>
                ))}
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Example output at this level</p>
              <div className="p-4 bg-secondary/30 rounded-lg border border-border text-sm italic text-foreground leading-relaxed">
                "{HUMANISER_LEVELS[humaniserLevel].example}"
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {HUMANISER_LEVELS.map((l) => (
              <button
                key={l.level}
                onClick={() => setHumaniserLevel(l.level)}
                className={cn(
                  "p-4 rounded-xl border-2 text-left transition-all",
                  humaniserLevel === l.level
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-primary/30"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-muted-foreground">Level {l.level}</span>
                  {humaniserLevel === l.level && <CheckCircle2 className="w-4 h-4 text-primary" />}
                </div>
                <p className="font-serif font-semibold text-sm text-foreground">{l.name}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{l.description}</p>
              </button>
            ))}
          </div>
        </TabsContent>

        {/* Vault Tab */}
        <TabsContent value="vault" className="mt-6">
          <div className="grid sm:grid-cols-3 gap-6">
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Papers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-serif font-bold text-foreground">{vaultSummary?.byType?.paper ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Research articles uploaded</p>
              </CardContent>
            </Card>
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-serif font-bold text-foreground">{vaultSummary?.byType?.note ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Personal research notes</p>
              </CardContent>
            </Card>
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">References</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-serif font-bold text-foreground">{vaultSummary?.byType?.reference ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Citations & bibliographic entries</p>
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 p-8 bg-card border border-dashed border-border rounded-xl text-center space-y-4">
            <Database className="w-10 h-10 mx-auto text-muted-foreground/30" />
            <div>
              <p className="font-serif font-semibold text-lg text-foreground">Research Vault</p>
              <p className="text-sm text-muted-foreground mt-1">
                Upload PDFs, add notes, save URLs, and import references. The AI draws from your vault when writing every section.
              </p>
            </div>
            <Link href={`/workspaces/${workspace.id}/vault`}>
              <Button className="gap-2">
                <Database className="w-4 h-4" /> Open Research Vault
              </Button>
            </Link>
          </div>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="mt-6">
          <div className="space-y-4">
            <h3 className="font-serif font-semibold">Workspace Information</h3>
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden divide-y divide-border">
              {[
                { label: "Title", value: workspace.title },
                { label: "Domain", value: workspace.domain },
                { label: "Qualification", value: workspace.qualification ?? "—" },
                { label: "Guide", value: workspace.guideName ?? "—" },
                { label: "Status", value: workspace.status.replace("_", " "), capitalize: true },
                { label: "Created", value: format(new Date(workspace.createdAt), "MMMM d, yyyy") },
                { label: "Last Updated", value: format(new Date(workspace.updatedAt), "MMMM d, yyyy h:mm a") },
                { label: "Total Words", value: totalWords.toLocaleString() },
                { label: "Estimated Pages", value: `~${estPages}` },
              ].map((row) => (
                <div key={row.label} className="flex px-5 py-3 text-sm">
                  <span className="w-36 text-muted-foreground font-medium shrink-0">{row.label}</span>
                  <span className={cn("text-foreground", row.capitalize && "capitalize")}>{row.value}</span>
                </div>
              ))}
            </div>

            {workspace.description && (
              <div className="space-y-2">
                <h3 className="font-serif font-semibold">Description</h3>
                <div className="p-5 bg-card border border-border rounded-xl shadow-sm text-sm text-muted-foreground leading-relaxed">
                  {workspace.description}
                </div>
              </div>
            )}

            <div className="p-4 bg-secondary/20 border border-border rounded-xl flex items-start gap-3 text-sm">
              <Zap className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div className="text-muted-foreground">
                Activity timeline and version history will be available in an upcoming update. All section edits are auto-saved.
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
