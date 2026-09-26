/**
 * Generated agreements. The content is a frozen JSON snapshot: party details,
 * commercial terms, scope and clauses. Everything is editable per agreement.
 *
 * NOTE: the default clauses are a practical starting template for a web studio,
 * not legal advice. The owner should have them reviewed by a lawyer once.
 */
import { z } from "zod";
import { formatDate, formatMoney } from "@/lib/format";

export const contractContentSchema = z.object({
  studio: z.object({
    name: z.string().max(200),
    legal_name: z.string().max(200),
    business_id: z.string().max(50),
    address: z.string().max(300),
    phone: z.string().max(50),
    email: z.string().max(200),
    signatory: z.string().max(200),
  }),
  client: z.object({
    name: z.string().trim().min(1, "יש להזין שם לקוח").max(200),
    business: z.string().max(200),
    business_id: z.string().max(50),
    address: z.string().max(300),
    phone: z.string().max(50),
    email: z.string().max(200),
  }),
  project: z.object({
    name: z.string().max(200),
    type_label: z.string().max(100),
    total: z.number().min(0).max(1e9),
    deposit: z.number().min(0).max(1e9),
    vat_note: z.string().max(200),
    start_date: z.string().max(20),
    deadline: z.string().max(20),
  }),
  scope: z.string().max(20000),
  clauses: z.array(z.object({ title: z.string().trim().min(1, "לכל סעיף צריכה להיות כותרת").max(200), body: z.string().max(10000) })).max(40),
  date: z.string().max(20),
});
export type ContractContent = z.infer<typeof contractContentSchema>;

type Ctx = Pick<ContractContent, "studio" | "client" | "project">;

export function defaultScope(typeLabel: string): string {
  return [
    `תכנון, עיצוב ופיתוח ${typeLabel || "אתר"} עבור הלקוח, בהתאם לשאלון האפיון שמילא הלקוח ולהערות שסוכמו בין הצדדים.`,
    "התאמה מלאה לתצוגה במחשב, בטאבלט ובטלפון נייד.",
    "הקמת עמודי התוכן שסוכמו, טפסי יצירת קשר וחיבור לכלים שנבחרו (וואטסאפ, טלפון, יומן וכד').",
    "הגדרות SEO בסיסיות (כותרות, תיאורים, מהירות טעינה) והתקנת כלי מדידה.",
    "העלאת האתר לאוויר וחיבור הדומיין.",
    "כל עבודה שאינה מפורטת כאן תתומחר בנפרד ותבוצע רק לאחר אישור הלקוח מראש.",
  ].join("\n");
}

export function defaultClauses({ project }: Ctx): ContractContent["clauses"] {
  const balance = Math.max(0, project.total - project.deposit);
  const money = (n: number) => formatMoney(n);
  return [
    {
      title: "לוחות זמנים",
      body: [
        project.start_date ? `תחילת העבודה: ${formatDate(project.start_date)}.` : "תחילת העבודה: עם קבלת המקדמה וחומרי הלקוח.",
        project.deadline ? `יעד משוער למסירה: ${formatDate(project.deadline)}.` : "יעד המסירה ייקבע בתיאום בין הצדדים.",
        "לוחות הזמנים מותנים בהעברת החומרים והמשובים מצד הלקוח בזמן. עיכוב מצד הלקוח ידחה את מועד המסירה בהתאם.",
      ].join("\n"),
    },
    {
      title: "תמורה ותנאי תשלום",
      body: [
        `התמורה הכוללת עבור העבודה: ${money(project.total)}${project.vat_note ? ` ${project.vat_note}` : ""}.`,
        project.deposit > 0 ? `מקדמה בסך ${money(project.deposit)} תשולם עם חתימת ההסכם, והעבודה תתחיל עם קבלתה.` : "",
        balance > 0 ? `יתרת התשלום בסך ${money(balance)} תשולם לפני העלאת האתר לאוויר / מסירת הגישות המלאות.` : "",
        "התשלום יבוצע בהעברה בנקאית, ביט, אשראי או באמצעי אחר שסוכם בין הצדדים.",
      ]
        .filter(Boolean)
        .join("\n"),
    },
    {
      title: "סבבי תיקונים",
      body: "ההצעה כוללת עד שני סבבי תיקונים בשלב העיצוב ועד סבב תיקונים אחד לאחר הפיתוח. שינויים מעבר לכך, או שינויים בתכולה שסוכמה, יתומחרו בנפרד ויבוצעו לאחר אישור הלקוח.",
    },
    {
      title: "חומרים ותכנים",
      body: "הלקוח אחראי להעביר את הטקסטים, התמונות, הלוגו וכל חומר נדרש, ומצהיר כי יש לו את הזכויות להשתמש בהם. הסטודיו אינו אחראי לתוכן שסופק על ידי הלקוח.",
    },
    {
      title: "קניין רוחני",
      body: "עם השלמת התשלום המלא, הזכויות בעיצוב הסופי ובתכני האתר יועברו ללקוח. הסטודיו רשאי להמשיך להשתמש ברכיבים כלליים, בקוד תשתיתי ובכלים שפיתח, וכן להציג את העבודה בתיק העבודות שלו, אלא אם סוכם אחרת בכתב.",
    },
    {
      title: "דומיין, אחסון ושירותי צד שלישי",
      body: "עלויות דומיין, אחסון, תוספים, רישיונות ושירותים בתשלום של צדדים שלישיים יחולו על הלקוח, אלא אם צוין אחרת בהסכם זה.",
    },
    {
      title: "אחריות ותמיכה",
      body: "במשך 30 יום מיום העלאת האתר לאוויר, הסטודיו יתקן ללא עלות תקלות הנובעות מהעבודה שביצע. תמיכה, עדכונים ותחזוקה לאחר מכן יינתנו במסגרת הסכם תחזוקה נפרד או לפי שעות עבודה.",
    },
    {
      title: "ביטול ההתקשרות",
      body: "כל צד רשאי להביא את ההתקשרות לסיום בהודעה בכתב. במקרה כזה ישלם הלקוח עבור העבודה שבוצעה עד מועד ההודעה, והמקדמה לא תוחזר ככל שכבר בוצעה עבודה בהיקפה.",
    },
    {
      title: "הגבלת אחריות",
      body: "אחריות הסטודיו בכל מקרה לא תעלה על הסכום ששולם לו בפועל במסגרת הסכם זה, והסטודיו לא יישא בנזקים עקיפים או תוצאתיים.",
    },
    {
      title: "סודיות",
      body: "כל צד ישמור בסודיות מידע עסקי של הצד האחר שהגיע אליו במסגרת העבודה, ולא יעשה בו שימוש אלא לצורך ביצוע הסכם זה.",
    },
    {
      title: "כללי",
      body: "הסכם זה ממצה את ההסכמות בין הצדדים. כל שינוי בו ייעשה בכתב ובהסכמת שני הצדדים. על הסכם זה יחול הדין הישראלי.",
    },
  ];
}

/** "WB-2026-007" — sequential per year. */
export function contractNumber(year: number, seq: number): string {
  return `WB-${year}-${String(seq).padStart(3, "0")}`;
}
