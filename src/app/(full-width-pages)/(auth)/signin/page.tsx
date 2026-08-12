import SignInForm from "@/components/auth/SignInForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | iD30 CRM",
  description: "Sign in to iD30 CRM.",
};

function safeNextPath(next?: string | string[]) {
  const value = Array.isArray(next) ? next[0] : next;

  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "";
  }

  if (value.startsWith("/api/") || value.startsWith("/auth/")) {
    return "";
  }

  return value;
}

export default async function SignIn({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};

  return <SignInForm nextPath={safeNextPath(params.next)} />;
}
