import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useGetProfile, useUpsertProfile, getGetProfileQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ChevronRight, ChevronLeft, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const DOMAINS = [
  {
    id: "Allopathy",
    label: "Allopathy",
    regulator: "NMC",
    description: "Modern evidence-based medicine including MBBS, MD, MS, and surgical specialties.",
    color: "border-blue-200 hover:border-blue-400",
    activeColor: "border-blue-500 bg-blue-50",
  },
  {
    id: "Ayurveda",
    label: "Ayurveda",
    regulator: "NCISM",
    description: "Classical Indian system rooted in Charaka, Susruta Samhita. BAMS, MD Ayu.",
    color: "border-amber-200 hover:border-amber-400",
    activeColor: "border-amber-500 bg-amber-50",
  },
  {
    id: "Homeopathy",
    label: "Homeopathy",
    regulator: "NCH",
    description: "Principle of similars and potentization. BHMS, MD Hom specialties.",
    color: "border-teal-200 hover:border-teal-400",
    activeColor: "border-teal-500 bg-teal-50",
  },
  {
    id: "Siddha",
    label: "Siddha",
    regulator: "NCISM",
    description: "Tamil classical medicine, one of the oldest healing systems. BSMS, MD Siddha.",
    color: "border-purple-200 hover:border-purple-400",
    activeColor: "border-purple-500 bg-purple-50",
  },
  {
    id: "Unani",
    label: "Unani",
    regulator: "NCISM",
    description: "Greco-Arabic system of medicine based on humoral theory. BUMS, MD Unani.",
    color: "border-rose-200 hover:border-rose-400",
    activeColor: "border-rose-500 bg-rose-50",
  },
];

const QUALIFICATIONS_BY_DOMAIN: Record<string, string[]> = {
  Allopathy: ["MBBS", "MD", "MS", "MCh", "DM", "DNB", "PhD", "MPH", "MSc Medical"],
  Ayurveda: ["BAMS", "MD Ayu", "MS Ayu", "PhD Ayurveda", "PG Diploma Ayurveda"],
  Homeopathy: ["BHMS", "MD Hom", "PhD Homeopathy", "PG Diploma Homoeopathy"],
  Siddha: ["BSMS", "MD Siddha", "PhD Siddha"],
  Unani: ["BUMS", "MD Unani", "MS Unani", "PhD Unani"],
};

