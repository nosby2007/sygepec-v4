import { ForgotPasswordForm } from "@/components/PasswordReset";

export const metadata = { title: "Forgot password", description: "Reset the password of your InnovaCare account.", robots: { index: false, follow: false } };

export default function Page() {
  return <ForgotPasswordForm />;
}
