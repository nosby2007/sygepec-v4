import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { listAppointments } from "@/lib/data";
import { twilioVideoConfigured } from "@/lib/twilio";
import { PageHead } from "@/components/ui";
import VideoRoom from "@/components/VideoRoom";

export const metadata = { title: "Video call" };

export default async function Page({ params }) {
  await requireRole("PREPARER");
  const { id } = await params;
  const appointment = (await listAppointments()).find((a) => a.id === id);
  if (!appointment || appointment.type !== "VIRTUAL" || !twilioVideoConfigured()) notFound();
  return (
    <>
      <PageHead kicker="Appointments" icon="video" title={`Video call with ${appointment.name}`} desc={appointment.service} />
      <VideoRoom appointmentId={id} title={appointment.name} backHref="/admin/appointments" otherLabel="the client" />
    </>
  );
}