const STEPS = [
  { id: 1, label: "Medical Domain" },
  { id: 2, label: "Qualification" },
  { id: 3, label: "Institution" },
  { id: 4, label: "Profile Details" },
];

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { isLoaded, userId } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Form state
  const [domain, setDomain] = useState("");
  const [qualification, setQualification] = useState("");
  const [collegeName, setCollegeName] = useState("");
  const [universityName, setUniversityName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [guideNames, setGuideNames] = useState("");
  const [state, setState] = useState("");

  const { data: profile, isLoading: isProfileLoading } = useGetProfile({
    query: {
      enabled: !!userId,
      queryKey: getGetProfileQueryKey(),
      retry: false,
    },
  });

  useEffect(() => {
    if (isLoaded && !userId) setLocation("/sign-in");
    if (profile?.onboardingComplete) setLocation("/dashboard");
  }, [isLoaded, userId, profile, setLocation]);

  const upsertProfile = useUpsertProfile();

  const handleFinish = async () => {
    if (!fullName.trim() || !email.trim()) return;
    setSaving(true);
    upsertProfile.mutate(
      {
        data: {
          fullName,
          email,
          domain: domain as any,
          qualification,
          collegeName,
          universityName,
          guideNames,
          state,
          onboardingComplete: true,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
          setLocation("/dashboard");
        },
        onSettled: () => setSaving(false),
      }
    );
  };

  const canGoNext = () => {
    if (step === 1) return domain !== "";
    if (step === 2) return qualification !== "";
    if (step === 3) return true;
    if (step === 4) return fullName.trim() !== "" && email.trim() !== "";
    return false;
  };

  if (!isLoaded || isProfileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 border-b border-border bg-white">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <span className="font-serif font-bold text-lg text-[#1D4ED8]">MANTHANA-SCHOLER</span>
          <span className="text-sm text-muted-foreground">Scholar Setup</span>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center py-12 px-4">
        <div className="w-full max-w-3xl">
          {/* Step Progress */}
          <div className="flex items-center gap-0 mb-12">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center gap-2">
                  <div
                    className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all",
                      step > s.id
                        ? "bg-[#1D4ED8] text-white"
                        : step === s.id
                        ? "bg-[#1D4ED8] text-white ring-4 ring-blue-100"
                        : "bg-white border-2 border-border text-muted-foreground"
                    )}
                  >
                    {step > s.id ? <CheckCircle2 className="w-4 h-4" /> : s.id}
                  </div>
                  <span
                    className={cn(
                      "text-xs font-medium whitespace-nowrap",
                      step >= s.id ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "flex-1 h-0.5 mx-2 mb-5 transition-colors",
                      step > s.id ? "bg-[#1D4ED8]" : "bg-border"
                    )}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Step Content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-xl border border-border shadow-sm p-8"
            >
              {step === 1 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-serif font-bold text-foreground">Select Your Medical Domain</h2>
                    <p className="text-muted-foreground mt-1">This determines the guidelines, terminology, and AI assistance tailored for you.</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {DOMAINS.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => setDomain(d.id)}
                        className={cn(
                          "text-left p-5 rounded-lg border-2 transition-all",
                          domain === d.id ? d.activeColor : d.color + " bg-white"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-serif font-semibold text-foreground">{d.label}</span>
                          {domain === d.id && (
                            <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                          )}
                        </div>
                        <span className="text-xs font-medium text-muted-foreground mt-1 block uppercase tracking-wider">{d.regulator}</span>
                        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{d.description}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-serif font-bold text-foreground">Your Qualification</h2>
                    <p className="text-muted-foreground mt-1">Select the degree you are pursuing or writing the thesis for.</p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {(QUALIFICATIONS_BY_DOMAIN[domain] ?? []).map((q) => (
                      <button
                        key={q}
                        onClick={() => setQualification(q)}
                        className={cn(
                          "py-3 px-4 rounded-lg border-2 font-medium text-sm transition-all text-left",
                          qualification === q
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border bg-white hover:border-primary/40 text-foreground"
                        )}
                      >
                        {qualification === q && <CheckCircle2 className="w-3.5 h-3.5 inline mr-1.5" />}
                        {q}
                      </button>
                    ))}
                  </div>
                  <div className="pt-2">
                    <Label className="text-sm font-medium">Not listed? Enter manually</Label>
                    <Input
                      className="mt-1.5"
                      placeholder="e.g. Fellowship in Cardiology"
                      value={qualification}
                      onChange={(e) => setQualification(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-serif font-bold text-foreground">Your Institution</h2>
                    <p className="text-muted-foreground mt-1">This helps MANTHANA apply the correct university formatting guidelines.</p>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>College / Medical Institute</Label>
                      <Input
                        placeholder="e.g. Grant Medical College, Mumbai"
                        value={collegeName}
                        onChange={(e) => setCollegeName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Affiliating University</Label>
                      <Input
                        placeholder="e.g. Maharashtra University of Health Sciences"
                        value={universityName}
                        onChange={(e) => setUniversityName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>State</Label>
                      <Input
                        placeholder="e.g. Maharashtra"
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-serif font-bold text-foreground">Complete Your Profile</h2>
                    <p className="text-muted-foreground mt-1">Your name and guide will appear on your thesis title page.</p>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Full Name <span className="text-red-500">*</span></Label>
                      <Input
                        placeholder="Dr. Priya Sharma"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Academic Email <span className="text-red-500">*</span></Label>
                      <Input
                        type="email"
                        placeholder="priya@grants.edu.in"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Guide / Supervisor Name</Label>
                    <Input
                      placeholder="Dr. Rajesh Kumar, HOD Kayachikitsa"
                      value={guideNames}
                      onChange={(e) => setGuideNames(e.target.value)}
                    />
                  </div>

                  {/* Summary Preview */}
                  <div className="mt-2 p-4 rounded-lg bg-secondary/30 border border-border space-y-2 text-sm">
                    <p className="font-medium text-foreground mb-3">Profile Summary</p>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Domain</span>
                      <span className="font-medium">{domain}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Qualification</span>
                      <span className="font-medium">{qualification}</span>
                    </div>
                    {collegeName && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">College</span>
                        <span className="font-medium text-right max-w-[200px]">{collegeName}</span>
                      </div>
                    )}
                    {universityName && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">University</span>
                        <span className="font-medium text-right max-w-[200px]">{universityName}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6">
            <Button
              variant="ghost"
              onClick={() => setStep(s => s - 1)}
              disabled={step === 1}
              className="gap-2"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </Button>

            {step < 4 ? (
              <Button
                onClick={() => setStep(s => s + 1)}
                disabled={!canGoNext()}
                className="gap-2"
              >
                Continue <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                onClick={handleFinish}
                disabled={!canGoNext() || saving}
                className="gap-2 min-w-[160px]"
              >
                {saving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Setting up…</>
                ) : (
                  <>Enter Workspace <ChevronRight className="w-4 h-4" /></>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
