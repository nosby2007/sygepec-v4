import { supportApi } from "@/lib/support-access";
import { getCustomer } from "@/lib/support-customers";
import { PERMISSIONS as P } from "@/lib/support-rules";

export const GET = supportApi({ permission: P.CUSTOMER_VIEW, operation: "customer.view" }, ({ session, params, correlationId }) =>
  getCustomer(session, params.uid, correlationId));
