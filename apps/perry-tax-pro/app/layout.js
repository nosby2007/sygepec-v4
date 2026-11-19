import { Outfit, Inter } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", weight: ["400", "500", "600", "700", "800"] });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://innovacaresoftware.com";
const DESCRIPTION = "InnovaCare Tax offers expert individual, self-employed and small business tax preparation with a secure client portal, refund estimator and online booking.";

export const metadata = {
  metadataBase: new URL(SITE),
  title: { default: "InnovaCare Tax | Modern Tax Preparation", template: "%s | InnovaCare Tax" },
  description: DESCRIPTION,
  applicationName: "InnovaCare Tax",
  alternates: { canonical: "/" },
  keywords: ["tax preparation", "federal tax return", "state tax return", "small business taxes", "self-employed taxes", "tax preparer"],
  authors: [{ name: "InnovaCare Software", url: "/" }],
  creator: "InnovaCare Software",
  publisher: "InnovaCare Software",
  openGraph: {
    type: "website",
    url: "/",
    siteName: "InnovaCare Software",
    title: "InnovaCare Tax | Modern Tax Preparation",
    description: DESCRIPTION,
    locale: "en_US",
    images: [{ url: "/photos/consult.jpg", alt: "A tax preparer reviewing a return with a client" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "InnovaCare Tax | Modern Tax Preparation",
    description: DESCRIPTION,
    images: ["/photos/consult.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-video-preview": -1, "max-image-preview": "large", "max-snippet": -1 },
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${outfit.variable} ${inter.variable}`}>
      <head>
        <script
          id="openai-measurement-pixel"
          dangerouslySetInnerHTML={{
            __html: `!function(w,d,s,u){if(w.oaiq)return;var q=function(){q.q.push(arguments)};q.q=[];w.oaiq=q;var j=d.createElement(s);j.async=1;j.src=u;var f=d.getElementsByTagName(s)[0];f.parentNode.insertBefore(j,f)}(window,document,"script","https://bzrcdn.openai.com/sdk/oaiq.min.js");oaiq("init",{pixelId:"2h92QJECXc89x8dxaRQQH8",debug:true});`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
