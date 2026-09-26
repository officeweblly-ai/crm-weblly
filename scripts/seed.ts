/**
 * Seed script (service role — run locally only).
 *
 *   npm run seed:templates   starter questionnaire templates (real, reusable)
 *   npm run seed             templates + DEMO leads/clients/projects/payments/…
 *   npm run seed:reset       delete every demo row (is_demo = true) and its children
 *
 * Demo rows are flagged is_demo = true and shown with a "נתוני דמו" badge.
 * The application never depends on them.
 */
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "../src/lib/supabase/database.types";
import { DESIGN_STEP } from "./design-step";

config({ path: ".env.local" });
config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const db = createClient<Database>(url, key, { auth: { persistSession: false } });

function must<T>(r: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (r.error || r.data === null || r.data === undefined) throw new Error(`${what}: ${r.error?.message ?? "no data"}`);
  return r.data as NonNullable<T>;
}

const day = (offset: number) => {
  const d = new Date(Date.now() + offset * 86400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(d);
};

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
type Q = {
  key: string;
  type: Database["public"]["Enums"]["question_type"];
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  maps_to?: string;
  when?: { key: string; operator: "equals" | "answered" | "includes"; value?: string };
  /** multi_select: "choose up to N" */
  max?: number;
};
type Tpl = { name: string; description: string; project_type: Database["public"]["Enums"]["project_type"]; sections: { title: string; description?: string; questions: Q[] }[] };

/** Step 1 is identical in all templates; `business` label differs per template. */
const contactSection = (businessLabel: string) => ({
  title: "פרטי התקשרות וזהות העסק",
  description: "כמה פרטים בסיסיים — כדי שנדע איך לחזור אליכם.",
  questions: [
    { key: "name", type: "short_text", label: "שם מלא", required: true, maps_to: "client.name" },
    { key: "business", type: "short_text", label: businessLabel, required: true, maps_to: "client.business_name" },
    { key: "email", type: "email", label: "דואר אלקטרוני (Email)", required: true, maps_to: "client.email" },
    { key: "phone", type: "phone", label: "מספר טלפון", required: true, maps_to: "client.phone" },
  ] as Q[],
});

const designSection = DESIGN_STEP as unknown as Tpl["sections"][number];

const TEMPLATES: Tpl[] = [
  {
    name: "אתר תדמית — אפיון מלא",
    description: "מיצוב המותג, ה-Hero, תוכן, יתרונות והנעה לפעולה — ברובו שאלות בחירה, כדי שהלקוח יענה מהר.",
    project_type: "business_site",
    sections: [
      contactSection("שם העסק / המותג"),
      {
        title: "מיצוב המותג והגדרת ה-Hero Section",
        description: "מה האתר צריך להשיג, ואיך הוא צריך להרגיש מהשנייה הראשונה.",
        questions: [
          { key: "goal", type: "single_select", label: "מהי מטרת העל של האתר החדש?", required: true, options: ["יצירת לידים ומכירות", "מיתוג וביסוס סמכות בתחום", "הצגת תיק עבודות / פרויקטים", "מתן מידע שירותי ללקוחות קיימים", "אחר"] },
          { key: "goal_other", type: "short_text", label: "מהי המטרה?", required: true, when: { key: "goal", operator: "equals", value: "אחר" } },
          { key: "feeling", type: "multi_select", label: "איזה רגש או רושם ראשוני האתר צריך לעורר במבקר?", required: true, max: 2, options: ["יוקרה, אקסקלוסיביות ואיכות", "חדשנות, טכנולוגיה וקדמה", "חמימות, נגישות ובגובה העיניים", "סמכותיות, יציבות ומקצועיות ללא פשרות", "צעירות, אנרגיה וקלילות"] },
          { key: "value_prop", type: "single_select", label: "מהי הצעת הערך המרכזית (Value Proposition) שתופיע בכותרת הראשית?", required: true, options: ["חיסכון בזמן / משאבים", "הגדלת הכנסות / תוצאות עסקיות", "שקט נפשי וליווי מקצועי", "מוצר/שירות בהתאמה אישית", "איכות ופרימיום ללא תחרות"] },
          { key: "audience", type: "single_select", label: "מי הקהל המרכזי אליו האתר פונה?", required: true, options: ["בעלי עסקים / חברות (B2B)", "לקוחות פרטיים (B2C)", "ארגונים גדולים / מוסדות", "גם B2B וגם B2C"] },
        ],
      },
      {
        title: "תוכן, יתרונות והנעה לפעולה",
        description: "מה ישכנע את המבקר — ומה נבקש ממנו לעשות.",
        questions: [
          { key: "advantages", type: "multi_select", label: "מהם 2 היתרונות המרכזיים שיוצגו בבלוק \"למה דווקא אנחנו\"?", required: true, max: 2, options: ["ניסיון ומוניטין של שנים", "יחס אישי וליווי צמוד", "טכנולוגיה / שיטה ייחודית", "מחיר תחרותי / תמורה גבוהה", "זמינות גבוהה ומהירות תגובה"] },
          { key: "objections", type: "multi_select", label: "מהן ההתנגדויות הנפוצות של לקוחות שהאתר צריך להפיג?", required: true, options: ["\"זה יקר לי מדי\"", "\"ניסיתי בעבר וזה לא עבד\"", "\"אין לי זמן לתהליך כזה\"", "\"אני לא בטוח שזה מתאים בדיוק לעסק שלי\"", "\"אני לא מכיר את החברה/המותג\""] },
          { key: "cta", type: "single_select", label: "מהי ההנעה המרכזית לפעולה (CTA) לאורך האתר?", required: true, options: ["השארת פרטים בטופס", "מעבר מיידי לשיחת WhatsApp", "תיאום שיחה ביומן (Calendly וכד')", "חיוג טלפוני ישיר"] },
          { key: "social_proof", type: "multi_select", label: "איזה תוכן הוכחה חברתית (Social Proof) זמין להצגה באתר?", required: true, options: ["המלצות כתובות מלקוחות", "סרטוני וידאו של לקוחות", "לוגואים של חברות שעבדנו איתן", "מספרים ונתוני הצלחה (קילומטראז', לקוחות וכו')", "אין כרגע הוכחות חברתיות"] },
        ],
      },
    ],
  },
  {
    name: "חנות אונליין (E-commerce)",
    description: "קטלוג, חוויית רכישה, לוגיסטיקה, אמון ותשלומים.",
    project_type: "ecommerce",
    sections: [
      contactSection("שם העסק / החנות"),
      {
        title: "סוג הקטלוג וחוויית הרכישה",
        description: "מה מוכרים, ובאיזה אופן הלקוחות קונים.",
        questions: [
          { key: "catalog", type: "single_select", label: "מהו היקף קטלוג המוצרים בחנות?", required: true, options: ["מוצר יחיד (One Product Store)", "קטלוג מצומצם (1–20 מוצרים)", "קטלוג בינוני (20–100 מוצרים)", "חנות ענק (100+ מוצרים ומגוון קטגוריות)"] },
          { key: "basket", type: "single_select", label: "מהו ממוצע סל הקנייה הצפוי?", required: true, options: ["מוצרי אימפולס זולים (עד ₪150)", "סל ממוצע (₪150–₪500)", "מוצרי פרימיום / יקרים (₪500–₪2,000)", "מוצרי יוקרה (₪2,000+)"] },
          { key: "incentive", type: "single_select", label: "איזה תמריץ מרכזי יעודד רכישה ראשונה באתר?", required: true, options: ["משלוח חינם מעל סכום מסוים", "אחוז הנחה בהרשמה למועדון/ניוזלטר", "מתנה בקנייה מעל סכום מסוים", "מודל מבצעים מתחלפים / סייל זמני"] },
          { key: "experience", type: "single_select", label: "מהי חוויית הקנייה המרכזית שתרצה להדגיש בעמוד הבית?", required: true, options: ["מהירות ופשטות (קנייה ב-2 קליקים)", "חוויה ויזואלית ויוקרתית (Storytelling)", "הדגשת מבצעים ודילים", "חיפוש וסינון מתקדם לפי קטגוריות"] },
        ],
      },
      {
        title: "לוגיסטיקה, אמון ואוטומציה",
        description: "משלוחים, תשלומים ומה ייתן ללקוחות ביטחון לקנות.",
        questions: [
          { key: "trust", type: "multi_select", label: "איזה אלמנט אמון (Trust Badge) הכי חשוב להבליט בעמודי המוצר?", required: true, max: 2, options: ["משלוח מהיר עד הבית (1–3 ימי עסקים)", "מדיניות החזרות קלה ונוחה", "רכישה מאובטחת בתקן המחמיר ביותר", "אחריות רשמית ומלאה על המוצרים", "שירות לקוחות אנושי וזמין"] },
          { key: "shipping", type: "multi_select", label: "איך יתבצע ניהול המשלוחים בחנות?", required: true, options: ["שליח עד הבית", "איסוף עצמי מנקודות חלוקה / לוקרים", "איסוף עצמי מהחנות / מחסן", "משלוח בינלאומי"] },
          { key: "payments", type: "multi_select", label: "מהם אמצעי התשלום שיהיו זמינים בחנות?", required: true, options: ["כרטיסי אשראי (ישראלי ובינלאומי)", "Apple Pay / Google Pay", "הוראת קבע / תשלומים בקרדיט", "Bit / PayBox", "PayPal"] },
          { key: "marketing_goal", type: "single_select", label: "מהו היעד השיווקי העיקרי של החנות בחודשים הראשונים?", required: true, options: ["גיוס לקוחות חדשים במהירות", "הגדלת ערך סל הקנייה הממוצע", "בניית מועדון לקוחות חוזרים", "חשיפת מותג חדש בשוק"] },
        ],
      },
    ],
  },
  {
    name: "מערכת / אפליקציית SaaS",
    description: "שלב המוצר, הבעיה שהוא פותר, המשתמשים ומודל התמחור.",
    project_type: "web_app",
    sections: [
      contactSection("שם החברה / המוצר"),
      {
        title: "הגדרת המוצר, הבעיה והפתרון",
        description: "איפה המוצר עומד היום, ולמי הוא נועד.",
        questions: [
          { key: "stage", type: "single_select", label: "מהו שלב הפיתוח הנוכחי של המוצר/המערכת?", required: true, options: ["רעיון / אפיון ראשוני", "גרסת גרעין בסיסית (MVP)", "מוצר פעיל שמחפש צמיחה מחדש", "מערכת קיימת שעוברת מיתוג מחדש (Rebranding)"] },
          { key: "problem", type: "single_select", label: "מהי הבעיה המרכזית שהמערכת פותרת למשתמש?", required: true, options: ["אוטומציה של תהליכים ידניים ומייגעים", "איגוד וניהול נתונים במקום אחד", "חיסכון בעלויות תפעוליות וזמן", "שיפור חוויית הלקוח הסופי"] },
          { key: "user_type", type: "single_select", label: "איך היית מגדיר את סוג המשתמש העיקרי במערכת?", required: true, options: ["משתמש טכני / אנליסט / מנהל מערכת", "מנהל צוות / מקבל החלטות (C-Level)", "עובד תפעולי / משתמש קצה בסיסי", "הלקוח הסופי של בעל העסק"] },
          { key: "pricing", type: "single_select", label: "מהו מודל התמחור (Pricing Model) המתוכנן?", required: true, options: ["מודל מנויים חודשי/שנתי לפי חבילות (Freemium / Tiered)", "תשלום לפי שימוש (Pay-as-you-go)", "מודל Enterprise (הצעת מחיר מותאמת אישית)", "ללא תשלום בשלב זה / מודל פרסום"] },
        ],
      },
    ],
  },
];

/** Conditions on choice questions compare against the option's stable value. */
function optionValueFor(t: Tpl, when: NonNullable<Q["when"]>): string | null {
  const source = t.sections.flatMap((s) => s.questions as Q[]).find((x) => x.key === when.key);
  const idx = source?.options?.indexOf(when.value ?? "") ?? -1;
  return idx >= 0 ? `opt_${idx + 1}` : (when.value ?? null);
}

async function seedTemplates(isDemo: boolean) {
  const created: string[] = [];
  for (const base of TEMPLATES) {
    const t = { ...base, sections: [...base.sections, designSection] };
    const { data: existing } = await db.from("form_templates").select("id").eq("name", t.name).maybeSingle();
    if (existing) {
      console.log(`  template "${t.name}" exists — skipped`);
      created.push(existing.id);
      continue;
    }
    const tpl = must(
      await db
        .from("form_templates")
        .insert({ name: t.name, description: t.description, project_type: t.project_type, is_demo: isDemo, public_token: randomBytes(32).toString("base64url") })
        .select("id")
        .single(),
      "template",
    );
    const ids = new Map<string, string>();
    for (const [si, s] of t.sections.entries()) {
      const sec = must(await db.from("form_sections").insert({ template_id: tpl.id, title: s.title, description: s.description ?? null, position: si }).select("id").single(), "section");
      for (const [qi, q] of s.questions.entries()) {
        const options = (q.options ?? []).map((label, i) => ({ value: `opt_${i + 1}`, label }));
        const cond = q.when ? { question_id: ids.get(q.when.key)!, operator: q.when.operator, value: optionValueFor(t, q.when) } : null;
        const row = must(
          await db
            .from("form_questions")
            .insert({
              section_id: sec.id,
              type: q.type,
              label: q.label,
              description: q.description ?? null,
              placeholder: q.placeholder ?? null,
              required: q.required ?? false,
              options,
              condition: cond as Json,
              maps_to: q.maps_to ?? null,
              max_choices: q.type === "multi_select" ? (q.max ?? null) : null,
              position: qi,
            })
            .select("id")
            .single(),
          "question",
        );
        ids.set(q.key, row.id);
      }
    }
    created.push(tpl.id);
    console.log(`  template "${t.name}" created`);
  }
  return created;
}

async function snapshotOf(templateId: string) {
  const t = must(
    await db.from("form_templates").select("name, form_sections(id, title, description, position, form_questions(*))").eq("id", templateId).single(),
    "snapshot",
  );
  return {
    template_name: t.name,
    sections: [...t.form_sections]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        questions: [...s.form_questions]
          .sort((a, b) => a.position - b.position)
          .map((q) => ({ id: q.id, type: q.type, label: q.label, description: q.description, placeholder: q.placeholder, required: q.required, options: q.options, condition: q.condition, maps_to: q.maps_to, max_choices: q.max_choices })),
      })),
  };
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------
async function seedDemo(templateIds: string[]) {
  const { count } = await db.from("clients").select("id", { count: "exact", head: true }).eq("is_demo", true);
  await db.from("leads").delete().eq("is_demo", true).is("converted_client_id", null);
  if ((count ?? 0) > 0) {
    console.log("  demo data already present — run `npm run seed:reset` first to recreate it.");
    return;
  }

  // Leads
  must(
    await db.from("leads").insert([
      { name: "רונית אברהם", business_name: "רונית — סטודיו לפילאטיס", phone: "052-481-2290", email: "ronit.pilates@example.com", source: "instagram", project_type: "landing_page", estimated_value: 3800, status: "new", follow_up_date: day(1), notes: "ראתה את הפוסט על דף הנחיתה של המאפייה. רוצה קמפיין לפתיחת קבוצה חדשה.", is_demo: true },
      { name: "עמית שגיא", business_name: "שגיא הנדסת מבנים", phone: "054-770-1834", email: "amit@sagi-eng.example.com", source: "referral", project_type: "business_site", estimated_value: 12000, status: "proposal_sent", follow_up_date: day(-2), notes: "הומלץ ע״י יעל. נשלחה הצעת מחיר ל-12,000 ₪ כולל 6 עמודים.", is_demo: true },
      { name: "מאיה בן דוד", business_name: "מאיה — עיצוב תכשיטים", phone: "050-993-4412", source: "website", project_type: "ecommerce", estimated_value: 18500, status: "contacted", follow_up_date: day(5), is_demo: true },
      { name: "אלון פרץ", phone: "053-201-7765", source: "facebook", project_type: "landing_page", estimated_value: 2500, status: "lost", notes: "בחר בפתרון זול יותר.", is_demo: true },
    ], { defaultToNull: false }).select("id"),
    "leads",
  );

  // Clients + projects
  const clients = must(
    await db
      .from("clients")
      .insert([
        { name: "יעל כהן", business_name: "מאפיית השכונה", phone: "050-123-4567", email: "yael@bakery.example.com", website: "bakery-example.co.il", source: "referral", is_demo: true },
        { name: "דניאל לוי", business_name: "לוי ושות׳ — משרד עורכי דין", phone: "052-765-4321", email: "daniel@levi-law.example.com", source: "google", is_demo: true },
        { name: "נועה מזרחי", business_name: "Noa Studio — צילום", phone: "054-333-2211", email: "noa@noastudio.example.com", website: "noastudio.example.com", source: "instagram", is_demo: true },
        { name: "אורי גולן", business_name: "גולן אופניים", phone: "058-445-9900", email: "ori@golan-bikes.example.com", source: "returning_client", status: "completed", is_demo: true },
      ], { defaultToNull: false })
      .select("id, name"),
    "clients",
  );
  const [bakery, law, studio, bikes] = clients;

  const projects = must(
    await db
      .from("projects")
      .insert([
        { client_id: bakery.id, name: "אתר תדמית — מאפיית השכונה", project_type: "business_site", total_price: 9500, deposit_amount: 3000, status: "design", start_date: day(-20), deadline: day(12), next_action: "לשלוח סקיצת דף הבית לאישור", description: "אתר תדמית עם תפריט, סניפים והזמנת עוגות מראש." },
        { client_id: law.id, name: "אתר למשרד עורכי דין", project_type: "business_site", total_price: 14000, deposit_amount: 4000, status: "awaiting_deposit", start_date: day(-3), deadline: day(40), next_action: "לוודא העברת מקדמה" },
        { client_id: studio.id, name: "תיק עבודות — Noa Studio", project_type: "business_site", total_price: 7200, deposit_amount: 2000, status: "questionnaire_sent", start_date: day(-1), deadline: day(30), next_action: "לחכות לשאלון האפיון" },
        { client_id: bikes.id, name: "חנות אונליין — גולן אופניים", project_type: "ecommerce", total_price: 21000, deposit_amount: 6000, status: "awaiting_final_payment", start_date: day(-75), deadline: day(-5), next_action: "לגבות יתרה ולהעביר גישות", description: "חנות WooCommerce עם 120 מוצרים וסליקה." },
      ], { defaultToNull: false })
      .select("id, name, client_id"),
    "projects",
  );
  const [pBakery, pLaw, pStudio, pBikes] = projects;

  must(
    await db.from("payments").insert([
      { project_id: pBakery.id, amount: 3000, paid_at: day(-19), method: "bit", kind: "deposit", reference: "BIT-88213" },
      { project_id: pBikes.id, amount: 6000, paid_at: day(-74), method: "bank_transfer", kind: "deposit", reference: "העברה 4471" },
      { project_id: pBikes.id, amount: 8000, paid_at: day(-30), method: "bank_transfer", kind: "installment" },
      { project_id: pBikes.id, amount: 2500, paid_at: day(-2), method: "credit_card", kind: "installment", note: "חלק מהיתרה" },
    ], { defaultToNull: false }).select("id"),
    "payments",
  );

  must(
    await db.from("tasks").insert([
      { title: "קבלת לוגו בווקטור", project_id: pBakery.id, priority: "high", status: "done" },
      { title: "עיצוב אזור ה-Hero", project_id: pBakery.id, priority: "medium", due_date: day(2) },
      { title: "עיצוב דסקטופ", project_id: pBakery.id, priority: "medium", due_date: day(6) },
      { title: "התאמה למובייל", project_id: pBakery.id, priority: "medium", due_date: day(9) },
      { title: "לשלוח חוזה לחתימה", project_id: pLaw.id, priority: "urgent", due_date: day(-1) },
      { title: "גביית יתרת תשלום", project_id: pBikes.id, priority: "high", due_date: day(-3) },
      { title: "חיבור דומיין", project_id: pBikes.id, priority: "medium", due_date: day(3) },
      { title: "להכין הצעת מחיר לתחזוקה שנתית", client_id: bikes.id, priority: "low", due_date: day(14) },
    ], { defaultToNull: false }).select("id"),
    "tasks",
  );

  must(
    await db.from("notes").insert([
      { client_id: bakery.id, project_id: pBakery.id, body: "יעל מעדיפה גוונים חמים, לא ורוד. חשוב לה שהתפריט יתעדכן בקלות — לבדוק עריכה עצמית.", is_pinned: true },
      { client_id: law.id, body: "דניאל זמין רק בבקרים. להעדיף מייל על פני טלפון." },
    ], { defaultToNull: false }).select("id"),
    "notes",
  );

  must(await db.from("contracts").insert([{ client_id: bikes.id, project_id: pBikes.id, title: "הסכם עבודה — חנות אונליין", status: "signed", contract_date: day(-76), signed_at: day(-75) }], { defaultToNull: false }).select("id"), "contracts");

  // Questionnaires: one completed (bakery), one pending (studio)
  const tplId = templateIds[0];
  const snap = await snapshotOf(tplId);
  const token = () => randomBytes(32).toString("base64url");
  const completed = must(
    await db.from("form_submissions").insert({ token: token(), template_id: tplId, project_id: pBakery.id, title: "אפיון אתר — מאפיית השכונה", form_snapshot: snap as unknown as Json, status: "sent", sent_at: new Date(Date.now() - 18 * 86400_000).toISOString() }).select("id").single(),
    "submission",
  );
  must(await db.from("form_submissions").insert({ token: token(), template_id: tplId, project_id: pStudio.id, title: "אפיון אתר — Noa Studio", form_snapshot: snap as unknown as Json, status: "sent", sent_at: new Date(Date.now() - 86400_000).toISOString() }).select("id").single(), "submission 2");

  const byLabel = new Map(snap.sections.flatMap((s, si) => s.questions.map((q, qi) => [q.label, { q, s, si, qi }])));
  const answer = (label: string, value: Json) => {
    const hit = byLabel.get(label)!;
    return { question_id: hit.q.id, section_title: hit.s.title, section_position: hit.si, question_label: hit.q.label, question_type: hit.q.type, position: hit.qi, value };
  };
  const answers = [
    answer("שם מלא", "יעל כהן"),
    answer("שם העסק / המותג", "מאפיית השכונה"),
    answer("דואר אלקטרוני (Email)", "yael@bakery.example.com"),
    answer("מספר טלפון", "050-123-4567"),
    answer("מהי מטרת העל של האתר החדש?", "יצירת לידים ומכירות"),
    answer("איזה רגש או רושם ראשוני האתר צריך לעורר במבקר?", ["חמימות, נגישות ובגובה העיניים", "יוקרה, אקסקלוסיביות ואיכות"]),
    answer("מהי הצעת הערך המרכזית (Value Proposition) שתופיע בכותרת הראשית?", "איכות ופרימיום ללא תחרות"),
    answer("מי הקהל המרכזי אליו האתר פונה?", "לקוחות פרטיים (B2C)"),
    answer("מהם 2 היתרונות המרכזיים שיוצגו בבלוק \"למה דווקא אנחנו\"?", ["ניסיון ומוניטין של שנים", "יחס אישי וליווי צמוד"]),
    answer("מהן ההתנגדויות הנפוצות של לקוחות שהאתר צריך להפיג?", ["\"זה יקר לי מדי\""]),
    answer("מהי ההנעה המרכזית לפעולה (CTA) לאורך האתר?", "מעבר מיידי לשיחת WhatsApp"),
    answer("איזה תוכן הוכחה חברתית (Social Proof) זמין להצגה באתר?", ["המלצות כתובות מלקוחות"]),
  ];
  const fin = await db.rpc("finalize_questionnaire", { p_submission_id: completed.id, p_answers: answers, p_client: {} });
  if (fin.error) throw new Error(`finalize: ${fin.error.message}`);
  // The trigger moved the project to "questionnaire_received"; put it back where the story is.
  await db.from("projects").update({ status: "design" }).eq("id", pBakery.id);

  console.log(`  demo data created: ${clients.length} clients, ${projects.length} projects, payments, tasks, questionnaires`);
}

async function reset() {
  const { data: files } = await db.from("files").select("storage_path, clients!inner(is_demo)").eq("clients.is_demo", true);
  if (files?.length) await db.storage.from("crm-files").remove(files.map((f) => f.storage_path));
  const c = await db.from("clients").delete().eq("is_demo", true).select("id");
  const l = await db.from("leads").delete().eq("is_demo", true).select("id");
  const t = await db.from("form_templates").delete().eq("is_demo", true).select("id");
  console.log(`  removed demo: ${c.data?.length ?? 0} clients (with their projects, payments, files…), ${l.data?.length ?? 0} leads, ${t.data?.length ?? 0} templates`);
}

async function main() {
  const mode = process.argv[2] ?? "all";
  if (mode === "reset") return reset();
  console.log("Seeding questionnaire templates…");
  const ids = await seedTemplates(false);
  if (mode === "templates") return;
  console.log("Seeding demo data…");
  await seedDemo(ids);
}

main()
  .then(() => console.log("Done."))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
