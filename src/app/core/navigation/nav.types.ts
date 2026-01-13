export type NavVisibility = 'always' | 'adminOnly' | 'orgOnly' | 'personalOnly';

export interface NavItem {
  id: string;
  label: string;
  route: string;
  icon?: string;              // optionnel (Material icons, svg key, etc.)
  visibility?: NavVisibility; // filtre de base
  orgRolesAllowed?: string[]; // filtre supplémentaire si org context (RBAC)
  children?: NavItem[];
}
