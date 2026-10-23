import {requireBusinessClient} from '@/lib/auth';
import AccountingTools from '../AccountingTools';
export const metadata={title:'Business Accounting'};
export default async function Page(){await requireBusinessClient();return <AccountingTools/>;}
