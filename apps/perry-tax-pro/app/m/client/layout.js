import TabBar from "@/components/mobile/TabBar";

// The InnovaCare client app: explore and book local businesses, follow your bookings and
// your tax return. Explore and business pages are open to everyone; the other tabs ask
// for sign-in.
export default function ClientAppLayout({ children }) {
  return (
    <>
      {children}
      <TabBar app="client" />
    </>
  );
}
