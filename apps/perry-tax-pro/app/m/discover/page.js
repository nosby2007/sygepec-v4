import { redirect } from "next/navigation";

// The directory moved into the client app's Explore tab.
export default function Page() {
  redirect("/m/client");
}
