import { Outfit, Inter } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", weight: ["400", "500", "600", "700", "800"] });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata = {
  title: { default: "InnovaCare Tax | Modern Tax Preparation", template: "%s | InnovaCare Tax" },
  description:
    "InnovaCare Tax offers expert individual, self-employed and small business tax preparation with a secure client portal, refund estimator and online booking.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${outfit.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
