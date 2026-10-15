/**
 * The partnership agreement between the WEBLLY partners, as structured data:
 * parties → recitals (הואיל) → numbered sections (1.) → clauses (1.1) → blocks
 * (paragraphs, lettered lists, the ownership table). Rendering, PDF and the
 * editor all read this one shape. The content is frozen per version once
 * anyone signs it (see partner_agreement_versions).
 *
 * The default text is the owners' agreement (source: WEBLLY partnership PDF,
 * Oct 2026), restructured for a legal layout without changing its meaning.
 */
import { z } from "zod";

const text = (max: number) => z.string().max(max);

export const blockSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("p"), text: text(5000) }),
  /** Lettered list — rendered (א), (ב), (ג)… */
  z.object({ t: z.literal("list"), items: z.array(text(2000)).min(1).max(30) }),
  /** Ownership table, built from the parties' equity. */
  z.object({ t: z.literal("equity") }),
]);
export type Block = z.infer<typeof blockSchema>;

export const partySchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,30}$/),
  name: z.string().trim().min(2, "חסר שם").max(120),
  /** Defined term: (להלן: "ינאי") */
  short: z.string().trim().min(1, "חסר כינוי").max(40),
  gender: z.enum(["m", "f"]),
  title: z.string().trim().max(40),
  role: z.string().trim().max(300),
  equity: z.number().min(0).max(100),
});
export type Party = z.infer<typeof partySchema>;

export const clauseSchema = z.object({ title: z.string().trim().max(200), blocks: z.array(blockSchema).max(40) });
export const sectionSchema = z.object({ title: z.string().trim().min(1, "לכל פרק צריכה להיות כותרת").max(200), clauses: z.array(clauseSchema).max(40) });
export type Clause = z.infer<typeof clauseSchema>;
export type Section = z.infer<typeof sectionSchema>;

export const partnerAgreementSchema = z.object({
  brand: z.string().trim().min(1).max(60),
  parties: z.array(partySchema).min(2, "הסכם שותפים צריך לפחות שני שותפים").max(6),
  recitals: z.array(z.string().trim().min(1).max(3000)).max(12),
  operative: z.string().trim().max(300),
  sections: z.array(sectionSchema).min(1).max(30),
  /** Short note shown under the title until every party has signed. */
  notice: z.string().max(1000),
});
export type PartnerAgreement = z.infer<typeof partnerAgreementSchema>;

export const PARTNERSHIP_TITLE = "הסכם שותפות וניהול פעילות";

const p = (t: string): Block => ({ t: "p", text: t });
const list = (...items: string[]): Block => ({ t: "list", items });

