import { requireBusinessClient } from '@/lib/auth';
import BusinessLedger from './BusinessLedger';
export const metadata={title:'Small Business Bookkeeping'};
export default async function Page(){await requireBusinessClient();return <BusinessLedger/>;}
