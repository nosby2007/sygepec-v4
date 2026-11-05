import { RATES, supportApi } from "@/lib/support-access";
import { searchCustomers } from "@/lib/support-customers";
import { PERMISSIONS as P } from "@/lib/support-rules";

export const GET = supportApi({ permission: P.CUSTOMER_SEARCH, rate: RATES.search, operation: "customer.search" }, ({ req, session, correlationId }) =>
  searchCustomers(session, new URL(req.url).searchParams.get("q"), correlationId));
