import AuthForm from "@/components/AuthForm";

export const metadata = { title: "Log In", description: "Log in to your InnovaCare Tax client portal." };

export default function Page() {
  return <AuthForm mode="login" />;
}
