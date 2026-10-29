import { notFound } from "next/navigation";
import { requireTaxClient } from "@/lib/auth";
import { listAppointments } from "@/lib/data";
import { twilioVideoConfigured } from "@/lib/twilio";
import { PageHead } from "@/components/ui";
import VideoRoom from "@/components/VideoRoom";

export const metadata = { title: "Video call" };

export default async function Page({ params }) {
  const s = await requireTaxClient();
  const { id } = await params;
  const appointment = (await listAppointments(s.id)).find((a) => a.id === id);
  if (!appointment || appointment.type !== "VIRTUAL" || !twilioVideoConfigured()) notFound();
  return (
    <>
      <PageHead kicker="Appointments" icon="video" title="Video call" desc={`${appointment.service}${appointment.assignee_name ? ` with ${appointment.assignee_name}` : ""}`} />
      <VideoRoom appointmentId={id} title={appointment.service} backHref="/portal/appointments" otherLabel="your preparer" />
    </>
  );
}
