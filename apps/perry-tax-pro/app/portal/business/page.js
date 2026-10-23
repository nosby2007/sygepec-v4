import { requireRole } from '@/lib/auth';
import BusinessLedger from './BusinessLedger';
export const metadata={title:'Small Business Bookkeeping'};
export default async function Page(){await requireRole('CLIENT');return <BusinessLedger/>;}
