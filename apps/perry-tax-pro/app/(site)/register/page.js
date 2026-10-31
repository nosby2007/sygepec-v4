import AuthForm from "@/components/AuthForm";
import { safeNext } from "@/lib/idle";

export const metadata = { title: "Create Account", description: "Create your InnovaCare Tax account and start your 2026 tax return online." };

export default async function Page({ searchParams }) {
  return <AuthForm mode="register" next={safeNext((await searchParams)?.next)} />;
}
