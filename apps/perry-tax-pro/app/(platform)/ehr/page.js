import { notFound } from "next/navigation";
import ProductCard from "../ProductCard";
import { platformVisibility } from "@/lib/platform-visibility";

export const metadata = {
  title: { absolute: "Electronic health records | InnovaCare Software" },
  description: "InnovaSoftware Clinic and CameroHealth, the electronic health record products of InnovaCare Software.",
  alternates: { canonical: "/ehr" },
};

export const dynamic = "force-dynamic";

export default async function EhrPage() {
  const v = await platformVisibility();
  if (!v.ehr) notFound();
  return (
    <main>
      <section className="plat-hero plat-hero-sm">
        <div className="container">
          <span className="eyebrow">EHR</span>
          <h1>Electronic health records</h1>
          <p>Choose the product that fits your practice.</p>
        </div>
      </section>
      <section className="section container">
        <div className="plat-grid plat-grid-2">
          {v.ehrProducts.map((p) => <ProductCard key={p.key} product={p} id={`ehr-${p.key}`} />)}
        </div>
      </section>
    </main>
  );
}
