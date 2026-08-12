import type { Metadata } from "next";
import Link from "next/link";
import ResetPasswordConfirmForm from "@/components/auth/ResetPasswordConfirmForm";
import { getPasswordResetTokenStatus } from "@/lib/password-reset";

export const metadata: Metadata = {
  title: "Choose New Password | iD30 CRM",
};

export default async function ResetPasswordConfirmPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const tokenParam = params.token;
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;

  if (!token) {
    return (
      <InvalidResetLink message="This reset link is invalid. Request a new password reset link." />
    );
  }

  const status = await getPasswordResetTokenStatus(token);

  if (!status.valid) {
    return <InvalidResetLink message={status.message} />;
  }

  return <ResetPasswordConfirmForm email={status.email} token={token} />;
}

function InvalidResetLink({ message }: { message: string }) {
  return (
    <div className="flex w-full flex-1 flex-col lg:w-1/2">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <h1 className="text-title-sm font-semibold text-gray-800 dark:text-white/90">
            Reset link unavailable
          </h1>
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            {message}
          </p>
          <Link
            href="/reset-password"
            className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
          >
            Request a new link
          </Link>
          <Link
            href="/signin"
            className="mt-3 inline-flex w-full items-center justify-center rounded-lg px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
