import AuthForm from "@/components/AuthForm";
import { safeNext } from "@/lib/idle";

export const metadata = { title: "Log In", description: "Log in to your InnovaCare Tax client portal." };

export default async function Page({ searchParams }) {
  return <AuthForm mode="login" next={safeNext((await searchParams)?.next)} />;
}
