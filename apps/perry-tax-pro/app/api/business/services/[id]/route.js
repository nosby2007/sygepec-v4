import { ownerRoute, readJson } from "@/lib/business-api";
import { updateService } from "@/lib/business-booking";

// Edit price, length, description, or whether the service is active and public.
export const PATCH = async (req, { params }) => {
  const { id } = await params;
  return ownerRoute(req, async (session) => ({ service: await updateService(session, id, await readJson(req)) }), {
    failure: "The service could not be saved.",
  });
};
