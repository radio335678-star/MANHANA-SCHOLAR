import { useCallback, useRef, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  useGetWorkspace,
  useListVaultResources,
  useCreateVaultResource,
  useDeleteVaultResource,
  getGetWorkspaceQueryKey,
  getListVaultResourcesQueryKey,
  getGetVaultSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import {
  Loader2,
  ArrowLeft,
  Database,
  Plus,
  FileText,
  Link as LinkIcon,
  Image as ImageIcon,
  Trash2,
  ExternalLink,
  Upload,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { buildCitationCatalog } from "@workspace/vault-citations";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  VAULT_ACCEPT,
  VAULT_MAX_BYTES,
  uploadVaultResource,
  getVaultDownloadUrl,
  fileExtension,
  type VaultResourceExtended,
} from "@/lib/vaultUpload";

const resourceSchema = z.object({
  title: z.string().min(1, "Title is required"),
  type: z.enum(["paper", "note", "reference", "image", "link"]),
  content: z.string().optional(),
  url: z.string().optional(),
  authors: z.string().optional(),
  year: z.coerce.number().optional(),
  journal: z.string().optional(),
  doi: z.string().optional(),
});

type ResourceValues = z.infer<typeof resourceSchema>;

function getTypeIcon(resource: VaultResourceExtended) {
  const ext = fileExtension(resource.title);
  if (resource.type === "image" || ext.match(/\.(png|jpe?g|webp|gif|bmp|tiff?)$/)) {
    return <ImageIcon className="w-4 h-4 text-purple-500" />;
  }
  if (resource.type === "link") return <LinkIcon className="w-4 h-4 text-blue-500" />;
  if (ext.match(/\.(xlsx?|csv)$/)) {
    return <FileSpreadsheet className="w-4 h-4 text-emerald-600" />;
  }
  if (resource.storagePath || ext.match(/\.(pdf|docx?)$/)) {
    return <FileText className="w-4 h-4 text-primary" />;
  }
  return <FileText className="w-4 h-4 text-muted-foreground" />;
}

function StatusBadge({ status }: { status?: string }) {
  if (!status || status === "ready") return null;
  if (status === "pending" || status === "processing") {
    return (
      <Badge variant="secondary" className="text-[10px] gap-1">
        <Loader2 className="w-2.5 h-2.5 animate-spin" />
        Extracting…
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive" className="text-[10px] gap-1">
        <AlertCircle className="w-2.5 h-2.5" />
        Failed
      </Badge>
    );
  }
  return null;
}

export default function WorkspaceVault({ id }: { id: string }) {
  const workspaceId = parseInt(id, 10);
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadNotes, setUploadNotes] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: workspace, isLoading: isWsLoading } = useGetWorkspace(workspaceId, {
    query: {
      enabled: !!workspaceId,
      queryKey: getGetWorkspaceQueryKey(workspaceId),
    },
  });

  const { data: resources, isLoading: isResLoading } = useListVaultResources(workspaceId, {
    query: {
      enabled: !!workspaceId,
      queryKey: getListVaultResourcesQueryKey(workspaceId),
    },
  });

  const typedResources = (resources ?? []) as VaultResourceExtended[];

  const createResource = useCreateVaultResource();
  const deleteResource = useDeleteVaultResource();

  const invalidateVault = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListVaultResourcesQueryKey(workspaceId) });
    queryClient.invalidateQueries({ queryKey: getGetVaultSummaryQueryKey(workspaceId) });
    queryClient.invalidateQueries({ queryKey: ["vault-citation-catalog", workspaceId] });
  }, [queryClient, workspaceId]);

  const form = useForm<ResourceValues>({
    resolver: zodResolver(resourceSchema),
    defaultValues: {
      title: "",
      type: "note",
      content: "",
      url: "",
      authors: "",
      year: new Date().getFullYear(),
      journal: "",
      doi: "",
    },
  });

  const onSubmit = (data: ResourceValues) => {
    createResource.mutate(
      { workspaceId, data },
      {
        onSuccess: () => {
          invalidateVault();
          setIsDialogOpen(false);
          form.reset();
        },
      },
    );
  };

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;

    setUploading(true);
    setUploadError(null);

    const errors: string[] = [];
    for (const file of list) {
      if (file.size > VAULT_MAX_BYTES) {
        errors.push(`"${file.name}" exceeds 25 MB`);
        continue;
      }
      try {
        await uploadVaultResource(workspaceId, file, getToken, {
          content: uploadNotes.trim() || undefined,
        });
      } catch (err) {
        errors.push(
          `"${file.name}": ${err instanceof Error ? err.message : "upload failed"}`,
        );
      }
    }

    setUploading(false);
    invalidateVault();

    if (errors.length === list.length) {
      setUploadError(errors.join("\n"));
    } else if (errors.length > 0) {
      setUploadError(`Some files failed:\n${errors.join("\n")}`);
      setUploadNotes("");
      setIsDialogOpen(false);
    } else {
      setUploadNotes("");
      setIsDialogOpen(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (uploading) return;
    void uploadFiles(e.dataTransfer.files);
  };

  const handleDelete = (resourceId: number) => {
    if (!confirm("Delete this resource?")) return;
    deleteResource.mutate(
      { workspaceId, resourceId },
      { onSuccess: invalidateVault },
    );
  };

  const handleDownload = async (resourceId: number) => {
    try {
      const url = await getVaultDownloadUrl(workspaceId, resourceId, getToken);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      alert("Could not download file. Try again later.");
    }
  };

  const citationCatalog = typedResources.length
    ? buildCitationCatalog(
        typedResources.map((r) => ({
          id: r.id,
          type: r.type,
          title: r.title,
          content: r.content,
          authors: r.authors,
          year: r.year,
          journal: r.journal,
          doi: r.doi,
          url: r.url,
        })),
      )
    : {};

  const keyByResourceId = Object.fromEntries(
    Object.values(citationCatalog).map((e) => [e.resourceId, e.key]),
  );

  if (isWsLoading || isResLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div className="flex items-start gap-4">
          <Link href={`/workspaces/${workspaceId}`}>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground hover:text-foreground mt-1"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-4 h-4 text-accent" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Research Vault
              </span>
            </div>
            <h1 className="text-3xl font-serif font-bold text-foreground">{workspace?.title}</h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-xl">
              Upload PDFs, Word docs, Excel master charts, images, and notes. AI extracts text so
              writing and datasets can cite your sources as <strong>[V1], [V2]</strong>.
            </p>
          </div>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="shrink-0 shadow-sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Resource
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add to Vault</DialogTitle>
            </DialogHeader>

            <Tabs defaultValue="upload" className="pt-2">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="upload" className="gap-2">
                  <Upload className="w-3.5 h-3.5" />
                  Upload files
                </TabsTrigger>
                <TabsTrigger value="manual">Add manually</TabsTrigger>
              </TabsList>

              <TabsContent value="upload" className="space-y-4 mt-4">
                <div
                  role="button"
                  tabIndex={0}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
                  }}
                  className={cn(
                    "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
                    dragOver
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 hover:bg-muted/30",
                    uploading && "pointer-events-none opacity-60",
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    multiple
                    accept={VAULT_ACCEPT}
                    onChange={(e) => {
                      if (e.target.files?.length) void uploadFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  {uploading ? (
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="w-10 h-10 animate-spin text-primary" />
                      <p className="text-sm font-medium">Uploading and extracting text for AI…</p>
                      <p className="text-xs text-muted-foreground">This may take a minute for large PDFs</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <Upload className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Drop files here or click to browse</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          PDF, Word (DOC/DOCX), Excel (XLS/XLSX), CSV, images — max 25 MB each
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="vault-upload-notes">
                    Notes for AI (optional)
                  </label>
                  <Textarea
                    id="vault-upload-notes"
                    value={uploadNotes}
                    onChange={(e) => setUploadNotes(e.target.value)}
                    placeholder="e.g. Primary RCT paper; use Table 2 for inclusion criteria…"
                    className="resize-none h-20 text-sm"
                    disabled={uploading}
                  />
                </div>

                {uploadError && (
                  <p className="text-sm text-destructive whitespace-pre-wrap rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    {uploadError}
                  </p>
                )}
              </TabsContent>

              <TabsContent value="manual" className="mt-4">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Resource Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="paper">Research Paper</SelectItem>
                              <SelectItem value="note">Note</SelectItem>
                              <SelectItem value="reference">Reference / Dataset</SelectItem>
                              <SelectItem value="link">Web Link</SelectItem>
                              <SelectItem value="image">Image</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Title</FormLabel>
                          <FormControl>
                            <Input placeholder="Resource title…" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>URL / Link (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="https://…" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {(form.watch("type") === "paper" || form.watch("type") === "reference") && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="authors"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Authors</FormLabel>
                                <FormControl>
                                  <Input placeholder="Sharma, R. et al." {...field} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="year"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Year</FormLabel>
                                <FormControl>
                                  <Input type="number" {...field} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>
                        <FormField
                          control={form.control}
                          name="journal"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Journal / Source</FormLabel>
                              <FormControl>
                                <Input placeholder="Journal of Ayurveda…" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="doi"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>DOI (optional)</FormLabel>
                              <FormControl>
                                <Input placeholder="10.1234/example" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </>
                    )}

                    <FormField
                      control={form.control}
                      name="content"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notes / Content</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Key findings, quotes, or summary for AI to cite…"
                              className="resize-none h-24"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="pt-2 flex justify-end">
                      <Button type="submit" disabled={createResource.isPending}>
                        {createResource.isPending && (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        )}
                        Save Resource
                      </Button>
                    </div>
                  </form>
                </Form>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      {typedResources.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {typedResources.map((resource) => (
            <Card
              key={resource.id}
              className="border-border shadow-sm flex flex-col hover-elevate transition-all group"
            >
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                      {getTypeIcon(resource)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="font-serif text-lg leading-tight line-clamp-2">
                        {resource.title}
                      </CardTitle>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {keyByResourceId[resource.id] && (
                          <Badge variant="secondary" className="text-[10px] font-mono">
                            [{keyByResourceId[resource.id]}]
                          </Badge>
                        )}
                        <StatusBadge status={resource.processingStatus} />
                        {resource.storagePath && resource.processingStatus === "ready" && (
                          <Badge variant="outline" className="text-[10px] gap-0.5 text-green-700">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            AI ready
                          </Badge>
                        )}
                        {resource.mimeType && (
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {fileExtension(resource.title) ||
                              resource.mimeType.split("/").pop()}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={() => handleDelete(resource.id)}
                    disabled={deleteResource.isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {(resource.authors || resource.year || resource.journal) && (
                  <CardDescription className="text-xs mt-2 space-y-0.5">
                    {resource.authors && <span>{resource.authors}</span>}
                    {resource.year && <span> ({resource.year})</span>}
                    {resource.journal && <span className="block italic">{resource.journal}</span>}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="flex-1 text-sm text-muted-foreground">
                {resource.content ? (
                  <p className="line-clamp-4 leading-relaxed">{resource.content}</p>
                ) : resource.storagePath && resource.processingStatus === "pending" ? (
                  <p className="italic text-xs flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Extracting content for AI…
                  </p>
                ) : null}
              </CardContent>
              <CardFooter className="pt-4 border-t border-border bg-secondary/10 flex justify-between items-center text-xs gap-2">
                <span className="text-muted-foreground shrink-0">
                  {format(new Date(resource.createdAt), "MMM d, yyyy")}
                </span>
                <div className="flex items-center gap-2">
                  {resource.storagePath && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-primary"
                      onClick={() => void handleDownload(resource.id)}
                    >
                      <Download className="w-3 h-3 mr-1" />
                      File
                    </Button>
                  )}
                  {resource.url && (
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-primary hover:underline"
                    >
                      Link <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-24 border border-dashed border-border rounded-lg bg-secondary/20">
          <Database className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-serif font-medium text-foreground mb-2">Vault is empty</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto text-sm">
            Upload your thesis PDFs, DOCX chapters, Excel master charts, CSV data, and images. AI
            will read them to improve citations and dataset generation.
          </p>
          <Button variant="outline" className="shadow-sm" onClick={() => setIsDialogOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Upload first file
          </Button>
        </div>
      )}
    </div>
  );
}
