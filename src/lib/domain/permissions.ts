/**
 * Areas a custom team role can open. The owner always sees everything, and a
 * person with no role sees everything (nobody gets locked out by default).
 * Enforced three times: the nav hides the area, the page redirects, and RLS
 * guards the sensitive V4 tables (has_permission() in SQL).
 */
export const PERMISSIONS = [
  { key: "leads", label: "לידים", hint: "לידים חדשים ומעקב מכירות" },
  { key: "proposals", label: "הצעות מחיר", hint: "בנייה ושליחה של הצעות" },
  { key: "contracts", label: "חוזים והסכמים", hint: "הסכמי לקוחות וחתימות" },
  { key: "finances", label: "כספים והוצאות", hint: "תשלומים, יתרות, הוצאות ורווח" },
  { key: "strategy", label: "אסטרטגיה ויעדים", hint: "תוכנית העסק והיעדים" },
  { key: "partners", label: "הסכם שותפים", hint: "ההסכם בין השותפים" },
  { key: "social", label: "סושיאל ותיק עבודות", hint: "תוכן לרשתות ותיק העבודות" },
  { key: "questionnaires", label: "תבניות שאלונים", hint: "עריכת תבניות האפיון" },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];
export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key) as [Permission, ...Permission[]];

export type Access = { all: true } | { all: false; allowed: Set<string> };

export function can(access: Access, area: Permission | null | undefined): boolean {
  if (!area) return true;
  return access.all || access.allowed.has(area);
}

/** Which permission (if any) a route needs. */
export function areaForPath(path: string): Permission | null {
  const rules: [string, Permission][] = [
    ["/leads", "leads"],
    ["/proposals", "proposals"],
    ["/contracts", "contracts"],
    ["/finances", "finances"],
    ["/business/expenses", "finances"],
    ["/business/strategy", "strategy"],
    ["/business/partners", "partners"],
    ["/social", "social"],
    ["/portfolio", "social"],
    ["/questionnaires/templates", "questionnaires"],
  ];
  const hit = rules.find(([p]) => path === p || path.startsWith(`${p}/`));
  return hit ? hit[1] : null;
}
