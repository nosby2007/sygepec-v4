import { notFound } from "next/navigation";
import ProductDetail from "../ProductDetail";
import { platformProduct } from "@/lib/platform-products";

export const dynamic = "force-dynamic";

export const metadata = {
  title: { absolute: "Compliance training for healthcare teams | InnovaCare Software" },
  alternates: { canonical: "/compliance" },
};

export default function Page() {
  const p = platformProduct("compliance");
  if (!p) notFound();
  return <ProductDetail p={p} />;
}
