import { SignUp } from "@clerk/react";

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/onboarding" fallbackRedirectUrl="/onboarding" />
    </div>
  );
}
