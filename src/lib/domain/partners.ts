/**
 * Partner agreement between the studio's partners. Frozen JSON, editable per
 * clause; each partner signs in-app. The default text is a practical starting
 * point for a two-partner studio — NOT legal advice; have a lawyer review it.
 */
import { z } from "zod";

export const partnerAgreementSchema = z.object({
  business: z.object({
    name: z.string().max(200),
    legal_name: z.string().max(200),
    business_id: z.string().max(50),
    address: z.string().max(300),
  }),
  partners: z
    .array(
      z.object({
        user_id: z.uuid(),
        name: z.string().trim().min(1, "חסר שם שותף").max(120),
        id_number: z.string().max(20),
        address: z.string().max(300),
        email: z.string().max(200),
        phone: z.string().max(50),
        equity: z.number().min(0).max(100),
        role: z.string().max(2000),
      }),
    )
    .min(2, "הסכם שותפים צריך לפחות שני שותפים")
    .max(6),
  effective_date: z.string().max(20),
  clauses: z.array(z.object({ title: z.string().trim().min(1, "לכל סעיף צריכה להיות כותרת").max(200), body: z.string().max(10000) })).max(40),
});
export type PartnerAgreement = z.infer<typeof partnerAgreementSchema>;
export type PartnerSeed = { user_id: string; name: string; email: string; phone: string; responsibilities: string[] };

export function defaultPartnerAgreement(opts: {
  business: PartnerAgreement["business"];
  partners: PartnerSeed[];
  today: string;
}): { title: string; content: PartnerAgreement } {
  const n = opts.partners.length;
  const even = Math.floor((100 / n) * 100) / 100;
  const partners = opts.partners.map((p, i) => ({
    user_id: p.user_id,
    name: p.name,
    id_number: "",
    address: "",
    email: p.email,
    phone: p.phone,
    equity: i === n - 1 ? Math.round((100 - even * (n - 1)) * 100) / 100 : even,
    role: p.responsibilities.length ? p.responsibilities.join(", ") : "",
  }));
  const biz = opts.business.name || "העסק";
  const roles = partners.map((p) => `${p.name}: ${p.role || "יוגדר בהמשך"}.`).join("\n");

  const clauses: PartnerAgreement["clauses"] = [
    {
      title: "מטרת השותפות",
      body: `השותפים מקימים ומפעילים יחד את ${biz} — סטודיו לעיצוב, פיתוח ובניית אתרים, מערכות ותוכן דיגיטלי ללקוחות עסקיים. השותפים יפעלו בתום לב, בשקיפות מלאה ולטובת העסק המשותף.`,
    },
    {
      title: "חלוקת הבעלות",
      body: `הבעלות בעסק, בנכסיו ובמוניטין שלו מתחלקת בין השותפים לפי האחוזים שבפרטי השותפים שלמעלה. שינוי בחלוקה ייעשה רק בהסכמה בכתב של כל השותפים.`,
    },
    {
      title: "תפקידים ותחומי אחריות",
      body: `${roles}\nחלוקת התחומים מנוהלת גם במערכת (צוות ועובדים ← תחומי אחריות) וניתן לעדכן אותה בהסכמה. כל שותף מחויב לעמוד במשימות שבאחריותו ולעדכן את השותף האחר על עיכובים.`,
    },
    {
      title: "זמן ומחויבות",
      body: "כל שותף יקדיש לעסק את הזמן הנדרש לביצוע תחומי האחריות שלו. עבודה עצמאית של שותף בתחום זהה לתחום העסק, מחוץ לעסק, תיעשה רק בהסכמה מראש ובכתב.",
    },
    {
      title: "הכנסות, רווחים ומשיכות",
      body: [
        "כל הכנסות העסק ייכנסו לחשבון העסק ויירשמו במערכת. תשלומים מלקוחות לא יתקבלו לחשבון פרטי של שותף.",
        "הרווח (הכנסות פחות הוצאות העסק) יחולק בין השותפים לפי אחוזי הבעלות, אחת לחודש או כפי שיוסכם.",
        "לפני חלוקה תישאר בעסק רזרבה של לפחות חודש הוצאות קבועות.",
        "משיכה של שותף מעבר לחלקו תחשב הלוואה ותקוזז מהחלוקה הבאה.",
      ].join("\n"),
    },
    {
      title: "הוצאות והתחייבויות",
      body: "הוצאות שוטפות (תוכנות, אחסון, שיווק) יירשמו במערכת בזמן אמת. הוצאה חד־פעמית מעל 2,000 ₪, מנוי קבוע חדש, או כל התחייבות לטווח ארוך (הלוואה, שכירות, העסקת עובד) — רק בהסכמת כל השותפים.",
    },
    {
      title: "קבלת החלטות",
      body: "החלטות שוטפות בתחום אחריותו של שותף — בידיו. החלטות מהותיות (תמחור, קבלת שותף, שינוי כיוון העסק, מכירה, פירוק) — בהסכמת כל השותפים. במקרה של מחלוקת, השותפים ייפגשו תוך 7 ימים לנסות להגיע להסכמה.",
    },
    {
      title: "לקוחות, קניין רוחני ונכסים",
      body: "הלקוחות, הקוד, העיצובים, התבניות, התכנים, הדומיינים, החשבונות והמותג שנוצרו במסגרת העסק שייכים לעסק ולא לשותף מסוים. הגישות לחשבונות העסק יישמרו כך שלכל שותף תהיה גישה.",
    },
    {
      title: "סודיות",
      body: "כל שותף ישמור בסודיות את המידע העסקי, פרטי הלקוחות, המחירים והידע של העסק — גם אחרי סיום השותפות.",
    },
    {
      title: "אי־תחרות ואי־שידול",
      body: "במהלך השותפות ובמשך 12 חודשים מסיומה, שותף שעזב לא יפנה ללקוחות העסק כדי להציע להם שירותים מתחרים, אלא בהסכמת השותף האחר.",
    },
    {
      title: "יציאה של שותף",
      body: "שותף המבקש לפרוש ייתן הודעה של 60 יום לפחות. לשותף שנשאר זכות ראשונים לקנות את חלקו לפי שווי שייקבע בהסכמה, ובהיעדר הסכמה — על ידי רואה חשבון מוסכם. עד השלמת היציאה, השותף הפורש ישלים את ההתחייבויות שבאחריותו כלפי לקוחות קיימים.",
    },
    {
      title: "פירוק",
      body: "בפירוק העסק ייפרעו תחילה כל התחייבויות העסק, ולאחר מכן תחולק היתרה לפי אחוזי הבעלות. פרויקטים פתוחים יושלמו או יועברו בצורה מסודרת ללקוחות.",
    },
    {
      title: "יישוב מחלוקות",
      body: "מחלוקת שלא נפתרה בשיחה תועבר לגישור אצל מגשר מוסכם. רק אם הגישור נכשל, ניתן לפנות לבוררות או לבית המשפט המוסמך. על ההסכם יחול הדין הישראלי.",
    },
    {
      title: "כללי",
      body: "הסכם זה ממצה את ההסכמות בין השותפים. כל שינוי ייעשה בכתב בהסכמת כל השותפים — במערכת, שינוי בנוסח פותח גרסה חדשה שכל השותפים חותמים עליה מחדש.",
    },
  ];

  return {
    title: `הסכם שותפות — ${biz}`,
    content: {
      business: opts.business,
      partners,
      effective_date: opts.today,
      clauses,
    },
  };
}

export const partnerNames = (a: PartnerAgreement) => a.partners.map((p) => p.name).join(", ");