/** The WEBLLY partnership agreement — wording from the owners' PDF. */
export function defaultPartnerAgreement(): { title: string; content: PartnerAgreement } {
  return {
    title: PARTNERSHIP_TITLE,
    content: {
      brand: "WEBLLY",
      parties: [
        { key: "yanai", name: "ינאי מזרחי", short: "ינאי", gender: "m", title: "שותף", role: "פיתוח, מערכות וניהול כספים", equity: 50 },
        { key: "noya", name: "נויה גאולה", short: "נויה", gender: "f", title: "שותפה", role: "שיווק, מכירות ולקוחות", equity: 50 },
      ],
      recitals: [
        "והשותפים פועלים יחד תחת המותג WEBLLY לצורך מתן שירותי פיתוח, בניית אתרים, חנויות אינטרנטיות, מערכות, פתרונות דיגיטליים, ניהול לקוחות, עיצוב חוויית משתמש ושירותים נלווים;",
        "והשותפים מעוניינים להסדיר את מערכת היחסים העסקית ביניהם כבעלי פעילות משותפת תחת המותג WEBLLY, לרבות בעלות, חלוקת תפקידים, ניהול כספים, התקשרות עם לקוחות, הצעות מחיר, חוזים, וזכויות בנכסי העסק והעבודה השוטפת;",
      ],
      operative: "לפיכך הוצהר, הותנה והוסכם בין הצדדים כדלקמן:",
      sections: [
        {
          title: "הצדדים, מהות ההתקשרות והמותג",
          clauses: [
            {
              title: "הצדדים",
              blocks: [p("הסכם זה נערך בין ינאי מזרחי (להלן: \"ינאי\") לבין נויה גאולה (להלן: \"נויה\"). ינאי ונויה ייקראו יחד להלן: \"השותפים\".")],
            },
            {
              title: "המותג והפעילות",
              blocks: [p("השותפים פועלים יחד תחת המותג WEBLLY, לצורך מתן שירותי פיתוח, בניית אתרים, חנויות אינטרנטיות, מערכות, פתרונות דיגיטליים, ניהול לקוחות, עיצוב חוויית משתמש ושירותים נלווים.")],
            },
            {
              title: "מטרת ההסכם",
              blocks: [p("מטרת הסכם זה היא להגדיר בצורה מסודרת את הבעלות על העסק, חלוקת התפקידים, אופן ניהול הפעילות, ניהול הכספים, קבלת ההחלטות, העבודה מול לקוחות והזכויות בנכסי WEBLLY.")],
            },
          ],
        },
        {
          title: "בעלות על WEBLLY",
          clauses: [
            {
              title: "בעלות שווה",
              blocks: [
                p("השותפים מסכימים כי WEBLLY הינו עסק בבעלות משותפת ושווה, כך שלכל אחד מהשותפים יש 50% מהזכויות בעסק."),
                { t: "equity" },
                p("הבעלות המשותפת חלה על שם המותג, מוניטין, תהליכי עבודה, נכסי דיגיטל, חומרי שיווק, אתר העסק, חשבונות הסושיאל, תיק הלקוחות, מסמכי העבודה, קבצי הפרויקטים ונכסים שנוצרו במסגרת הפעילות של WEBLLY."),
                p("אף אחד מן השותפים לא יהיה רשאי למכור, להעביר, לשעבד או למסור זכויות בעסק או בחלק ממנו לצד שלישי, ללא אישור בכתב של השותף השני."),
              ],
            },
          ],
        },
        {
          title: "חלוקת תפקידים וסמכויות",
          clauses: [
            {
              title: "תחום אחריותו של ינאי",
              blocks: [
                list(
                  "פיתוח האתרים, החנויות, המערכות והמוצרים הדיגיטליים של WEBLLY.",
                  "ניהול הצד הטכנולוגי והמערכתי של הפרויקטים.",
                  "ניהול הכנסות, הוצאות, תזרים, תשלומים, מעקב כספי ורישום חשבונאי פנימי של הפעילות.",
                  "ניהול אמצעי התשלום של העסק וקבלת הכספים המתקבלים מלקוחות.",
                  "אישור והוצאה של כספים לצורכי העסק, לרבות תוכנות, מנויים, תשתיות, ספקים, קמפיינים והוצאות נלוות.",
                  "ביצוע חלוקת התשלומים/המשיכות לשותפים לפי תנאי הסכם זה.",
                ),
              ],
            },
            {
              title: "תחום אחריותה של נויה",
              blocks: [
                list(
                  "שיווק וקידום WEBLLY.",
                  "יצירת קשר עם לקוחות פוטנציאליים, ניהול שיחות מכירה וסגירת הזדמנויות.",
                  "ניהול התקשורת השוטפת מול לקוחות, טיפול בלידים ושירות לקוחות.",
                  "סיוע בבניית מעטפת השירות, איסוף צרכי הלקוח, תיאום ציפיות וליווי הלקוח לאורך תהליך העבודה.",
                ),
              ],
            },
            {
              title: "קבלת החלטות",
              blocks: [
                p("לצורך התפעול השוטף של העסק, ינאי ישמש כגורם המנהל בפועל את הצד הכספי והביצועי של הפעילות."),
                p("כל ההחלטות הכספיות השוטפות של העסק, לרבות גובה הוצאות, אישור תשלומים, ניהול תזרים, הוצאת כספים בפועל וחלוקת תשלומים/משיכות לשותפים — יתקבלו ויבוצעו על ידי ינאי."),
                p("למרות האמור, תמחור השירותים, התחייבות מסחרית ללקוח, והגדרת הצעת המחיר לפרויקט מסוים, יהיו טעונים תיאום והסכמה משותפת בין ינאי לנויה."),
                p("בנושאים עסקיים מהותיים, בעיות עם לקוחות, שינוי מודל פעילות או החלטה המשפיעה מהותית על העסק, יפעלו השותפים בתיאום זה עם זה ככל הניתן."),
              ],
            },
          ],
        },
        {
          title: "ניהול הכנסות, הוצאות ותשלומים",
          clauses: [
            {
              title: "ניהול כספי העסק",
              blocks: [
                p("כל הכספים המתקבלים מלקוחות במסגרת WEBLLY, לרבות מקדמות, תשלומי ביניים ותשלומים סופיים, יועברו וינוהלו באמצעות אמצעי התשלום או החשבון המנוהל על ידי ינאי, אלא אם יוחלט אחרת בכתב."),
                p("ינאי ירכז את כלל הרישום הכספי של העסק, לרבות הכנסות, הוצאות, יתרות, התחייבויות, תשלומי ספקים, מנויים, כלים, שיווק ותשלומים חוזרים."),
              ],
            },
            {
              title: "שקיפות",
              blocks: [
                p("על אף שהניהול הכספי השוטף מתבצע בפועל על ידי ינאי, נויה תהיה זכאית לקבל תמונת מצב כספית סבירה של העסק, לרבות מידע בדבר הכנסות, הוצאות, פרויקטים פתוחים ותשלומים שכבר נתקבלו או הוצאו."),
              ],
            },
            {
              title: "הוצאות העסק",
              blocks: [
                p("ינאי יהיה אחראי לקבוע בפועל אילו הוצאות נדרשות לעסק, כמה להוציא, מתי לשלם וכיצד לנהל את התקציב השוטף, ככל שהדבר נוגע להתנהלות השוטפת והרגילה של WEBLLY."),
                p("הוצאות יכולות לכלול, בין היתר: תוכנות, מנויי AI, אחסון, דומיינים, עיצוב, קמפיינים, ספקים, תשתיות, שיווק, כלים ושירותים הנדרשים לצורך פעילות העסק."),
              ],
            },
            {
              title: "משיכות / תשלומים לשותפים",
              blocks: [
                p("לאחר ניהול ההכנסות והוצאות העסק, ינאי יבצע לשותפים תשלום/משיכה שווה בשווה, כך שכל אחד מן השותפים יקבל חלק שווה בהתאם להסכם זה ובכפוף ליכולת התזרימית של העסק."),
                p("מובהר כי החלוקה נועדה לשקף שותפות שווה, וכי כל חלוקה תיעשה באופן זהה והוגן בין ינאי לנויה."),
              ],
            },
          ],
        },
        {
          title: "תמחור, הצעות מחיר, חוזים ופרויקטים",
          clauses: [
            {
              title: "תמחור השירותים",
              blocks: [
                p("מחירי השירותים של WEBLLY, לרבות דפי נחיתה, אתרי תדמית, חנויות אינטרנטיות, מערכות CRM, מערכות מותאמות אישית ושירותים נלווים — ייקבעו על ידי השותפים במשותף."),
                p("לכל פרויקט תבוצע בחינה נפרדת של היקף העבודה, מורכבות, לוחות זמנים ומחיר, בטרם תימסר הצעת מחיר סופית ללקוח."),
              ],
            },
            {
              title: "מסמכים מחייבים לכל פרויקט",
              blocks: [
                p("כל פרויקט של WEBLLY יחייב, לפני תחילת עבודה, לכל הפחות:"),
                list(
                  "הצעת מחיר מסודרת;",
                  "חוזה/הסכם מסודר מול הלקוח;",
                  "אפיון בסיסי של העבודה;",
                  "פירוט התמורה;",
                  "תנאי תשלום;",
                  "לוחות זמנים;",
                  "פירוט מה כלול ומה אינו כלול.",
                ),
                p("ככלל, תחילת עבודה תהיה לאחר אישור המסמכים וקבלת המקדמה שנקבעה, אלא אם הוחלט אחרת במפורש."),
              ],
            },
            {
              title: "תכולת עבודה ושינויים",
              blocks: [
                p("בקשות נוספות מצד לקוח מעבר למה שתואר בהצעת המחיר או באפיון המקורי, ייחשבו כתוספת, ויחייבו בחינה מחודשת, תמחור מחדש או הסכמה חדשה בין הצדדים לבין הלקוח."),
              ],
            },
            {
              title: "בעיות עם לקוחות",
              blocks: [
                p("בכל מקרה של מחלוקת עם לקוח, תלונה מהותית, בקשת החזר, עיכוב משמעותי או החלטה חריגה לגבי פרויקט, יעדכנו השותפים זה את זו ויפעלו במשותף למציאת פתרון מקצועי וסביר."),
              ],
            },
          ],
        },
        {
          title: "קניין רוחני, סודיות והוראות כלליות",
          clauses: [
            {
              title: "נכסי WEBLLY",
              blocks: [
                p("כל החשבונות, הקבצים, החומרים, תיקי הלקוחות, מסדי המידע, מסמכי ההתקשרות, העיצובים, תהליכי העבודה, חומרי השיווק, נכסי הדיגיטל והתוצרים שיפותחו במסגרת הפעילות של WEBLLY, ייחשבו כנכסי העסק המשותפים."),
              ],
            },
            {
              title: "סודיות",
              blocks: [
                p("השותפים מתחייבים לשמור בסודיות על כל מידע עסקי, שיווקי, כספי, טכנולוגי ומסחרי של WEBLLY, לרבות הצעות מחיר, פרטי לקוחות, לידים, נתוני כספים, קבצים פנימיים, מחירים, אסטרטגיות עבודה, סיסמאות ומידע שאינו מיועד לצדדים שלישיים."),
              ],
            },
            {
              title: "שינוי ההסכם",
              blocks: [p("כל שינוי, עדכון או תוספת להסכם זה ייעשו בכתב ובהסכמת שני הצדדים.")],
            },
            {
              title: "חתימה דיגיטלית",
              blocks: [
                p("הצדדים מסכימים כי ניתן יהיה לחתום על הסכם זה גם בחתימה דיגיטלית, וכי חתימה כאמור תיחשב, בין השותפים, כבעלת תוקף מחייב לכל דבר ועניין, בכפוף לדין החל ולמערכת החתימה שבה ייעשה שימוש."),
              ],
            },
            {
              title: "דין חל",
              blocks: [p("הסכם זה יפורש וינוהל לפי דיני מדינת ישראל.")],
            },
            {
              title: "הצהרה מסכמת",
              blocks: [
                p("השותפים מאשרים כי קראו את הוראות ההסכם, הבינו את תוכנו, וכי הוא מבטא את ההבנות העסקיות ביניהם באשר לניהול WEBLLY ולפעילותם המשותפת."),
              ],
            },
          ],
        },
      ],
      notice: "מומלץ להעביר את ההסכם לבדיקת עורך דין לפני החתימה, ובמידת הצורך גם לקבלת הנחיות מס מסודרות לגבי מבנה הפעילות.",
    },
  };
}

