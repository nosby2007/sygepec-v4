import { requireBusinessClient } from "@/lib/auth";
import TabBar from "@/components/mobile/TabBar";

export default async function BusinessAppLayout({ children }) {
  await requireBusinessClient();
  return (
    <>
      {children}
      <TabBar />
    </>
  );
}
