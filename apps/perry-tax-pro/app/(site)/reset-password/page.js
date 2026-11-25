import { ResetPasswordForm } from "@/components/PasswordReset";

// No referrer from this page, so nothing about it reaches other sites.
export const metadata = { title: "Choose a new password", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function Page() {
  return <ResetPasswordForm />;
}
