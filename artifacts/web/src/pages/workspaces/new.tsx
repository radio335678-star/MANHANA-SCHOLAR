import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";

import { useCreateWorkspace, useListDomains, useListQualifications, getListWorkspacesQueryKey } from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const workspaceSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters"),
  description: z.string().optional(),
  domain: z.string().min(1, "Domain is required"),
  qualification: z.string().optional(),
  guideName: z.string().optional(),
  collegeName: z.string().optional(),
  universityName: z.string().optional(),
});

type WorkspaceValues = z.infer<typeof workspaceSchema>;

export default function NewWorkspace() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: domains, isLoading: isDomainsLoading } = useListDomains();
  const { data: qualifications, isLoading: isQualificationsLoading } = useListQualifications();
  const createWorkspace = useCreateWorkspace();

  const form = useForm<WorkspaceValues>({
    resolver: zodResolver(workspaceSchema),
    defaultValues: {
      title: "",
      description: "",
      domain: "",
      qualification: "",
      guideName: "",
      collegeName: "",
      universityName: "",
    }
  });

  const onSubmit = (data: WorkspaceValues) => {
    createWorkspace.mutate({ data }, {
      onSuccess: (workspace) => {
        queryClient.invalidateQueries({ queryKey: getListWorkspacesQueryKey() });
        setLocation(`/workspaces/${workspace.id}`);
      }
    });
  };

  if (isDomainsLoading || isQualificationsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Link href="/workspaces">
          <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-serif font-bold text-foreground">Create New Workspace</h1>
          <p className="text-sm text-muted-foreground mt-1">Set up a new thesis or research project.</p>
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
                        <Input placeholder="Enter the full title of your thesis or research project" className="font-serif text-lg" {...field} />
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
                        <Textarea placeholder="Brief summary of your research topic..." className="resize-none h-24" {...field} />
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
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select domain" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {domains?.map(d => (
                              <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
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
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select qualification" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {qualifications?.map(q => (
                              <SelectItem key={q.id} value={q.name}>{q.abbreviation} - {q.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

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
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-4">
                <Link href="/workspaces">
                  <Button type="button" variant="ghost">Cancel</Button>
                </Link>
                <Button type="submit" disabled={createWorkspace.isPending} className="min-w-[140px]">
                  {createWorkspace.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
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
