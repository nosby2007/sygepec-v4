import Link from "next/link";
import Icon from "@/components/Icon";
import ProductCard from "./ProductCard";
import { products } from "@/lib/platform";

export const metadata = {
  title: { absolute: "InnovaCare Software | Tax, training, compliance, EHR and services" },
  description: "InnovaCare Software brings together InnovaTax, InnovaCare Training, compliance tools, electronic health records and a search for local services.",
  alternates: { canonical: "/" },
};

export const dynamic = "force-dynamic";

export default function PlatformHome() {
  const list = products();
  return (
    <main>
      <section className="plat-hero">
        <div className="container">
          <span className="eyebrow">InnovaCare Software</span>
          <h1>One platform for the work that keeps people cared for.</h1>
          <p>Taxes, training, compliance, health records, software and trusted local services. Choose where you want to go.</p>
          <div className="row">
            <a href="#products" className="btn btn-primary btn-lg">See our products</a>
            <Link href="/find" className="btn btn-light btn-lg"><Icon name="search" size={18} /> Find a service</Link>
          </div>
        </div>
      </section>
      <section className="section container" id="products">
        <div className="plat-head">
          <h2>Our products</h2>
          <p className="muted">Each one opens its own space. You can move between them from the menu at the top.</p>
        </div>
        <div className="plat-grid">
          {list.map((p) => <div key={p.key} id={p.key} className="plat-anchor"><ProductCard product={p} id={`product-${p.key}`} /></div>)}
        </div>
      </section>
    </main>
  );
}
