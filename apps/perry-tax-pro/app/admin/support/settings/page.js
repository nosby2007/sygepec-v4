import { PageHead } from "@/components/ui";
import { RoleForm, SlaForm } from "@/components/support/SettingsForms";
import { requireSupportPage } from "@/lib/support-access";
import { PERMISSIONS as P, can } from "@/lib/support-rules";
import { listSupportStaff, slaPolicy } from "@/lib/support-settings";

export const metadata = { title: "Support settings" };

export default async function Page() {
  const session = await requireSupportPage(P.SLA_VIEW);
  const canManageRoles = can(session, P.ROLES_MANAGE);
  const [policy, staff] = await Promise.all([slaPolicy(), canManageRoles ? listSupportStaff() : []]);
  return (
    <>
      <PageHead kicker="Support Operations" icon="gear" title="Support Settings" desc="Deadlines, office hours and who holds which role." />
      <div className="stack">
        <SlaForm policy={policy} canEdit={can(session, P.SLA_MANAGE)} />
        {canManageRoles && <RoleForm staff={staff} me={session.uid} />}
      </div>
    </>
  );
}
