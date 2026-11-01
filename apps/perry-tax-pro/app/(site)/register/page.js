import AuthForm from "@/components/AuthForm";
import { redirect } from "next/navigation";
import { appMode } from "@/lib/auth";
import { appHome } from "@/lib/app-mode";
import { safeNext } from "@/lib/idle";

export const metadata = { title: "Create Account", description: "Create your InnovaCare Tax account and start your 2026 tax return online." };

export default async function Page({ searchParams }) {
  const next = safeNext((await searchParams)?.next);
  // Inside the native apps: the app's own sign-up screen.
  const app = await appMode();
  if (app) redirect(`/m/register?next=${encodeURIComponent(next?.startsWith("/m") ? next : appHome(app))}`);
  return <AuthForm mode="register" next={next} />;
}
