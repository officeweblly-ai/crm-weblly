"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlignRight,
  AtSign,
  Calendar,
  CheckSquare,
  ChevronDown,
  CircleDot,
  Copy,
  GitBranch,
  GripVertical,
  Hash,
  Image as ImageIcon,
  Link2,
  Bookmark,
  Palette,
  Paperclip,
  Phone,
  Plus,
  ToggleLeft,
  Trash2,
  Type,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Menu, MenuItem, MenuLabel } from "@/components/ui/menu";
import { Confirm } from "@/components/ui/confirm";
import {
  addQuestion,
  addSection,
  deleteQuestion,
  deleteSection,
  duplicateQuestion,
  reorderQuestions,
  reorderSections,
  updateQuestion,
  updateSection,
  type QuestionInput,
} from "@/lib/actions/questionnaires";
import {
  CLIENT_FIELD_MAPPINGS,
  clientFieldLabel,
  CONDITION_OPERATORS,
  conditionOperatorLabel,
  OPTION_TYPES,
  type ClientFieldMapping,
  type Condition,
  type ConditionOperator,
  type QuestionOption,
} from "@/lib/domain/forms";
import { questionType, type QuestionType } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";

export type BuilderQuestion = {
  id: string;
  type: QuestionType;
  label: string;
  description: string | null;
  placeholder: string | null;
  required: boolean;
  options: QuestionOption[];
  condition: Condition | null;
  maps_to: ClientFieldMapping | null;
  max_choices?: number | null;
};
export type BuilderSection = { id: string; title: string; description: string | null; questions: BuilderQuestion[] };

const TYPE_ICON: Record<QuestionType, LucideIcon> = {
  short_text: Type,
  long_text: AlignRight,
  email: AtSign,
  phone: Phone,
  yes_no: ToggleLeft,
  single_select: CircleDot,
  multi_select: CheckSquare,
  number: Hash,
  url: Link2,
  date: Calendar,
  color: Palette,
  image_upload: ImageIcon,
  file_upload: Paperclip,
  reference_links: Bookmark,
};

const TYPE_GROUPS: { label: string; types: QuestionType[] }[] = [
  { label: "טקסט", types: ["short_text", "long_text", "email", "phone", "url", "number", "date"] },
  { label: "בחירה", types: ["yes_no", "single_select", "multi_select", "color"] },
  { label: "קבצים וקישורים", types: ["image_upload", "file_upload", "reference_links"] },
];

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = <T,>(fn: () => Promise<{ ok: boolean; error?: string; message?: string; data?: T }>, opts: { quiet?: boolean; onOk?: (data: T | undefined) => void } = {}) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        if (!opts.quiet && r.message) toast.success(r.message);
        opts.onOk?.(r.data);
        router.refresh();
      } else toast.error(r.error ?? "הפעולה נכשלה");
    });
  return { pending, run };
}

// ---------------------------------------------------------------------------
// Question editor
// ---------------------------------------------------------------------------
function optionValue() {
  return `opt_${Math.random().toString(36).slice(2, 8)}`;
}

