import Link from "next/link";
import Icon from "@/components/Icon";
import { isExternal } from "@/lib/platform";

// One product tile. Without a link it still shows, marked "Coming soon", and leads to the
// contact form.
export default function ProductCard({ product, id }) {
  const ready = Boolean(product.href);
  const href = ready ? product.href : `/contact?about=${encodeURIComponent(product.name)}`;
  const external = isExternal(href);
  const inner = (
    <>
      <span className="plat-icon"><Icon name={product.icon} size={26} /></span>
      {product.area && <span className="plat-area">{product.area}</span>}
      <h3>{product.name}</h3>
      <p>{product.text}</p>
      <span className="plat-go">
        {ready ? <>Open {product.name} <Icon name="arrow" size={16} className="icon-arrow" /></> : <><span className="pill">Coming soon</span> Contact us</>}
      </span>
    </>
  );
  return external
    ? <a id={id} href={href} className="card plat-card" rel="noopener">{inner}</a>
    : <Link id={id} href={href} className="card plat-card">{inner}</Link>;
}
