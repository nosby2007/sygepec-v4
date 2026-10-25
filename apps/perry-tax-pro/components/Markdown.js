import Link from "next/link";

// A small, safe Markdown subset for CMS content: ## and ### headings, paragraphs,
// "- " and "1. " lists, **bold**, _italic_ and [links](/path or https://…).
// Everything becomes React elements; raw HTML in the text is shown as text.

const INLINE = /(\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\([^)\s]+\))/g;

function inline(text, keyBase) {
  return text.split(INLINE).filter(Boolean).map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (part.startsWith("**") && part.endsWith("**")) return <b key={key}>{part.slice(2, -2)}</b>;
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2) return <em key={key}>{part.slice(1, -1)}</em>;
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      const [, label, href] = link;
      if (/^\/(?!\/)/.test(href)) return <Link key={key} href={href}>{label}</Link>;
      if (/^https:\/\//.test(href)) return <a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow">{label}</a>;
      return label;
    }
    return part;
  });
}

export default function Markdown({ text = "", className = "prose" }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className={className}>
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (block.startsWith("### ")) return <h3 key={i}>{inline(block.slice(4), i)}</h3>;
        if (block.startsWith("## ")) return <h2 key={i}>{inline(block.slice(3), i)}</h2>;
        if (lines.every((l) => /^[-*] /.test(l))) return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.slice(2), `${i}-${j}`)}</li>)}</ul>;
        if (lines.every((l) => /^\d+\. /.test(l))) return <ol key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\d+\. /, ""), `${i}-${j}`)}</li>)}</ol>;
        return <p key={i}>{lines.flatMap((l, j) => (j ? [<br key={`br${j}`} />, ...inline(l, `${i}-${j}`)] : inline(l, `${i}-${j}`)))}</p>;
      })}
    </div>
  );
}
