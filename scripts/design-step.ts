/**
 * The "design, feel & copy" step shared by every questionnaire template.
 * Used by seed.ts (fresh installs) and by `npm run templates:add-design`
 * (adds it to existing templates that don't have it yet).
 */
export type StepQuestion = {
  key: string;
  type: "short_text" | "long_text" | "single_select" | "multi_select" | "yes_no" | "color" | "image_upload" | "reference_links";
  label: string;
  description?: string;
  required?: boolean;
  options?: string[];
  max?: number;
  when?: { key: string; operator: "equals"; value: string };
};

export const DESIGN_STEP: { title: string; description: string; questions: StepQuestion[] } = {
  title: "עיצוב, תחושה וקופי",
  description: "בלי מונחים טכניים — פשוט בחרו מה הכי מרגיש לכם נכון. זה עוזר לנו לדייק את המראה ואת הטקסטים של האתר.",
  questions: [
    {
      key: "d_style",
      type: "single_select",
      label: "איזו אווירה ויזואלית הכי מתאימה לאתר שלכם?",
      required: true,
      options: [
        "מינימליסטי ונקי: המון רווחים, עיצוב מודרני, שקט ומעודן",
        "יוקרתי וטקסטורלי: גוונים כהים, אלמנטים מבריקים, תחושת פרימיום",
        "נועז וצבעוני: צבעים חזקים, ניגודיות גבוהה, נוכחות בולטת ומלאת אנרגיה",
        "טכנולוגי וחדשני: מראה הייטקי, אלמנטים עתידניים, קווים חדים",
      ],
    },
    {
      key: "d_palette",
      type: "single_select",
      label: "איזה כיוון צבעוני הייתם רוצים שישלוט באתר?",
      required: true,
      options: [
        "גוונים כהים (Dark / Luxe): שחור, אפור כהה, זהב או כסף",
        "נקי ובהיר (Clean Light): לבן, אפור בהיר, נגיעות של צבע מותג אחד",
        "צבעי אדמה וטבע: ירוק זית, חום, בז', כתום חם",
        "צבעים קרים ומקצועיים: כחול, תכלת, אפור-פלדה (משדר אמינות)",
        "צבעים חמים ודינמיים: אדום, כתום, צהוב, סגול (משדר אנרגיה וקצב)",
      ],
    },
    {
      key: "d_has_color",
      type: "yes_no",
      label: "יש לעסק צבע מותג קבוע?",
    },
    {
      key: "d_color",
      type: "color",
      label: "מה צבע המותג?",
      description: "בחרו את הצבע הכי קרוב, או הדביקו קוד צבע אם יש לכם.",
      when: { key: "d_has_color", operator: "equals", value: "yes" },
    },
    {
      key: "d_fonts",
      type: "single_select",
      label: "איזה אופי הייתם רוצים שהטקסטים והכותרות באתר ישדרו?",
      required: true,
      options: [
        "מודרני והייטקי: פונטים נקיים, קריאים, ישרים וחדים (כמו Heebo / Rubik)",
        "אלגנטי ויוקרתי: פונטים מעודנים, בעלי נוכחות קלאסית (כמו Frank Ruhl)",
        "חם ובגובה העיניים: פונטים מעוגלים, רכים ונגישים",
        "בולט ועוצמתי: פונטים עבים מאוד לכותרות גדולות במיוחד",
      ],
    },
    {
      key: "d_motion",
      type: "single_select",
      label: "עד כמה תרצו שהאתר יהיה בתנועה?",
      required: true,
      options: [
        "עדין ומאופק: מעברים חלקים ובסיסיים בלבד (הופעה עדינה בגלילה)",
        "דינמי ומודרני: אפקטים במעבר עכבר על כפתורים, תנועה חלקה של אלמנטים בגלילה",
        "חווייתי ועשיר (WOW): אנימציות מורכבות, עומק בגלילה, אלמנטים שזזים לפי העכבר",
        "בלי אנימציות: אתר סטטי לחלוטין, מקסימום מהירות טעינה",
      ],
    },
    {
      key: "d_shapes",
      type: "single_select",
      label: "איזה סגנון אלמנטים (כפתורים, כרטיסיות, מסגרות) אתם מעדיפים?",
      required: true,
      options: [
        "פינות עגולות ורכות: תחושה ידידותית, מודרנית ונגישה",
        "פינות חדות וישרות: תחושה יציבה, רשמית, הייטקית וסמכותית",
        "זכוכית ושקיפויות: אפקטים של טשטוש, שכבות ושקיפות",
        "מינימליזם שטוח: בלי צלליות, קווים נקיים בלבד",
      ],
    },
    {
      key: "d_has_logo",
      type: "yes_no",
      label: "יש לכם לוגו?",
      required: true,
    },
    {
      key: "d_logo",
      type: "image_upload",
      label: "העלו את הלוגו",
      description: "עדיף קובץ SVG או PNG באיכות גבוהה. אפשר כמה גרסאות.",
      when: { key: "d_has_logo", operator: "equals", value: "yes" },
    },
    {
      key: "d_refs",
      type: "reference_links",
      label: "אתרים שאתם אוהבים",
      description: "הדביקו קישורים לאתרים שמעוררים בכם השראה — ובשורה מתחת כתבו מה אהבתם בהם (הצבעים? התחושה? מבנה?).",
    },
    {
      key: "c_message",
      type: "long_text",
      label: "מה המסר הכי חשוב שמבקר צריך להבין ב-5 השניות הראשונות?",
      description: "משפט או שניים במילים שלכם. אנחנו נלטש אותו לכותרת.",
      required: true,
    },
    {
      key: "c_texts",
      type: "single_select",
      label: "מה המצב עם הטקסטים לאתר?",
      required: true,
      options: ["יש לנו טקסטים מוכנים", "יש חלק — צריך עזרה בהשלמה ובליטוש", "אין — נשמח שתכתבו לנו את הקופי"],
    },
  ],
};