// ---------------------------------------------------------------------------
// Editor text format: blocks ⇄ plain text
//   paragraphs are separated by a blank line;
//   consecutive lines starting with "- " form a lettered list;
//   a line "[טבלת בעלות]" is the ownership table.
// ---------------------------------------------------------------------------
export const EQUITY_TOKEN = "[טבלת בעלות]";

export function blocksToText(blocks: Block[]): string {
  return blocks
    .map((b) => (b.t === "p" ? b.text : b.t === "equity" ? EQUITY_TOKEN : b.items.map((i) => `- ${i}`).join("\n")))
    .join("\n\n");
}

export function textToBlocks(src: string): Block[] {
  const out: Block[] = [];
  for (const chunk of src.replace(/\r\n?/g, "\n").split(/\n\s*\n/)) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    let para: string[] = [];
    let items: string[] = [];
    const flush = () => {
      if (para.length) out.push({ t: "p", text: para.join(" ") });
      if (items.length) out.push({ t: "list", items });
      para = [];
      items = [];
    };
    for (const line of lines) {
      if (line === EQUITY_TOKEN) {
        flush();
        out.push({ t: "equity" });
      } else if (/^[-•]\s+/.test(line)) {
        if (para.length) {
          out.push({ t: "p", text: para.join(" ") });
          para = [];
        }
        items.push(line.replace(/^[-•]\s+/, ""));
      } else {
        if (items.length) {
          out.push({ t: "list", items });
          items = [];
        }
        para.push(line);
      }
    }
    flush();
  }
  return out;
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------
const HEB_LETTERS = ["א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט", "י", "יא", "יב", "יג", "יד", "טו", "טז", "יז", "יח", "יט", "כ"];
export const hebLetter = (i: number) => HEB_LETTERS[i] ?? String(i + 1);

/** Display id, e.g. WB-PA-3F2A91C0 */
export const agreementNumber = (id: string) => `WB-PA-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

export const partyNames = (a: Pick<PartnerAgreement, "parties">) => a.parties.map((x) => x.name).join(" · ");

/** "חותם כעת" / "חותמת כעת" */
export const signsNow = (party: Pick<Party, "gender">) => (party.gender === "f" ? "חותמת כעת" : "חותם כעת");

export type SigState = { key: string; signed: boolean };
/** Human status line for a version, e.g. "נחתם חלקית · ממתין לחתימת נויה". */
export function signingSummary(parties: Pick<Party, "key" | "short">[], signedKeys: string[]): { state: "draft" | "partial" | "signed"; label: string; waiting: string } {
  const waiting = parties.filter((x) => !signedKeys.includes(x.key));
  if (!waiting.length) return { state: "signed", label: "נחתם על ידי שני הצדדים", waiting: "" };
  const names = waiting.map((x) => x.short).join(" ו");
  if (waiting.length === parties.length) return { state: "draft", label: "טיוטה · טרם נחתם", waiting: `ממתין לחתימת ${names}` };
  return { state: "partial", label: "נחתם חלקית", waiting: `ממתין לחתימת ${names}` };
}
