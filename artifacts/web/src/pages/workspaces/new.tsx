import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";

import {
  useListDomains,
  useListQualifications,
  useGetProfile,
  getListWorkspacesQueryKey,
  getGetProfileQueryKey,
} from "@workspace/api-client-react";
import { INDIAN_STATES_AND_UTS } from "@/lib/indian-states";
import { PreThesisChecklistGrid } from "@/components/workspace/PreThesisChecklistGrid";
import { PreThesisBuildProgress } from "@/components/workspace/PreThesisBuildProgress";
import { useWorkspaceBootstrap } from "@/hooks/useWorkspaceBootstrap";
import { usePreThesisBuildStream } from "@/hooks/usePreThesisBuildStream";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ArrowLeft, Upload, FileText } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

const workspaceSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters"),
  description: z.string().optional(),
  domain: z.string().min(1, "Domain is required"),
  qualification: z.string().optional(),
  guideName: z.string().optional(),
  coGuideName: z.string().optional(),
  collegeName: z.string().optional(),
  state: z.enum(INDIAN_STATES_AND_UTS).optional().or(z.literal("")),
  universityName: z.string().optional(),
  departmentId: z.coerce.number().int().positive().optional(),
  candidateName: z.string().optional(),
});

type WorkspaceValues = z.infer<typeof workspaceSchema>;

type Department = { id: number; domain: string; name: string; slug: string };

type BootstrapPhase = "form" | "building";

