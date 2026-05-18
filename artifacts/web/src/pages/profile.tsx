import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetProfile, 
  useUpsertProfile,
  getGetProfileQueryKey 
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, UserCircle, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

const profileSchema = z.object({
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

type ProfileValues = z.infer<typeof profileSchema>;

export default function Profile() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: profile, isLoading } = useGetProfile({
    query: {
      enabled: !!userId,
      queryKey: getGetProfileQueryKey()
    }
  });

  const upsertProfile = useUpsertProfile();

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
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

  useEffect(() => {
    if (profile) {
      form.reset({
        fullName: profile.fullName || "",
        email: profile.email || "",
        domain: profile.domain as any || "Allopathy",
        qualification: profile.qualification || "",
        collegeName: profile.collegeName || "",
        universityName: profile.universityName || "",
        guideNames: profile.guideNames || "",
        city: profile.city || "",
        state: profile.state || "",
      });
    }
  }, [profile, form]);

  const onSubmit = (data: ProfileValues) => {
    upsertProfile.mutate({
      data: {
        ...data,
        onboardingComplete: true
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
        toast({
          title: "Profile Updated",
          description: "Your scholarly profile has been saved successfully.",
        });
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to update profile. Please try again.",
        });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground">Scholar Profile</h1>
        <p className="text-muted-foreground mt-1">Manage your personal and academic details.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="col-span-1 space-y-6">
          <Card className="border-border shadow-sm">
            <CardContent className="pt-6 flex flex-col items-center text-center space-y-4">
              <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center text-muted-foreground">
                <UserCircle className="w-12 h-12" />
              </div>
              <div>
                <h3 className="font-serif font-semibold text-xl">{profile?.fullName}</h3>
                <p className="text-sm text-muted-foreground">{profile?.email}</p>
              </div>
              <div className="flex flex-col gap-2 w-full pt-4 border-t border-border">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Domain</span>
                  <span className="font-medium">{profile?.domain}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Qualification</span>
                  <span className="font-medium">{profile?.qualification}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="col-span-1 md:col-span-2">
          <Card className="border-border shadow-sm">
            <CardHeader className="border-b border-border pb-4">
              <CardTitle className="font-serif text-xl">Edit Details</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
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
                            <Input {...field} />
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
                            <Input type="email" disabled {...field} className="bg-secondary/50 text-muted-foreground" />
                          </FormControl>
                          <FormDescription>Email cannot be changed.</FormDescription>
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
                          <Select onValueChange={field.onChange} value={field.value}>
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
                          <FormLabel>Qualification</FormLabel>
                          <FormControl>
                            <Input {...field} />
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
                            <Input {...field} />
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
                          <FormLabel>University</FormLabel>
                          <FormControl>
                            <Input {...field} />
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
                        <FormLabel>Guide / Mentor</FormLabel>
                        <FormControl>
                          <Input {...field} />
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
                            <Input {...field} />
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
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="pt-4 flex justify-end">
                    <Button type="submit" disabled={upsertProfile.isPending}>
                      {upsertProfile.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      Save Changes
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
