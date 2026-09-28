/**
 * Proposal helpers. `draftFromQuestionnaire` turns a submitted questionnaire
 * into an editable proposal draft: it only restates what the client answered
 * (project type, pages, store, features, languages, design, integrations,
 * deadline, notes) and adds the studio's standard inclusions/exclusions.
 * Prices are never guessed — the partner fills them in.
 */
import { formatDate } from "@/lib/format";

export type AnswerLike = { section_title: string; question_label: string; question_type: string; value: unknown };

export type ProposalDraft = {
  title: string;
  intro: string;
  scope: string;
  included: string[];
  excluded: string[];
  delivery_estimate: string;
  notes: string;
};

/** Standard studio items — editable per proposal. */
export const STANDARD_INCLUDED = ["עיצוב מותאם אישית לעסק", "התאמה מלאה למובייל ולטאבלט", "SEO בסיסי: כותרות, תיאורים ומהירות טעינה", "חיבור דומיין והעלאה לאוויר"];
export const STANDARD_EXCLUDED = ["כתיבת תוכן שיווקי (אלא אם סוכם אחרת)", "צילום מקצועי", "עלויות דומיין, אחסון ושירותי צד שלישי", "תוספים ורישיונות בתשלום"];

function text(type: string, v: unknown): string | null {
  if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) return null;
  switch (type) {
    case "yes_no":
      return v === "yes" ? "כן" : "לא";
    case "date":
      return formatDate(String(v));
    case "single_select":
    case "multi_select":
      return (Array.isArray(v) ? v : [v]).map(String).join(", ");
    case "image_upload":
    case "file_upload":
    case "reference_links":
      return null;
    default:
      return String(v).replace(/\s+/g, " ").trim();
  }
}

const TOPICS: { key: keyof typeof LABELS; re: RegExp }[] = [
  { key: "goal", re: /מטר(ה|ת)|למה (צריך|רוצים)|מה (העסק|אתם) עושים/ },
  { key: "pages", re: /עמוד|עמודים|דפים|דפי /},
  { key: "store", re: /חנות|מוצרים|סליקה|מכיר(ה|ות) (אונליין|באתר)|e-?commerce|משלוח/i },
  { key: "features", re: /פיצ['׳]ר|יכולות|פונקציונ|רכיבים|אפשרויות|מה (חשוב|צריך) שיהיה/ },
  { key: "languages", re: /שפ(ה|ות)/ },
  { key: "integrations", re: /אינטגרצ|חיבור|מערכ(ת|ות)|יומן|CRM|וו?אטסאפ|תשלומים|ניוזלטר|דיוור/i },
  { key: "design", re: /עיצוב|סגנון|תחושה|אווירה|צבע|פונט|גופן/ },
  { key: "deadline", re: /מועד|דדליין|לו["״]?ז|לוח זמנים|מתי|תאריך (יעד|השקה|עלייה)/ },
  { key: "notes", re: /הערות|עוד משהו|משהו נוסף|בקשות מיוחדות|דרישות מיוחדות|חשוב לכם לציין/ },
];

const LABELS = {
  goal: "מטרת האתר",
  pages: "עמודים",
  store: "חנות",
  features: "יכולות",
  languages: "שפות",
  integrations: "חיבורים ומערכות",
  design: "עיצוב",
  deadline: "לוח זמנים",
  notes: "הערות הלקוח",
};

export function draftFromQuestionnaire(input: { answers: AnswerLike[]; clientLabel: string; typeLabel: string }): ProposalDraft {
  const found: Partial<Record<keyof typeof LABELS, string[]>> = {};
  const featureItems: string[] = [];
  const pageItems: string[] = [];

  for (const a of input.answers) {
    const v = text(a.question_type, a.value);
    if (!v) continue;
    const topic = TOPICS.find((t) => t.re.test(a.question_label));
    if (!topic) continue;
    (found[topic.key] ??= []).push(v);
    if (Array.isArray(a.value) && a.question_type === "multi_select") {
      const list = (a.value as unknown[]).map(String).filter(Boolean);
      if (topic.key === "features" || topic.key === "integrations" || topic.key === "store") featureItems.push(...list);
      if (topic.key === "pages") pageItems.push(...list.map((p) => (/עמוד/.test(p) ? p : `עמוד ${p}`)));
    }
  }

  const line = (k: keyof typeof LABELS) => (found[k]?.length ? `${LABELS[k]}: ${[...new Set(found[k])].join(" · ")}` : null);
  const scope = [
    `${input.typeLabel} עבור ${input.clientLabel}, בהתאם לשאלון האפיון שמילא הלקוח.`,
    line("pages"),
    line("store"),
    line("features"),
    line("languages"),
    line("integrations"),
    line("design"),
  ]
    .filter(Boolean)
    .join("\n");

  const deadline = found.deadline?.[0] ?? "";
  return {
    title: `הצעת מחיר — ${input.typeLabel} ל${input.clientLabel}`,
    intro: found.goal?.length ? `לפי מה שסיפרתם לנו: ${found.goal[0]}` : "",
    scope,
    included: [...new Set([...pageItems, ...featureItems, ...STANDARD_INCLUDED])].slice(0, 40),
    excluded: STANDARD_EXCLUDED,
    delivery_estimate: deadline ? `לפי בקשת הלקוח: ${deadline}` : "",
    notes: found.notes?.join("\n") ?? "",
  };
}

/** "HZ-2026-004" — sequential per year. */
export function proposalNumber(year: number, seq: number): string {
  return `HZ-${year}-${String(seq).padStart(3, "0")}`;
}

/** Stable JSON (sorted keys) so a hash of stored jsonb never depends on key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
