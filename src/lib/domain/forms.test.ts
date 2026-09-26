import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeAnswer, validateAnswer, validateAnswers, visibleQuestionIds, visibleSections, type FormSnapshot, type SnapshotQuestion } from "./forms";

const q = (id: string, patch: Partial<SnapshotQuestion> = {}): SnapshotQuestion => ({
  id,
  type: "short_text",
  label: id,
  description: null,
  placeholder: null,
  required: false,
  options: [],
  condition: null,
  maps_to: null,
  ...patch,
});

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";
const D = "00000000-0000-4000-8000-00000000000d";

const snapshot: FormSnapshot = {
  template_name: "t",
  sections: [
    { id: "s1", title: "1", description: null, questions: [q(A, { type: "yes_no", required: true }), q(B, { type: "url", required: true, condition: { question_id: A, operator: "equals", value: "yes" } })] },
    { id: "s2", title: "2", description: null, questions: [q(C, { condition: { question_id: B, operator: "answered" } })] },
    { id: "s3", title: "3", description: null, questions: [q(D, { type: "multi_select", options: [{ value: "x", label: "X" }, { value: "y", label: "Y" }] })] },
  ],
};

test("conditional question shows only when the condition holds", () => {
  assert.equal(visibleQuestionIds(snapshot, { [A]: "no" }).has(B), false);
  assert.equal(visibleQuestionIds(snapshot, { [A]: "yes" }).has(B), true);
});

test("conditions chain: hidden parent hides dependants even with stale answers", () => {
  const v = visibleQuestionIds(snapshot, { [A]: "no", [B]: "https://old.example.com" });
  assert.equal(v.has(C), false);
  assert.deepEqual(visibleSections(snapshot, { [A]: "no" }).map((s) => s.id), ["s1", "s3"]);
});

test("required hidden questions are not validated", () => {
  assert.deepEqual(validateAnswers(snapshot, { [A]: "no" }), {});
  assert.ok(validateAnswers(snapshot, { [A]: "yes" })[B]);
});

test("type validation", () => {
  assert.equal(validateAnswer(q("u", { type: "url" }), "example.co.il"), null);
  assert.ok(validateAnswer(q("u", { type: "url" }), "not a url"));
  assert.ok(validateAnswer(q("e", { type: "email" }), "a@b"));
  assert.equal(validateAnswer(q("c", { type: "color" }), "#aabbcc"), null);
  assert.ok(validateAnswer(q("m", { type: "multi_select", options: [{ value: "x", label: "X" }] }), ["nope"]));
  assert.ok(validateAnswer(q("n", { type: "number", required: true }), null));
});

test("cycles resolve to hidden instead of looping", () => {
  const cyc: FormSnapshot = {
    template_name: "c",
    sections: [{ id: "s", title: "", description: null, questions: [q(A, { condition: { question_id: B, operator: "answered" } }), q(B, { condition: { question_id: A, operator: "answered" } })] }],
  };
  assert.equal(visibleQuestionIds(cyc, {}).size, 0);
});

test("urls are normalized on save", () => {
  assert.equal(normalizeAnswer(q("u", { type: "url" }), " example.com "), "https://example.com");
});
