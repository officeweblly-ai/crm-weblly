import { test } from "node:test";
import assert from "node:assert/strict";
import { blocksToText, defaultPartnerAgreement, partnerAgreementSchema, signingSummary, textToBlocks, type Block } from "./partners";

test("the default WEBLLY agreement is valid and complete", () => {
  const { title, content } = defaultPartnerAgreement();
  assert.equal(title, "הסכם שותפות וניהול פעילות");
  assert.ok(partnerAgreementSchema.safeParse(content).success);
  assert.deepEqual(content.parties.map((p) => [p.name, p.equity]), [["ינאי מזרחי", 50], ["נויה גאולה", 50]]);
  assert.equal(content.sections.length, 6);
  assert.equal(content.sections.flatMap((s) => s.clauses).length, 21);
});

test("there is no partner-exit / resignation clause", () => {
  const all = JSON.stringify(defaultPartnerAgreement().content);
  for (const word of ["יציאה", "פרישה", "שותף הפורש", "התפטרות", "פירוק"]) assert.ok(!all.includes(word), word);
});

test("the business rules from the owners' agreement are present", () => {
  const all = JSON.stringify(defaultPartnerAgreement().content);
  for (const phrase of [
    "50% מהזכויות בעסק",
    "יועברו וינוהלו באמצעות אמצעי התשלום או החשבון המנוהל על ידי ינאי",
    "ייקבעו על ידי השותפים במשותף",
    "בטרם תימסר הצעת מחיר סופית ללקוח",
    "הצעת מחיר מסודרת",
    "פירוט מה כלול ומה אינו כלול",
    "וקבלת המקדמה שנקבעה",
    "יעדכנו השותפים זה את זו",
    "שיווק וקידום WEBLLY",
  ]) assert.ok(all.includes(phrase), phrase);
});

test("editor text format round-trips every block kind", () => {
  const blocks: Block[] = [
    { t: "p", text: "פסקה ראשונה." },
    { t: "equity" },
    { t: "p", text: "לפני רשימה:" },
    { t: "list", items: ["אחת;", "שתיים."] },
    { t: "p", text: "סוף." },
  ];
  assert.deepEqual(textToBlocks(blocksToText(blocks)), blocks);
  for (const s of defaultPartnerAgreement().content.sections)
    for (const c of s.clauses) assert.deepEqual(textToBlocks(blocksToText(c.blocks)), c.blocks);
});

test("editor text: a list directly under a paragraph line splits correctly", () => {
  assert.deepEqual(textToBlocks("כותרת:\n- א\n- ב\nהמשך"), [
    { t: "p", text: "כותרת:" },
    { t: "list", items: ["א", "ב"] },
    { t: "p", text: "המשך" },
  ]);
});

test("signing summary names who is still missing", () => {
  const parties = [{ key: "yanai", short: "ינאי" }, { key: "noya", short: "נויה" }];
  assert.equal(signingSummary(parties, []).state, "draft");
  assert.deepEqual(signingSummary(parties, ["yanai"]), { state: "partial", label: "נחתם חלקית", waiting: "ממתין לחתימת נויה" });
  assert.equal(signingSummary(parties, ["noya", "yanai"]).state, "signed");
});
