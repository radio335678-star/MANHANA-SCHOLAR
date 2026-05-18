import { SignIn } from "@clerk/react";

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl="/dashboard" fallbackRedirectUrl="/dashboard" />
    </div>
  );
}
