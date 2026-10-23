import {requireRole} from '@/lib/auth';
import BusinessWorkspace from '../BusinessWorkspace';
export const metadata={title:'Business Workspace'};
export default async function Page(){await requireRole('CLIENT');return <BusinessWorkspace/>;}
