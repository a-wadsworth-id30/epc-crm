import type { Metadata } from "next";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Reset Password | iD30 CRM",
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
