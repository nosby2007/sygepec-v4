import { notFound } from "next/navigation";
import ProductDetail from "../ProductDetail";
import { platformProduct } from "@/lib/platform-products";

export const dynamic = "force-dynamic";

export const metadata = {
  title: { absolute: "InnovaCare Training: NCLEX, nursing and medical exam review | InnovaCare Software" },
  alternates: { canonical: "/training" },
};

export default function Page() {
  const p = platformProduct("training");
  if (!p) notFound();
  return <ProductDetail p={p} />;
}
