import "./mobile.css";

// The InnovaCare mobile app. The Android/iOS shell (mobile/ in this repo) opens /m on
// the live site; the same screens also work in a phone browser.
export const metadata = {
  title: { default: "InnovaCare", template: "%s | InnovaCare" },
  robots: { index: false },
  appleWebApp: { capable: true, title: "InnovaCare", statusBarStyle: "default" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0b1f3a",
};

export default function MobileLayout({ children }) {
  return <div className="m-app">{children}</div>;
}
