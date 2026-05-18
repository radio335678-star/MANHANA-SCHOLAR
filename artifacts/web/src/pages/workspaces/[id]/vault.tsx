import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@clerk/react";
import { 
  useGetWorkspace,
  useListVaultResources,
  useCreateVaultResource,
  useDeleteVaultResource,
  getGetWorkspaceQueryKey,
  getListVaultResourcesQueryKey,
  getGetVaultSummaryQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Loader2, ArrowLeft, Database, Plus, FileText, Link as LinkIcon, Image as ImageIcon, Trash2, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const resourceSchema = z.object({
  title: z.string().min(1, "Title is required"),
  type: z.enum(["paper", "note", "reference", "image", "link"]),
  content: z.string().optional(),
  url: z.string().optional(),
  authors: z.string().optional(),
  year: z.coerce.number().optional(),
  journal: z.string().optional(),
});

type ResourceValues = z.infer<typeof resourceSchema>;

export default function WorkspaceVault({ id }: { id: string }) {
  const workspaceId = parseInt(id, 10);
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: workspace, isLoading: isWsLoading } = useGetWorkspace(workspaceId, {
    query: {
      enabled: !!workspaceId,
      queryKey: getGetWorkspaceQueryKey(workspaceId)
    }
  });

  const { data: resources, isLoading: isResLoading } = useListVaultResources(workspaceId, {
    query: {
      enabled: !!workspaceId,
      queryKey: getListVaultResourcesQueryKey(workspaceId)
    }
  });

  const createResource = useCreateVaultResource();
  const deleteResource = useDeleteVaultResource();

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
    }
  });

  const onSubmit = (data: ResourceValues) => {
    createResource.mutate({
      workspaceId,
      data
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListVaultResourcesQueryKey(workspaceId) });
        queryClient.invalidateQueries({ queryKey: getGetVaultSummaryQueryKey(workspaceId) });
        setIsDialogOpen(false);
        form.reset();
      }
    });
  };

  const handleDelete = (resourceId: number) => {
    if (!confirm("Delete this resource?")) return;
    deleteResource.mutate({ workspaceId, resourceId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListVaultResourcesQueryKey(workspaceId) });
        queryClient.invalidateQueries({ queryKey: getGetVaultSummaryQueryKey(workspaceId) });
      }
    });
  };

  if (isWsLoading || isResLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'paper': return <FileText className="w-4 h-4 text-primary" />;
      case 'link': return <LinkIcon className="w-4 h-4 text-blue-500" />;
      case 'image': return <ImageIcon className="w-4 h-4 text-purple-500" />;
      default: return <FileText className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div className="flex items-start gap-4">
          <Link href={`/workspaces/${workspaceId}`}>
            <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground mt-1">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-4 h-4 text-accent" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Research Vault</span>
            </div>
            <h1 className="text-3xl font-serif font-bold text-foreground">{workspace?.title}</h1>
          </div>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="shrink-0 shadow-sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Resource
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Add to Vault</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
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
                          <SelectItem value="reference">Reference</SelectItem>
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
                        <Input placeholder="Resource title..." {...field} />
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
                        <Input placeholder="https://..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {form.watch("type") === "paper" && (
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="authors"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Authors</FormLabel>
                          <FormControl>
                            <Input placeholder="Doe, J. et al." {...field} />
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
                )}

                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes / Content</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Add your notes here..." className="resize-none h-24" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="pt-4 flex justify-end">
                  <Button type="submit" disabled={createResource.isPending}>
                    {createResource.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Save Resource
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {resources && resources.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {resources.map((resource) => (
            <Card key={resource.id} className="border-border shadow-sm flex flex-col hover-elevate transition-all group">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center shrink-0">
                      {getTypeIcon(resource.type)}
                    </div>
                    <CardTitle className="font-serif text-lg leading-tight line-clamp-2">{resource.title}</CardTitle>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => { e.preventDefault(); handleDelete(resource.id); }}
                    disabled={deleteResource.isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {resource.type === 'paper' && (resource.authors || resource.year) && (
                  <CardDescription className="text-xs mt-2">
                    {resource.authors} {resource.year && `(${resource.year})`}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="flex-1 text-sm text-muted-foreground">
                {resource.content && (
                  <p className="line-clamp-3 leading-relaxed">{resource.content}</p>
                )}
              </CardContent>
              <CardFooter className="pt-4 border-t border-border bg-secondary/10 flex justify-between items-center text-xs">
                <span className="text-muted-foreground">{format(new Date(resource.createdAt), "MMM d, yyyy")}</span>
                {resource.url && (
                  <a href={resource.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                    Visit Link <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-24 border border-dashed border-border rounded-lg bg-secondary/20">
          <Database className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-serif font-medium text-foreground mb-2">Vault is empty</h3>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
            Store your research papers, links, and notes here to keep them organized.
          </p>
          <Button variant="outline" className="shadow-sm" onClick={() => setIsDialogOpen(true)}>Add First Resource</Button>
        </div>
      )}
    </div>
  );
}
