import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { appMode } from "@/lib/auth";

export const metadata = { title: "Create a Business Workspace", description: "Create a dedicated InnovaCare Business workspace for daily operations." };

export default async function Page() {
  // Inside the native apps: the app's own sign-up screen.
  if (await appMode()) redirect(`/m/register?type=business&next=${encodeURIComponent("/m/business/appointments")}`);
  return <AuthForm mode="register" accountType="BUSINESS" />;
}
