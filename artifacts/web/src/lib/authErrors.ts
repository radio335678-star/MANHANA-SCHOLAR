/** Map Supabase Auth API errors to clearer sign-in messages. */
export function formatAuthError(message: string, code?: string): string {
  const lower = message.toLowerCase();
  if (
    code === "invalid_credentials" ||
    lower.includes("invalid login credentials") ||
    lower.includes("invalid_credentials")
  ) {
    return "Incorrect email or password. Check caps lock and try again.";
  }
  if (lower.includes("email not confirmed")) {
    return "Confirm your email first, or ask an admin to disable email confirmation in Supabase.";
  }
  if (lower.includes("invalid api key")) {
    return "App misconfigured: invalid Supabase key. Redeploy with VITE_SUPABASE_ANON_KEY set.";
  }
  return message;
}
