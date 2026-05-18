import { useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@clerk/react";
import { useGetProfile, useUpsertProfile, getGetProfileQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

const onboardingSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  email: z.string().email("Invalid email address"),
  domain: z.enum(["Allopathy", "Ayurveda", "Homeopathy", "Siddha", "Unani"], { required_error: "Domain is required" }),
  qualification: z.string().min(1, "Qualification is required"),
  collegeName: z.string().optional(),
  universityName: z.string().optional(),
  guideNames: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
});

type OnboardingValues = z.infer<typeof onboardingSchema>;

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { isLoaded, userId } = useAuth();
  const queryClient = useQueryClient();

  const { data: profile, isLoading: isProfileLoading } = useGetProfile({
    query: {
      enabled: !!userId,
      queryKey: getGetProfileQueryKey(),
      retry: false
    }
  });

  useEffect(() => {
    if (isLoaded && !userId) {
      setLocation("/sign-in");
    }
    if (profile?.onboardingComplete) {
      setLocation("/dashboard");
    }
  }, [isLoaded, userId, profile, setLocation]);

  const upsertProfile = useUpsertProfile();

  const form = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      fullName: "",
      email: "",
      domain: "Allopathy",
      qualification: "",
      collegeName: "",
      universityName: "",
      guideNames: "",
      city: "",
      state: "",
    }
  });

  const onSubmit = (data: OnboardingValues) => {
    upsertProfile.mutate({
      data: {
        ...data,
        onboardingComplete: true
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
        setLocation("/dashboard");
      }
    });
  };

  if (!isLoaded || isProfileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 py-12">
      <Card className="w-full max-w-2xl border-border shadow-sm">
        <CardHeader className="text-center pb-8 border-b border-border">
          <CardTitle className="font-serif text-3xl">Scholar Profile</CardTitle>
          <CardDescription className="text-base mt-2">
            Establish your academic identity before entering the workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Dr. Jane Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Academic Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="jane@university.edu" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="domain"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Medical Domain</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select domain" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Allopathy">Allopathy</SelectItem>
                          <SelectItem value="Ayurveda">Ayurveda</SelectItem>
                          <SelectItem value="Homeopathy">Homeopathy</SelectItem>
                          <SelectItem value="Siddha">Siddha</SelectItem>
                          <SelectItem value="Unani">Unani</SelectItem>
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
                      <FormLabel>Qualification / Degree</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. MD, MS, DNB" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="collegeName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>College / Institute</FormLabel>
                      <FormControl>
                        <Input placeholder="Name of your college" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="universityName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Affiliating University</FormLabel>
                      <FormControl>
                        <Input placeholder="Name of university" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="guideNames"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Guide / Mentor Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Dr. John Smith" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Mumbai" {...field} />
                      </FormControl>
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
                      <FormControl>
                        <Input placeholder="e.g. Maharashtra" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="pt-6 flex justify-end">
                <Button type="submit" size="lg" disabled={upsertProfile.isPending}>
                  {upsertProfile.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Enter Workspace
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