export default function NewWorkspace() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [phase, setPhase] = useState<BootstrapPhase>("form");
  const [submitting, setSubmitting] = useState(false);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [researchNotes, setResearchNotes] = useState("");
  const [synopsisFile, setSynopsisFile] = useState<File | null>(null);
  const [resourceFiles, setResourceFiles] = useState<File[]>([]);
  const [buildMeta, setBuildMeta] = useState<{
    workspaceId: number;
    workspaceTitle: string;
    jobId: number;
  } | null>(null);

  const synopsisRef = useRef<HTMLInputElement>(null);
  const resourcesRef = useRef<HTMLInputElement>(null);

  const { data: domains, isLoading: isDomainsLoading } = useListDomains();
  const { data: qualifications, isLoading: isQualificationsLoading } = useListQualifications();
  const { data: profile } = useGetProfile({
    query: { enabled: true, queryKey: getGetProfileQueryKey() },
  });

  const { runBootstrap, startBuildOnly } = useWorkspaceBootstrap(getToken);
  const { telemetry, building, progress, error, streamBuild, reset } = usePreThesisBuildStream();

  const form = useForm<WorkspaceValues>({
    resolver: zodResolver(workspaceSchema),
    defaultValues: {
      title: "",
      description: "",
      domain: "",
      qualification: "",
      guideName: "",
      coGuideName: "",
      collegeName: "",
      state: "",
      universityName: "",
      departmentId: undefined,
      candidateName: "",
    },
  });

  const title = form.watch("title");
  const guideName = form.watch("guideName");
  const coGuideName = form.watch("coGuideName");
  const selectedDomain = form.watch("domain");

  useEffect(() => {
    setChecklist((prev) => ({
      ...prev,
      title: Boolean(title?.trim()),
      guide: Boolean(guideName?.trim() || coGuideName?.trim()),
      synopsis: Boolean(synopsisFile),
    }));
  }, [title, guideName, coGuideName, synopsisFile]);

  useEffect(() => {
    if (!selectedDomain) {
      setDepartments([]);
      return;
    }
    void (async () => {
      try {
        const token = await getToken();
        const res = await fetch(
          `/api/reference/departments?domain=${encodeURIComponent(selectedDomain)}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );
        if (res.ok) setDepartments(await res.json());
      } catch {
        setDepartments([]);
      }
    })();
  }, [selectedDomain, getToken]);

  const finishAndNavigate = async (workspaceId: number) => {
    queryClient.invalidateQueries({ queryKey: getListWorkspacesQueryKey() });
    await new Promise((r) => setTimeout(r, 800));
    setLocation(`/workspaces/${workspaceId}?tab=pre-thesis&step=review&preview=overview`);
  };

  const onSubmit = async (data: WorkspaceValues) => {
    setSubmitting(true);
    try {
      const result = await runBootstrap({
        workspacePayload: {
          title: data.title,
          description: data.description,
          domain: data.domain,
          qualification: data.qualification,
          guideName: data.guideName,
          coGuideName: data.coGuideName?.trim() || undefined,
          collegeName: data.collegeName,
          state: data.state || undefined,
          universityName: data.universityName,
        },
        departmentId: data.departmentId,
        preThesisChecklist: checklist,
        researchNotes,
        candidateName: data.candidateName?.trim() || profile?.fullName || undefined,
        synopsisFile,
        resourceFiles,
      });

      if (result.warnings.length > 0) {
        result.warnings.forEach((w) =>
          toast({ title: "Note", description: w, variant: "default" }),
        );
      }

      setBuildMeta({
        workspaceId: result.workspaceId,
        workspaceTitle: result.workspaceTitle,
        jobId: result.jobId,
      });
      setPhase("building");
      reset();

      const outcome = await streamBuild(result.workspaceId, result.jobId, getToken);
      if (outcome === "complete") {
        await finishAndNavigate(result.workspaceId);
      }
    } catch (e) {
      toast({
        title: "Create workspace failed",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetryBuild = async () => {
    if (!buildMeta) return;
    reset();
    setPhase("building");
    try {
      const jobId = await startBuildOnly(buildMeta.workspaceId);
      setBuildMeta({ ...buildMeta, jobId });
      const outcome = await streamBuild(buildMeta.workspaceId, jobId, getToken);
      if (outcome === "complete") {
        await finishAndNavigate(buildMeta.workspaceId);
      }
    } catch {
      toast({ title: "Build failed", variant: "destructive" });
    }
  };

  if (isDomainsLoading || isQualificationsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (phase === "building" && buildMeta) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 py-8 animate-in fade-in duration-500">
        <PreThesisBuildProgress
          workspaceTitle={buildMeta.workspaceTitle}
          telemetry={telemetry}
          progress={progress}
          building={building || submitting}
          error={error}
          onRetry={handleRetryBuild}
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex items-center gap-4">
        <Link href="/workspaces">
          <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-serif font-bold text-foreground">Create New Workspace</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Set up your thesis profile — AI will research guidelines and prepare your pre-thesis automatically.
          </p>
        </div>
      </div>

      <Card className="border-border shadow-sm">
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="space-y-6">
                <div className="border-b border-border pb-2">
                  <h3 className="font-serif font-medium text-lg">Project Details</h3>
                </div>

                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter the full title of your thesis or research project"
                          className="font-serif text-lg"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description / Abstract (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Brief summary of your research topic..."
                          className="resize-none h-24"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-6">
                <div className="border-b border-border pb-2">
                  <h3 className="font-serif font-medium text-lg">Academic Context</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="domain"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Domain</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select domain" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {domains?.map((d) => (
                              <SelectItem key={d.id} value={d.name}>
                                {d.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="qualification"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Qualification Level</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select qualification" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {qualifications?.map((q) => (
                              <SelectItem key={q.id} value={q.name}>
                                {q.abbreviation} - {q.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="departmentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department / Specialty</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(Number(v))}
                        value={field.value ? String(field.value) : undefined}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={selectedDomain ? "Select department" : "Select domain first"}
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {departments.map((d) => (
                            <SelectItem key={d.id} value={String(d.id)}>
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>Required for production pre-thesis structure.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="guideName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Guide / Supervisor</FormLabel>
                        <FormControl>
                          <Input placeholder="Dr. First Last" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="collegeName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>College / Institute</FormLabel>
                        <FormControl>
                          <Input placeholder="Institute name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="coGuideName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Co-Guide (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Dr. First Last" {...field} />
                        </FormControl>
                        <FormDescription>Second supervisor, if applicable.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>State</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select state / UT" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {INDIAN_STATES_AND_UTS.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>State or union territory of your institution.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="border-b border-border pb-2">
                  <h3 className="font-serif font-medium text-lg">Pre-Thesis Checklist</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Confirm readiness items — same checklist used in Pre-Thesis Setup.
                  </p>
                </div>
                <PreThesisChecklistGrid value={checklist} onChange={setChecklist} />
              </div>

              <div className="space-y-4">
                <div className="border-b border-border pb-2">
                  <h3 className="font-serif font-medium text-lg">Research Materials (Optional)</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Uploading a synopsis and reference papers improves AI chapter blueprints. Files are saved to
                    your Research Vault.
                  </p>
                </div>

                <input
                  ref={synopsisRef}
                  type="file"
                  accept=".docx,.txt,.md,.pdf"
                  className="hidden"
                  onChange={(e) => setSynopsisFile(e.target.files?.[0] ?? null)}
                />
                <input
                  ref={resourcesRef}
                  type="file"
                  accept=".docx,.txt,.md,.pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => setResourceFiles(Array.from(e.target.files ?? []))}
                />

                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={() => synopsisRef.current?.click()}
                  >
                    <Upload className="w-4 h-4" />
                    {synopsisFile ? synopsisFile.name : "Upload synopsis"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={() => resourcesRef.current?.click()}
                  >
                    <FileText className="w-4 h-4" />
                    {resourceFiles.length > 0
                      ? `${resourceFiles.length} resource file(s)`
                      : "Add research papers / notes"}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Research notes (optional)</label>
                <Textarea
                  placeholder="Study design, sample size, key variables — used as locked AI context during pre-thesis build."
                  className="resize-none h-24"
                  value={researchNotes}
                  onChange={(e) => setResearchNotes(e.target.value)}
                />
              </div>

              <div className="pt-4 flex justify-end gap-4">
                <Link href="/workspaces">
                  <Button type="button" variant="ghost">
                    Cancel
                  </Button>
                </Link>
                <Button type="submit" disabled={submitting} className="min-w-[160px]">
                  {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Create Workspace
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
