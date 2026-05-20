export function SupabaseConfigBanner() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-lg w-full rounded-lg border border-border bg-card p-8 shadow-sm space-y-4 text-center">
        <h1 className="text-2xl font-serif font-bold tracking-tight">Configuration required</h1>
        <p className="text-sm text-muted-foreground">
          This deployment is missing Supabase environment variables. The app cannot start auth until
          they are set at <strong>build time</strong> on Vercel.
        </p>
        <ul className="text-left text-sm space-y-2 text-muted-foreground">
          <li>
            <code className="text-foreground">VITE_SUPABASE_URL</code> —{" "}
            <code className="text-xs">https://lziejvvfmreprdnuifwx.supabase.co</code>
          </li>
          <li>
            <code className="text-foreground">VITE_SUPABASE_ANON_KEY</code> — your Supabase anon key
          </li>
        </ul>
        <p className="text-xs text-muted-foreground">
          Vercel → Project → Settings → Environment Variables → add both for Production and Preview →
          Redeploy.
        </p>
      </div>
    </div>
  );
}
