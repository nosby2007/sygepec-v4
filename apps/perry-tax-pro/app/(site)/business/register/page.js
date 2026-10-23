import AuthForm from "@/components/AuthForm";

export const metadata = { title: "Create a Business Workspace", description: "Create a dedicated InnovaCare Business workspace for daily operations." };

export default function Page() {
  return <AuthForm mode="register" accountType="BUSINESS" />;
}