function QuestionEditor({
  q,
  sectionId,
  sections,
  earlier,
  onClose,
}: {
  q: BuilderQuestion;
  sectionId: string;
  sections: BuilderSection[];
  earlier: BuilderQuestion[];
  onClose: () => void;
}) {
  const { pending, run } = useRun();
  const [draft, setDraft] = useState<QuestionInput>({
    type: q.type,
    label: q.label,
    description: q.description,
    placeholder: q.placeholder,
    required: q.required,
    options: q.options,
    condition: q.condition,
    maps_to: q.maps_to,
    max_choices: q.max_choices ?? null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (patch: Partial<QuestionInput>) => setDraft((d) => ({ ...d, ...patch }));
  const hasOptions = OPTION_TYPES.includes(draft.type);
  const source = earlier.find((e) => e.id === draft.condition?.question_id);
  const needsValue = draft.condition && !["answered", "not_answered"].includes(draft.condition.operator);

  const save = () =>
    run(() => updateQuestion(q.id, draft), {
      onOk: () => {
        setErrors({});
        onClose();
      },
    });

  return (
    <div className="flex flex-col gap-4 border-t border-line bg-sunken/40 p-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
        <Field label="השאלה" required error={errors.label}>
          {(p) => <Input {...p} value={draft.label} onChange={(e) => set({ label: e.target.value })} autoFocus />}
        </Field>
        <Field label="סוג">
          {(p) => (
            <Select
              {...p}
              value={draft.type}
              onChange={(e) => {
                const type = e.target.value as QuestionType;
                set({
                  type,
                  options:
                    OPTION_TYPES.includes(type) && (draft.options?.length ?? 0) < 2
                      ? [
                          { value: optionValue(), label: "אפשרות 1" },
                          { value: optionValue(), label: "אפשרות 2" },
                        ]
                      : draft.options,
                });
              }}
            >
              {questionType.list.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="הסבר קצר מתחת לשאלה" hint="לא חובה — עוזר ללקוח להבין מה לענות.">
        {(p) => <Textarea {...p} rows={2} value={draft.description ?? ""} onChange={(e) => set({ description: e.target.value })} />}
      </Field>
      {!hasOptions && !["yes_no", "color", "image_upload", "file_upload", "date"].includes(draft.type) && (
        <Field label="טקסט דוגמה בתוך השדה (placeholder)">
          {(p) => <Input {...p} value={draft.placeholder ?? ""} onChange={(e) => set({ placeholder: e.target.value })} />}
        </Field>
      )}

      {hasOptions && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-ink-2">אפשרויות</legend>
          {(draft.options ?? []).map((o, i) => (
            <div key={o.value} className="flex items-center gap-2">
              <span className="w-5 text-center text-xs text-ink-3 num">{i + 1}</span>
              <Input
                aria-label={`אפשרות ${i + 1}`}
                value={o.label}
                onChange={(e) => set({ options: draft.options!.map((x) => (x.value === o.value ? { ...x, label: e.target.value } : x)) })}
              />
              <Button variant="ghost" size="icon" aria-label={`הסרת אפשרות ${i + 1}`} onClick={() => set({ options: draft.options!.filter((x) => x.value !== o.value) })} disabled={(draft.options?.length ?? 0) <= 2}>
                <Trash2 />
              </Button>
            </div>
          ))}
          {errors.options && <p className="text-xs font-medium text-danger">{errors.options}</p>}
          <Button variant="link" size="sm" className="self-start" onClick={() => set({ options: [...(draft.options ?? []), { value: optionValue(), label: `אפשרות ${(draft.options?.length ?? 0) + 1}` }] })}>
            <Plus aria-hidden /> הוספת אפשרות
          </Button>
        </fieldset>
      )}

      {draft.type === "multi_select" && (
        <label className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
          כמה אפשר לבחור?
          <select
            className="h-9 rounded-md border border-line-strong bg-surface ps-2 pe-7 text-sm"
            value={draft.max_choices ?? ""}
            onChange={(e) => set({ max_choices: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">ללא הגבלה</option>
            {Array.from({ length: Math.max(0, (draft.options?.length ?? 0) - 1) }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>עד {n}</option>
            ))}
          </select>
          {errors.max_choices && <span className="text-xs font-medium text-danger">{errors.max_choices}</span>}
        </label>
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Checkbox label="שאלת חובה" checked={draft.required} onChange={(e) => set({ required: e.target.checked })} />
        {["short_text", "email", "phone", "url"].includes(draft.type) && (
          <label className="flex items-center gap-2 text-sm text-ink-2">
            ממלא בתיק הלקוח:
            <select
              className="h-9 rounded-md border border-line-strong bg-surface ps-2 pe-7 text-sm"
              value={draft.maps_to ?? ""}
              onChange={(e) => set({ maps_to: (e.target.value || null) as ClientFieldMapping | null })}
            >
              <option value="">—</option>
              {CLIENT_FIELD_MAPPINGS.map((m) => (
                <option key={m} value={m}>{clientFieldLabel[m]}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Conditional logic */}
      <fieldset className="rounded-lg border border-line bg-surface p-3">
        <legend className="flex items-center gap-1.5 px-1 text-sm font-medium text-ink-2">
          <GitBranch className="size-4 text-ink-3" aria-hidden /> תנאי הצגה
        </legend>
        {earlier.length === 0 ? (
          <p className="text-xs text-ink-3">אפשר להתנות שאלה רק בשאלה שמופיעה לפניה.</p>
        ) : !draft.condition ? (
          <Button variant="link" size="sm" onClick={() => set({ condition: { question_id: earlier[earlier.length - 1].id, operator: "equals", value: earlier[earlier.length - 1].type === "yes_no" ? "yes" : "" } })}>
            <Plus aria-hidden /> להציג רק אם…
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="grid gap-2 sm:grid-cols-[1fr_150px_1fr]">
              <select
                aria-label="השאלה שקובעת"
                className="h-10 rounded-md border border-line-strong bg-surface ps-2 pe-7 text-sm"
                value={draft.condition.question_id}
                onChange={(e) => {
                  const src = earlier.find((x) => x.id === e.target.value);
                  set({ condition: { question_id: e.target.value, operator: "equals", value: src?.type === "yes_no" ? "yes" : src?.options[0]?.value ?? "" } });
                }}
              >
                {earlier.map((x) => (
                  <option key={x.id} value={x.id}>{x.label}</option>
                ))}
              </select>
              <select
                aria-label="תנאי"
                className="h-10 rounded-md border border-line-strong bg-surface ps-2 pe-7 text-sm"
                value={draft.condition.operator}
                onChange={(e) => set({ condition: { ...draft.condition!, operator: e.target.value as ConditionOperator } })}
              >
                {CONDITION_OPERATORS.filter((op) => (source?.type === "multi_select" ? true : !["includes", "not_includes"].includes(op))).map((op) => (
                  <option key={op} value={op}>{conditionOperatorLabel[op]}</option>
                ))}
              </select>
              {needsValue &&
                (source?.type === "yes_no" ? (
                  <select aria-label="ערך" className="h-10 rounded-md border border-line-strong bg-surface ps-2 pe-7 text-sm" value={draft.condition.value ?? ""} onChange={(e) => set({ condition: { ...draft.condition!, value: e.target.value } })}>
                    <option value="yes">כן</option>
                    <option value="no">לא</option>
                  </select>
                ) : source && OPTION_TYPES.includes(source.type) ? (
                  <select aria-label="ערך" className="h-10 rounded-md border border-line-strong bg-surface ps-2 pe-7 text-sm" value={draft.condition.value ?? ""} onChange={(e) => set({ condition: { ...draft.condition!, value: e.target.value } })}>
                    {source.options.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : (
                  <Input aria-label="ערך" value={draft.condition.value ?? ""} onChange={(e) => set({ condition: { ...draft.condition!, value: e.target.value } })} />
                ))}
            </div>
            <Button variant="link" size="sm" className="self-start text-danger" onClick={() => set({ condition: null })}>
              הסרת התנאי
            </Button>
          </div>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Button
          loading={pending}
          onClick={() => {
            if (!draft.label.trim()) return setErrors({ label: "יש להזין את השאלה" });
            if (hasOptions && (draft.options?.length ?? 0) < 2) return setErrors({ options: "צריך לפחות שתי אפשרויות" });
            if (hasOptions && draft.options!.some((o) => !o.label.trim())) return setErrors({ options: "יש אפשרות ריקה" });
            save();
          }}
        >
          שמירת השאלה
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={pending}>
          סגירה
        </Button>
        <div className="ms-auto flex items-center gap-1">
          {sections.length > 1 && (
            <label className="flex items-center gap-1.5 text-sm text-ink-3">
              <span className="max-sm:sr-only">העברה לשלב</span>
              <select
                className="h-9 rounded-md border border-line-strong bg-surface ps-2 pe-7 text-sm text-ink-2"
                value={sectionId}
                onChange={(e) => {
                  const target = sections.find((s) => s.id === e.target.value);
                  if (!target) return;
                  run(() => reorderQuestions(target.id, [...target.questions.map((x) => x.id), q.id]), { quiet: true, onOk: () => toast.success(`השאלה הועברה ל"${target.title}"`) });
                }}
              >
                {sections.map((s, i) => (
                  <option key={s.id} value={s.id}>{s.title || `שלב ${i + 1}`}</option>
                ))}
              </select>
            </label>
          )}
          <Button variant="ghost" size="icon" aria-label="שכפול השאלה" onClick={() => run(() => duplicateQuestion(q.id))}>
            <Copy />
          </Button>
          <Button variant="ghost" size="icon" aria-label="מחיקת השאלה" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="text-danger" />
          </Button>
        </div>
      </div>
      <Confirm
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="מחיקת שאלה"
        description={<>השאלה &quot;{q.label}&quot; תימחק מהתבנית. שאלונים שכבר נשלחו לא יושפעו. תנאים שתלויים בה יוסרו.</>}
        confirmLabel="מחיקה"
        action={() => deleteQuestion(q.id)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
function QuestionRow({ q, open, onToggle, sectionId, sections, earlier, allQuestions }: { q: BuilderQuestion; open: boolean; onToggle: () => void; sectionId: string; sections: BuilderSection[]; earlier: BuilderQuestion[]; allQuestions: Map<string, BuilderQuestion> }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.id });
  const Icon = TYPE_ICON[q.type];
  const dep = q.condition ? allQuestions.get(q.condition.question_id) : null;
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn("overflow-hidden rounded-md border bg-surface", open ? "border-accent/40 shadow-2" : "border-line", isDragging && "z-10 opacity-70 shadow-3")}>
      <div className="flex items-center gap-1 pe-2">
        <button type="button" {...attributes} {...listeners} className="grid h-12 w-9 shrink-0 cursor-grab touch-none place-items-center text-ink-3 hover:text-ink active:cursor-grabbing" aria-label={`גרירה לשינוי סדר: ${q.label}`}>
          <GripVertical className="size-4" />
        </button>
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 py-2 text-start">
          <Icon className="size-4 shrink-0 text-ink-3" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">
              {q.label}
              {q.required && <span className="text-danger" aria-label="חובה"> *</span>}
            </span>
            <span className="flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
              {questionType.label(q.type)}
              {q.type === "multi_select" && q.max_choices ? ` · עד ${q.max_choices}` : ""}
              {dep && (
                <span className="inline-flex items-center gap-1 text-info">
                  <GitBranch className="size-3" aria-hidden /> מותנה ב&quot;{dep.label}&quot;
                </span>
              )}
              {q.maps_to && <span>· ממלא {clientFieldLabel[q.maps_to]}</span>}
            </span>
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-ink-3 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      </div>
      {open && <QuestionEditor q={q} sectionId={sectionId} sections={sections} earlier={earlier} onClose={onToggle} />}
    </li>
  );
}

// ---------------------------------------------------------------------------
function SectionCard({
  section,
  index,
  sections,
  openId,
  setOpenId,
  earlierBySection,
  allQuestions,
  onReorderQuestions,
}: {
  section: BuilderSection;
  index: number;
  sections: BuilderSection[];
  openId: string | null;
  setOpenId: (id: string | null) => void;
  earlierBySection: Map<string, BuilderQuestion[]>;
  allQuestions: Map<string, BuilderQuestion>;
  onReorderQuestions: (sectionId: string, ids: string[]) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const { pending, run } = useRun();
  const [title, setTitle] = useState(section.title);
  const [description, setDescription] = useState(section.description ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = section.questions.map((q) => q.id);
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    onReorderQuestions(section.id, next);
  };

  const earlierBase = earlierBySection.get(section.id) ?? [];

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("rounded-lg border border-line bg-surface shadow-1", isDragging && "z-10 shadow-3")}
      aria-label={`שלב ${index + 1}`}
    >
      <header className="flex items-start gap-2 border-b border-line p-3 sm:p-4">
        <button type="button" {...attributes} {...listeners} className="mt-1.5 grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded text-ink-3 hover:bg-sunken active:cursor-grabbing" aria-label={`גרירה לשינוי סדר השלב ${index + 1}`}>
          <GripVertical className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs font-medium text-ink-3 num">שלב {index + 1}</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title !== section.title && run(() => updateSection(section.id, { title }), { quiet: true })}
              aria-label={`כותרת שלב ${index + 1}`}
              className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-1 font-display text-lg font-bold text-ink hover:border-line focus:border-accent focus:bg-surface focus:outline-none"
              placeholder="כותרת השלב"
            />
          </div>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => description !== (section.description ?? "") && run(() => updateSection(section.id, { description }), { quiet: true })}
            aria-label={`תיאור שלב ${index + 1}`}
            className="mt-0.5 w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-sm text-ink-2 placeholder:text-ink-3 hover:border-line focus:border-accent focus:bg-surface focus:outline-none"
            placeholder="תיאור קצר ללקוח (לא חובה)"
          />
        </div>
        <Button variant="ghost" size="icon" aria-label={`מחיקת שלב ${index + 1}`} onClick={() => setConfirmDelete(true)} disabled={sections.length <= 1 || pending}>
          <Trash2 className={sections.length > 1 ? "text-danger" : undefined} />
        </Button>
      </header>

      <div className="p-3 sm:p-4">
        {section.questions.length > 0 ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={section.questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
              <ul className="flex flex-col gap-2">
                {section.questions.map((q, qi) => (
                  <QuestionRow
                    key={q.id}
                    q={q}
                    open={openId === q.id}
                    onToggle={() => setOpenId(openId === q.id ? null : q.id)}
                    sectionId={section.id}
                    sections={sections}
                    earlier={[...earlierBase, ...section.questions.slice(0, qi)]}
                    allQuestions={allQuestions}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        ) : (
          <p className="rounded-md border border-dashed border-line-strong px-3 py-5 text-center text-sm text-ink-3">שלב ריק — הוסף שאלה ראשונה. שלבים ריקים לא מוצגים ללקוח.</p>
        )}
        <div className="mt-3">
          <Menu
            align="start"
            trigger={
              <Button variant="secondary" size="sm" loading={pending}>
                <Plus aria-hidden /> הוספת שאלה
              </Button>
            }
          >
            {TYPE_GROUPS.map((g) => (
              <div key={g.label}>
                <MenuLabel>{g.label}</MenuLabel>
                {g.types.map((t) => {
                  const Icon = TYPE_ICON[t];
                  return (
                    <MenuItem key={t} onSelect={() => run(() => addQuestion(section.id, t), { onOk: (d) => d && setOpenId((d as { id: string }).id) })}>
                      <Icon /> {questionType.label(t)}
                    </MenuItem>
                  );
                })}
              </div>
            ))}
          </Menu>
        </div>
      </div>
      <Confirm
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="מחיקת שלב"
        description={<>השלב &quot;{section.title}&quot; וכל {section.questions.length} השאלות שבו יימחקו מהתבנית.</>}
        confirmLabel="מחיקת השלב"
        action={() => deleteSection(section.id)}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
export function FormBuilder({ templateId, sections: initial }: { templateId: string; sections: BuilderSection[] }) {
  const router = useRouter();
  const [sections, setSections] = useState(initial);
  const [source, setSource] = useState(initial);
  if (source !== initial) {
    setSource(initial);
    setSections(initial);
  }
  const [openId, setOpenId] = useState<string | null>(null);
  const { pending, run } = useRun();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const allQuestions = useMemo(() => new Map(sections.flatMap((s) => s.questions).map((q) => [q.id, q])), [sections]);
  const earlierBySection = useMemo(() => {
    const m = new Map<string, BuilderQuestion[]>();
    let acc: BuilderQuestion[] = [];
    for (const s of sections) {
      m.set(s.id, acc);
      acc = [...acc, ...s.questions];
    }
    return m;
  }, [sections]);

  const persistOrder = (fn: () => Promise<{ ok: boolean; error?: string }>, rollback: BuilderSection[]) =>
    void fn().then((r) => {
      if (!r.ok) {
        setSections(rollback);
        toast.error(`שמירת הסדר נכשלה: ${r.error}`);
      } else router.refresh();
    });

  const onSectionDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const before = sections;
    const ids = sections.map((s) => s.id);
    const next = arrayMove(sections, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    setSections(next);
    persistOrder(() => reorderSections(templateId, next.map((s) => s.id)), before);
  };

  const onReorderQuestions = (sectionId: string, ids: string[]) => {
    const before = sections;
    setSections(sections.map((s) => (s.id === sectionId ? { ...s, questions: ids.map((id) => s.questions.find((q) => q.id === id)!).filter(Boolean) } : s)));
    persistOrder(() => reorderQuestions(sectionId, ids), before);
  };

  const count = allQuestions.size;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-sm text-ink-3">
        <span className="num">
          {sections.length} שלבים · {count} שאלות
        </span>
        <Badge tone="info" dot={false}>שינויים כאן לא משנים שאלונים שכבר נשלחו</Badge>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onSectionDragEnd}>
        <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-4">
            {sections.map((s, i) => (
              <SectionCard
                key={s.id}
                section={s}
                index={i}
                sections={sections}
                openId={openId}
                setOpenId={setOpenId}
                earlierBySection={earlierBySection}
                allQuestions={allQuestions}
                onReorderQuestions={onReorderQuestions}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <Button variant="secondary" className="self-start" loading={pending} onClick={() => run(() => addSection(templateId))}>
        <Plus aria-hidden /> הוספת שלב
      </Button>
    </div>
  );
}
