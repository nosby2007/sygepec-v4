// Checkout arithmetic shared by the server and its tests. Amounts are integer cents.
// Subtotal of the lines, discount (amount or percent), then the tip.
export function checkoutTotal({ lines = [], discount = null, tipCents = 0 }) {
  const subtotal = lines.reduce((sum, l) => sum + l.cents * l.qty, 0);
  const off = !discount ? 0 : discount.type === "PERCENT" ? Math.round((subtotal * Math.min(100, discount.value)) / 100) : Math.min(subtotal, discount.cents);
  return { subtotal, discount: off, tip: tipCents, total: subtotal - off + tipCents };
}
