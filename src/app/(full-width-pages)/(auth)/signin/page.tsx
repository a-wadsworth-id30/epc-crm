import SignInForm from "@/components/auth/SignInForm";
import { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Sign In | iD30 CRM",
  description: "Sign in to iD30 CRM.",
};

export const dynamic = "force-static";

export default function SignIn() {
  return (
    <Suspense fallback={<SignInForm nextPath="/" />}>
      <SignInForm />
    </Suspense>
  );
}
