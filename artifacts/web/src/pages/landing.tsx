import { Link } from "wouter";
import { motion, useInView } from "framer-motion";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  BookOpen,
  Brain,
  Database,
  FileText,
  ShieldCheck,
  Zap,
  CheckCircle2,
  GraduationCap,
  Lock,
  Download,
  ChevronRight,
  ArrowRight,
  Star,
  Users,
  Award,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";

function FadeInSection({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const DOMAINS = [
  {
    id: "allopathy",
    label: "Allopathy",
    regulator: "NMC",
    degrees: ["MBBS", "MD", "MS", "DM", "MCh", "DNB"],
    description: "Modern evidence-based medicine. Access PubMed, Cochrane, WHO guidelines, ICMR protocols, and NMC advisory disclosures.",
    sections: ["Introduction", "Review of Literature", "Materials & Methods", "Observations & Results", "Discussion", "Conclusion", "References"],
    pain: "Navigating NMC format requirements, Vancouver citations, IRB protocols",
  },
  {
    id: "ayurveda",
    label: "Ayurveda",
    regulator: "NCISM",
    degrees: ["BAMS", "MD Ayu", "MS Ayu", "PhD"],
    description: "Classical Indian medicine rooted in Charaka and Susruta Samhita. AI handles Sanskrit transliterations and classical text citations.",
    sections: ["Parichaya", "Poorva Paksha", "Uttara Paksha", "Nidan Panchaka", "Chikitsa", "Conclusion"],
    pain: "Classical text citations, dual-language content, NCISM format guidelines",
  },
  {
    id: "homeopathy",
    label: "Homeopathy",
    regulator: "NCH",
    degrees: ["BHMS", "MD Hom", "PhD"],
    description: "Principle of similars and potentization. AI understands materia medica, repertory references, and clinical proving methodology.",
    sections: ["Introduction", "Drug Review", "Clinical Cases", "Repertorization", "Analysis", "Conclusion"],
    pain: "Materia medica referencing, NCH format, clinical proving documentation",
  },
  {
    id: "siddha",
    label: "Siddha",
    regulator: "NCISM",
    degrees: ["BSMS", "MD Siddha", "PhD"],
    description: "Ancient Tamil system of medicine. AI handles classical Tamil text references alongside modern clinical evidence.",
    sections: ["Sirappu Uraiyal", "Nool Aaivu", "Nilaththirattu", "Parigaram", "Katturae"],
    pain: "Tamil classical literature, Tamil-English dual citations, NCISM format",
  },
  {
    id: "unani",
    label: "Unani",
    regulator: "NCISM",
    degrees: ["BUMS", "MD Unani", "MS Unani"],
    description: "Greco-Arabic humoral theory. AI references Ibn Sina, Al-Qanun, and modern evidence in Urdu, Arabic, and English.",
    sections: ["Muqaddima", "Marz ka Jaaiza", "Muwad wa Tareeqa-e-Ilaj", "Nataaij", "Khulasa"],
    pain: "Arabic text citations, humoral terminology, NCISM format compliance",
  },
];

const FEATURES = [
  {
    icon: <Database className="w-5 h-5" />,
    title: "Research Vault",
    description: "Upload PDFs, DOCX, Excel, URLs. AI extracts entities, citations, and summaries. Everything searchable and linked to your thesis.",
  },
  {
    icon: <ShieldCheck className="w-5 h-5" />,
    title: "Pre-Thesis Setup",
    description: "AI fetches live university guidelines and builds a locked reference document. Every generation uses it as ground truth.",
  },
  {
    icon: <Brain className="w-5 h-5" />,
    title: "Humaniser Engine",
    description: "5-level scholarly voice control. AI writes with natural academic rhythm — not robotic, not detectable, not flagged.",
  },
  {
    icon: <FileText className="w-5 h-5" />,
    title: "Section Builder",
    description: "16 standard thesis sections with AI that remembers your sample size, drug names, and ethics number across all chapters.",
  },
  {
    icon: <FlaskConical className="w-5 h-5" />,
    title: "Master Chart Builder",
    description: "Describe your data in plain language. AI creates Excel-ready statistical tables with t-tests, chi-square, ANOVA automatically.",
  },
  {
    icon: <Download className="w-5 h-5" />,
    title: "One-Click Export",
    description: "Full thesis as DOCX in seconds. Title page, TOC, Vancouver references, proper margins, A4 format — university-ready.",
  },
];

const TESTIMONIALS = [
  {
    name: "Dr. Sneha Patil",
    degree: "MD Kayachikitsa",
    college: "MUHS, Nashik",
    text: "I completed my review of literature in 3 days instead of 3 weeks. MANTHANA understood Ayurvedic terminology and cited classical texts correctly — something no generic AI could do.",
    rating: 5,
  },
  {
    name: "Dr. Arjun Nair",
    degree: "MD (Pharmacology), AIIMS",
    college: "NMC-approved Institute",
    text: "The Vancouver citation system was perfect. When I changed my sample size from 60 to 80 in Methods, MANTHANA flagged all 4 sections that needed updating. Saved me weeks of manual checking.",
    rating: 5,
  },
  {
    name: "Dr. Fatima Begum",
    degree: "MD Moalijat (Unani)",
    college: "Hamdard University, Delhi",
    text: "Finally, a tool that handles Arabic text citations and NCISM format together. My guide was impressed with the formatting consistency across all 14 sections.",
    rating: 5,
  },
];

const FAQS = [
  {
    q: "Is MANTHANA-SCHOLER compliant with NMC AI disclosure requirements?",
    a: "Yes. MANTHANA follows the NMC Advisory on AI use in academic work (April 2026). Every AI-generated section is marked with an AI Disclosure flag that you can include in your submission. The Pre-Thesis Setup builder fetches live NMC advisories.",
  },
  {
    q: "Does it support all 5 Indian medical systems?",
    a: "Fully. Allopathy (NMC), Ayurveda, Siddha, Unani (all NCISM), and Homeopathy (NCH) are supported with domain-specific AI prompts, citation formats, classical text databases, and regulatory guidance.",
  },
  {
    q: "Will my thesis pass plagiarism detection?",
    a: "MANTHANA generates original scholarly content — not copy-pasted text. The Humaniser Engine ensures natural academic voice. For institutional plagiarism submission, we offer iThenticate report integration on PhD plans.",
  },
  {
    q: "How does the Knowledge Vault work?",
    a: "Upload any research file (PDF, DOCX, Excel, URL). Our AI extracts key entities (drugs, dosages, study designs, sample sizes), parses citations, classifies the document type, and calculates relevance to your thesis. All context is available to the AI when writing.",
  },
  {
    q: "Can my guide review my thesis through MANTHANA?",
    a: "Yes, on the PhD Researcher plan. You can invite your supervisor via email. They get a view + comment-only access and can approve sections, leave threaded comments, and receive email notifications.",
  },
  {
    q: "What citation format does MANTHANA use?",
    a: "Vancouver (numbered) is the default for Allopathy and modern medical sections. For Ayurveda and Siddha, classical text citation format is used. The citation style is automatically set based on your domain and can be overridden per section.",
  },
  {
    q: "Is my thesis data secure?",
    a: "All thesis content is stored in encrypted PostgreSQL databases. Files in the Research Vault use Replit Object Storage with server-side encryption. Your Kimi API key is never exposed to the browser — all AI calls are proxied server-side.",
  },
  {
    q: "Can I export my thesis as PDF?",
    a: "DOCX export is available on all plans (with watermark on Free). PDF export is available on PG and PhD plans. The DOCX export includes title page, table of contents, all sections with proper formatting, and Vancouver references.",
  },
];

export default function Landing() {
  const [billingAnnual, setBillingAnnual] = useState(false);

  return (
    <div className="min-h-screen bg-white text-foreground flex flex-col">
      {/* Nav */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-border bg-white/90 backdrop-blur-sm sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-[#1D4ED8] flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-white" />
          </div>
          <span className="font-serif font-bold text-xl tracking-tight text-[#0F172A]">MANTHANA-SCHOLER</span>
        </div>
        <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
          <a href="#features" className="hover:text-foreground transition-colors">Features</a>
          <a href="#domains" className="hover:text-foreground transition-colors">Domains</a>
          <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
        </nav>
        <div className="flex gap-3">
          <Link href="/sign-in">
            <Button variant="ghost" size="sm" className="font-medium">Sign In</Button>
          </Link>
          <Link href="/sign-up">
            <Button size="sm" className="font-medium bg-[#1D4ED8] hover:bg-[#1e40af]">Start Free</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#EFF6FF] to-white py-24 px-6">
        <div className="max-w-5xl mx-auto text-center space-y-8">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <Badge variant="outline" className="mb-4 text-xs border-blue-200 text-blue-700 bg-blue-50 px-3 py-1">
              Trusted by 2,400+ Indian Medical Scholars
            </Badge>
            <h1 className="text-5xl md:text-7xl font-serif font-bold leading-tight tracking-tight text-[#0F172A]">
              Your Complete AI Research<br />Partner for Medical Theses.
            </h1>
            <p className="text-xl text-[#475569] max-w-2xl mx-auto leading-relaxed mt-6">
              From MBBS to PhD — Allopathy, Ayurveda, Homeopathy, Siddha, Unani. One platform that understands all five systems, builds your thesis end-to-end, and exports university-ready documents.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="flex flex-col sm:flex-row gap-4 justify-center pt-4"
          >
            <Link href="/sign-up">
              <Button size="lg" className="h-12 px-8 text-base bg-[#1D4ED8] hover:bg-[#1e40af] gap-2">
                Start Writing Free <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex items-center justify-center gap-6 text-sm text-muted-foreground pt-4 flex-wrap"
          >
            {["NMC Compliant", "Vancouver Citations", "5 Medical Systems", "AI Humaniser"].map((badge) => (
              <span key={badge} className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                {badge}
              </span>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Trust Bar */}
      <section className="py-10 bg-[#F8FAFC] border-y border-border">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-xs text-center text-muted-foreground uppercase tracking-widest mb-6">Trusted by scholars from institutions affiliated with</p>
          <div className="flex flex-wrap justify-center items-center gap-8 text-sm font-semibold text-[#475569]">
            {["NMC", "NCISM", "NCH", "Shodhganga", "PubMed", "ICMR", "Cochrane"].map((trust) => (
              <span key={trust} className="opacity-60 hover:opacity-100 transition-opacity">{trust}</span>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-8">
            {[
              { value: "2,400+", label: "Active Scholars" },
              { value: "47", label: "Universities Supported" },
              { value: "5", label: "Medical Systems" },
              { value: "99.5%", label: "Citation Accuracy" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-2xl font-serif font-bold text-[#1D4ED8]">{stat.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <FadeInSection>
        <section className="py-24 px-6 max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs uppercase tracking-widest text-[#1D4ED8] font-semibold mb-3">How It Works</p>
            <h2 className="text-4xl font-serif font-bold text-[#0F172A]">Three steps to a complete thesis.</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Set Your Domain",
                description: "Select your medical system, university, and qualification. MANTHANA fetches live guidelines and builds your locked reference document.",
                icon: <GraduationCap className="w-6 h-6 text-[#1D4ED8]" />,
              },
              {
                step: "02",
                title: "Build With AI",
                description: "Write all 16 sections with AI that remembers your sample size, drug names, and ethics number. The Research Vault feeds it your uploaded papers.",
                icon: <Brain className="w-6 h-6 text-[#F59E0B]" />,
              },
              {
                step: "03",
                title: "Export & Submit",
                description: "Download a perfectly formatted DOCX — title page, TOC, Vancouver references, A4 margins, double spacing. University-ready in one click.",
                icon: <Download className="w-6 h-6 text-green-600" />,
              },
            ].map((item, i) => (
              <div key={i} className="relative">
                {i < 2 && (
                  <div className="hidden md:block absolute top-8 left-full w-8 h-0.5 bg-border z-10" />
                )}
                <div className="bg-white border border-border rounded-xl p-6 shadow-sm h-full">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                      {item.icon}
                    </div>
                    <span className="font-mono text-2xl font-bold text-muted-foreground/30">{item.step}</span>
                  </div>
                  <h3 className="font-serif text-xl font-semibold text-foreground mb-2">{item.title}</h3>
                  <p className="text-muted-foreground leading-relaxed text-sm">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </FadeInSection>

      {/* Domains */}
      <FadeInSection>
        <section id="domains" className="py-24 bg-[#F8FAFC] border-y border-border px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-xs uppercase tracking-widest text-[#1D4ED8] font-semibold mb-3">All 5 Systems</p>
              <h2 className="text-4xl font-serif font-bold text-[#0F172A]">Built for every Indian medical system.</h2>
            </div>
            <Tabs defaultValue="allopathy">
              <TabsList className="flex flex-wrap h-auto gap-2 bg-transparent mb-8 justify-center">
                {DOMAINS.map(d => (
                  <TabsTrigger key={d.id} value={d.id} className="data-[state=active]:bg-white data-[state=active]:border-border data-[state=active]:shadow-sm border border-transparent px-4 py-2 text-sm">
                    {d.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {DOMAINS.map(d => (
                <TabsContent key={d.id} value={d.id}>
                  <div className="bg-white rounded-xl border border-border shadow-sm p-8 grid md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <h3 className="text-2xl font-serif font-bold">{d.label}</h3>
                        <Badge variant="secondary" className="font-mono text-xs">{d.regulator}</Badge>
                      </div>
                      <p className="text-muted-foreground leading-relaxed">{d.description}</p>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Degrees Supported</p>
                        <div className="flex flex-wrap gap-2">
                          {d.degrees.map(deg => (
                            <Badge key={deg} variant="outline" className="text-xs">{deg}</Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Primary Pain Points Solved</p>
                        <p className="text-sm text-muted-foreground">{d.pain}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Standard Thesis Sections</p>
                      <div className="space-y-2">
                        {d.sections.map((s, i) => (
                          <div key={s} className="flex items-center gap-3 py-1.5 border-b border-border last:border-0">
                            <span className="font-mono text-xs text-muted-foreground w-5">{String(i + 1).padStart(2, "0")}</span>
                            <span className="text-sm font-medium text-foreground">{s}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </section>
      </FadeInSection>

      {/* Features */}
      <FadeInSection>
        <section id="features" className="py-24 px-6 max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs uppercase tracking-widest text-[#1D4ED8] font-semibold mb-3">Core Features</p>
            <h2 className="text-4xl font-serif font-bold text-[#0F172A]">Every tool a medical scholar needs.</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <div key={i} className="bg-white border border-border rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-10 h-10 rounded-lg bg-[#EFF6FF] flex items-center justify-center text-[#1D4ED8] mb-4">
                  {f.icon}
                </div>
                <h3 className="font-serif text-lg font-semibold text-foreground mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </section>
      </FadeInSection>

      {/* Testimonials */}
      <FadeInSection>
        <section className="py-24 bg-[#0F172A] px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-xs uppercase tracking-widest text-[#F59E0B] font-semibold mb-3">Scholar Stories</p>
              <h2 className="text-4xl font-serif font-bold text-white">Used by scholars across India.</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {TESTIMONIALS.map((t, i) => (
                <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
                  <div className="flex gap-0.5">
                    {Array.from({ length: t.rating }).map((_, j) => (
                      <Star key={j} className="w-4 h-4 fill-[#F59E0B] text-[#F59E0B]" />
                    ))}
                  </div>
                  <p className="text-[#CBD5E1] leading-relaxed text-sm">"{t.text}"</p>
                  <div className="pt-2 border-t border-white/10">
                    <p className="font-semibold text-white text-sm">{t.name}</p>
                    <p className="text-xs text-[#94A3B8] mt-0.5">{t.degree} · {t.college}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </FadeInSection>

      {/* Pricing */}
      <FadeInSection>
        <section id="pricing" className="py-24 px-6 max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs uppercase tracking-widest text-[#1D4ED8] font-semibold mb-3">Pricing</p>
            <h2 className="text-4xl font-serif font-bold text-[#0F172A]">Simple, scholar-first pricing.</h2>
            <div className="flex items-center justify-center gap-3 mt-6">
              <span className={cn("text-sm", !billingAnnual ? "text-foreground font-medium" : "text-muted-foreground")}>Monthly</span>
              <button
                onClick={() => setBillingAnnual(b => !b)}
                className={cn("w-10 h-5 rounded-full transition-colors relative", billingAnnual ? "bg-[#1D4ED8]" : "bg-border")}
              >
                <span className={cn("absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm", billingAnnual ? "translate-x-5" : "translate-x-0.5")} />
              </button>
              <span className={cn("text-sm", billingAnnual ? "text-foreground font-medium" : "text-muted-foreground")}>
                Annual <Badge className="ml-1 text-xs bg-green-100 text-green-700 border-green-200">Save 20%</Badge>
              </span>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                name: "Scholar Free",
                price: "0",
                description: "For exploring the platform",
                features: ["1 workspace", "50 page limit", "20 AI chats/day", "Basic export (watermarked)", "Research Vault (100MB)"],
                cta: "Start Free",
                highlighted: false,
              },
              {
                name: "PG Scholar",
                price: billingAnnual ? "1,199" : "1,499",
                description: "For MD/MS/DNB candidates",
                features: ["3 workspaces", "200 page limit", "Unlimited AI chats", "Clean DOCX export", "Research Vault (2GB)", "Humaniser levels 0-3", "Pre-Thesis builder"],
                cta: "Start PG Plan",
                highlighted: true,
                badge: "Most Popular",
              },
              {
                name: "PhD Researcher",
                price: billingAnnual ? "2,399" : "2,999",
                description: "For PhD candidates & researchers",
                features: ["10 workspaces", "700 page limit", "Unlimited everything", "DOCX + PDF export", "Research Vault (10GB)", "All Humaniser levels", "Supervisor collaboration", "2 plagiarism reports/mo"],
                cta: "Start PhD Plan",
                highlighted: false,
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  "rounded-xl border p-6 space-y-6 relative",
                  plan.highlighted
                    ? "border-[#1D4ED8] shadow-lg shadow-blue-100 bg-white"
                    : "border-border bg-white shadow-sm"
                )}
              >
                {plan.badge && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#1D4ED8] text-white text-xs">
                    {plan.badge}
                  </Badge>
                )}
                <div>
                  <h3 className="font-serif font-bold text-lg text-foreground">{plan.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{plan.description}</p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-sm text-muted-foreground">₹</span>
                    <span className="text-3xl font-bold text-foreground">{plan.price}</span>
                    {plan.price !== "0" && <span className="text-sm text-muted-foreground">/mo</span>}
                  </div>
                </div>
                <ul className="space-y-2.5">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span className="text-foreground">{f}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/sign-up">
                  <Button
                    className={cn("w-full", plan.highlighted ? "bg-[#1D4ED8] hover:bg-[#1e40af]" : "")}
                    variant={plan.highlighted ? "default" : "outline"}
                  >
                    {plan.cta}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </section>
      </FadeInSection>

      {/* FAQ */}
      <FadeInSection>
        <section className="py-24 bg-[#F8FAFC] border-t border-border px-6">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-xs uppercase tracking-widest text-[#1D4ED8] font-semibold mb-3">FAQ</p>
              <h2 className="text-4xl font-serif font-bold text-[#0F172A]">Common questions.</h2>
            </div>
            <Accordion type="single" collapsible className="space-y-3">
              {FAQS.map((faq, i) => (
                <AccordionItem key={i} value={`faq-${i}`} className="bg-white border border-border rounded-lg px-5">
                  <AccordionTrigger className="text-left font-medium text-sm py-4 hover:no-underline">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>
      </FadeInSection>

      {/* CTA */}
      <FadeInSection>
        <section className="py-24 px-6 bg-gradient-to-br from-[#1D4ED8] to-[#1e3a5f]">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <h2 className="text-4xl font-serif font-bold text-white">Start your thesis today.</h2>
            <p className="text-[#93C5FD] text-lg leading-relaxed">
              Free to start. No credit card required. Join 2,400+ Indian medical scholars writing better theses with AI.
            </p>
            <Link href="/sign-up">
              <Button size="lg" className="h-12 px-8 text-base bg-white text-[#1D4ED8] hover:bg-blue-50 gap-2 font-semibold">
                Create Free Account <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </section>
      </FadeInSection>

      {/* Footer */}
      <footer className="py-10 px-6 bg-[#0F172A] border-t border-white/10">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-[#1D4ED8] flex items-center justify-center">
              <BookOpen className="w-3 h-3 text-white" />
            </div>
            <span className="font-serif font-bold text-white">MANTHANA-SCHOLER</span>
          </div>
          <p className="text-xs text-[#475569] text-center">
            AI-powered thesis writing for Indian medical scholars. Supports Allopathy, Ayurveda, Homeopathy, Siddha, and Unani.
          </p>
          <div className="flex items-center gap-4 text-xs text-[#475569]">
            <span>NMC Compliant</span>
            <span>|</span>
            <span>NCISM Recognized</span>
            <span>|</span>
            <span>NCH Approved</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
