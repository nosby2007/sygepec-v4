import { preparerRoute } from "@/lib/cms-api";
import { markMessage } from "@/lib/cms";

export const PATCH = async (req, { params }) => {
  const { id } = await params;
  return preparerRoute(req, async (session) => {
    const { status } = await req.json().catch(() => ({}));
    await markMessage(session, id, status);
    return { ok: true };
  });
};
