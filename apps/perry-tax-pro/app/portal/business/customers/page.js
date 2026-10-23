import {requireBusinessClient} from '@/lib/auth';
import Customers from './Customers';
export const metadata={title:'Business Customers'};
export default async function Page(){await requireBusinessClient();return <Customers/>;}
