import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import BookForm from "./BookForm";

export const metadata = {
  title: "Book an Appointment",
  description: "Schedule an in-person or virtual tax preparation appointment with InnovaCare Tax.",
};

export default async function Page() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role !== "CLIENT") redirect("/admin");
  return (
    <main className="section" style={{ paddingTop: 60 }}>
      <div className="container" style={{ maxWidth: 820 }}>
        <div className="section-head">
          <span className="eyebrow">Appointments</span>
          <h1 style={{ fontSize: "clamp(2rem,4vw,3rem)", margin: "16px 0 12px" }}>
            Book time with a <span className="grad-text">tax pro</span>
          </h1>
          <p>In-office or virtual. We&apos;ll confirm by email within one business day.</p>
        </div>
        <BookForm defaults={s?.role === "CLIENT" ? { name: s.name, email: s.email } : {}} />
      </div>
    </main>
  );
}
