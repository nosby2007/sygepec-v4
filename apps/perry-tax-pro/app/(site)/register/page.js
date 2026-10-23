import AuthForm from "@/components/AuthForm";

export const metadata = { title: "Create Account", description: "Create your InnovaCare Tax account and start your 2026 tax return online." };

export default function Page() {
  return <AuthForm mode="register" />;
}
