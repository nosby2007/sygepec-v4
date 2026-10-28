import {requireBusinessClient} from '@/lib/auth';
import AccountingTools from '../AccountingTools';
import ReturnStatus from './ReturnStatus';
export const metadata={title:'Business Accounting'};
export default async function Page(){await requireBusinessClient();return <><ReturnStatus/><AccountingTools/></>;}
