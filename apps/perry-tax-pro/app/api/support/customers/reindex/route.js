import { supportApi } from "@/lib/support-access";
import { rebuildCustomerIndex } from "@/lib/support-customers";
import { PERMISSIONS as P } from "@/lib/support-rules";

// Builds customer search from existing accounts. Used once at launch; the daily job keeps it fresh.
export const POST = supportApi({ permission: P.ROLES_MANAGE, rate: { limit: 3, seconds: 3600 }, operation: "customer.reindex" }, () => rebuildCustomerIndex());
