import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { BookOpen, PenTool, BrainCircuit, Library } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground">
            <BookOpen className="w-4 h-4" />
          </div>
          <span className="font-serif font-bold text-xl tracking-tight">MANTHANA-SCHOLER</span>
        </div>
        <div className="flex gap-4">
          <Link href="/sign-in">
            <Button variant="ghost" className="font-medium text-sm">Sign In</Button>
          </Link>
          <Link href="/sign-up">
            <Button className="font-medium text-sm">Start Writing</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="py-24 px-6 max-w-5xl mx-auto text-center space-y-8">
          <h1 className="text-5xl md:text-7xl font-serif font-bold leading-tight tracking-tight text-foreground">
            The Scholarly Companion<br />for Medical Research.
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            A quiet, focused workspace where Indian medical scholars write their theses with authoritative AI assistance. Precise, unhurried, and deeply purposeful.
          </p>
          <div className="pt-8">
            <Link href="/sign-up">
              <Button size="lg" className="h-12 px-8 text-base shadow-sm">
                Enter the Workspace
              </Button>
            </Link>
          </div>
        </section>

        <section className="py-20 bg-secondary/30 border-t border-border">
          <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-3 gap-12">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-lg bg-accent/20 text-accent flex items-center justify-center">
                <PenTool className="w-6 h-6" />
              </div>
              <h3 className="font-serif text-xl font-semibold">Structured Drafting</h3>
              <p className="text-muted-foreground leading-relaxed">
                Organize your thesis into canonical sections. Introduction, Literature Review, Methodology—all neatly arranged and easily reorderable.
              </p>
            </div>
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <BrainCircuit className="w-6 h-6" />
              </div>
              <h3 className="font-serif text-xl font-semibold">AI Assistant</h3>
              <p className="text-muted-foreground leading-relaxed">
                Context-aware AI that understands Ayurveda, Allopathy, and other Indian medical domains. Generate outlines, refine tone, and overcome writer's block.
              </p>
            </div>
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center">
                <Library className="w-6 h-6" />
              </div>
              <h3 className="font-serif text-xl font-semibold">Research Vault</h3>
              <p className="text-muted-foreground leading-relaxed">
                A dedicated vault for your papers, notes, and references. Keep your sources close and your workspace uncluttered.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-8 text-center text-sm text-muted-foreground border-t border-border">
        <p> MANTHANA-SCHOLER. Crafted for scholars.</p>
      </footer>
    </div>
  );
}
