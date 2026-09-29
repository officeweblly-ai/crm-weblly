"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { Bell, BellOff, BellRing, Send, Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPushPublicKey, sendTestPush, setNotifyPrefs, subscribePush, unsubscribePush } from "@/lib/actions/push";
import { cn } from "@/lib/utils";

/**
 * Installed-app + push notifications on the client.
 * iPhone rules (iOS 16.4+): push works only after "Add to Home Screen", and
 * permission must be asked from a tap inside the installed app.
 */
type PushState = {
  ready: boolean;
  supported: boolean;
  ios: boolean;
  standalone: boolean;
  permission: NotificationPermission | "unsupported";
  subscription: PushSubscription | null;
};

function base64ToBytes(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function detect(): Omit<PushState, "subscription" | "ready"> {
  const nav = navigator as Navigator & { standalone?: boolean };
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  return { ios, standalone, supported, permission: "Notification" in window ? Notification.permission : "unsupported" };
}

export function usePush() {
  const [state, setState] = useState<PushState>({ ready: false, supported: false, ios: false, standalone: false, permission: "unsupported", subscription: null });
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    const base = detect();
    const load = base.supported
      ? navigator.serviceWorker
          .register("/sw.js", { scope: "/", updateViaCache: "none" })
          .then((reg) => reg.pushManager.getSubscription())
          .catch(() => null)
      : Promise.resolve(null);
    load.then((subscription) => alive && setState({ ...base, ready: true, subscription }));
    return () => {
      alive = false;
    };
  }, []);

  const enable = useCallback(
    () =>
      start(async () => {
        try {
          const permission = await Notification.requestPermission();
          if (permission !== "granted") {
            setState((s) => ({ ...s, permission }));
            toast.error(permission === "denied" ? "ההתראות חסומות. אפשר לאשר אותן בהגדרות המכשיר ← weblly ← התראות." : "לא אושרו התראות.");
            return;
          }
          const key = await getPushPublicKey();
          if (!key.ok) return void toast.error(key.error);
          const reg = await navigator.serviceWorker.ready;
          const subscription =
            (await reg.pushManager.getSubscription()) ??
            (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(key.data.key) }));
          const r = await subscribePush(subscription.toJSON(), navigator.userAgent);
          if (!r.ok) return void toast.error(r.error);
          setState((s) => ({ ...s, permission, subscription }));
          toast.success(r.message ?? "ההתראות הופעלו");
        } catch {
          toast.error("הפעלת ההתראות נכשלה. באייפון — פתחו את weblly ממסך הבית ונסו שוב.");
        }
      }),
    [],
  );

  const disable = useCallback(
    () =>
      start(async () => {
        const sub = state.subscription;
        if (!sub) return;
        await sub.unsubscribe().catch(() => undefined);
        const r = await unsubscribePush(sub.endpoint);
        setState((s) => ({ ...s, subscription: null }));
        if (r.ok) toast.success(r.message ?? "כובה");
        else toast.error(r.error);
      }),
    [state.subscription],
  );

  return { ...state, pending, enable, disable };
}

function InstallSteps() {
  return (
    <ol className="flex flex-col gap-1.5 text-sm text-ink-2">
      <li className="flex items-center gap-2">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-ink">1</span>
        פותחים את המערכת ב-Safari ולוחצים על כפתור השיתוף
        <Share className="size-4 shrink-0 text-accent" aria-label="שיתוף" />
      </li>
      <li className="flex items-center gap-2">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-ink">2</span>
        בוחרים &quot;הוספה למסך הבית&quot;
        <SquarePlus className="size-4 shrink-0 text-accent" aria-hidden />
      </li>
      <li className="flex items-center gap-2">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-ink">3</span>
        פותחים את weblly מהאייקון החדש ומפעילים התראות
      </li>
    </ol>
  );
}

const DISMISS_KEY = "weblly.app-prompt.dismissed";
const noopSubscribe = () => () => {};
function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Top-of-app nudge: on iPhone Safari → how to install; inside the installed
 * app (or any supporting browser) → one tap to turn notifications on.
 * Dismissible, remembered per device.
 */
export function AppPrompt() {
  const push = usePush();
  // Hidden during server render; read from this device after hydration.
  const stored = useSyncExternalStore(noopSubscribe, readDismissed, () => true);
  const [closed, setClosed] = useState(false);
  const dismissed = stored || closed;
  const dismiss = () => {
    setClosed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode — fine, it just shows again next time */
    }
  };

  if (!push.ready || dismissed) return null;
  const needsInstall = push.ios && !push.standalone;
  const canEnable = push.supported && !push.subscription && push.permission === "default" && (!push.ios || push.standalone);
  if (!needsInstall && !canEnable) return null;

  return (
    <div className="mb-5 flex items-start gap-3 rounded-lg border border-accent/20 bg-accent-soft/60 px-4 py-3 print:hidden">
      <BellRing className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
      <div className="min-w-0 flex-1">
        {needsInstall ? (
          <>
            <p className="text-sm font-semibold text-ink">התקינו את weblly כאפליקציה ותקבלו התראות</p>
            <p className="mb-2 text-sm text-ink-2">סיכום בוקר אישי, משימה חדשה, שאלון שהתקבל, חוזה שנחתם — ישר לאייפון.</p>
            <InstallSteps />
          </>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink">
              <span className="font-semibold">להפעיל התראות?</span> סיכום בוקר אישי, משימה שהוקצתה לך, שאלון שהתקבל ואישורים מלקוחות.
            </p>
            <Button size="sm" onClick={push.enable} loading={push.pending} className="self-start sm:self-auto">
              <Bell aria-hidden />
              הפעלת התראות
            </Button>
          </div>
        )}
      </div>
      <button type="button" onClick={dismiss} className="-me-1 -mt-1 grid size-9 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-surface hover:text-ink" aria-label="סגירה">
        <X className="size-4" />
      </button>
    </div>
  );
}

const EVENTS = [
  { key: "daily_digest", label: "סיכום בוקר אישי", hint: "פעם ביום, בשעה ובימים שבחרת בפרופיל — מה דורש טיפול היום" },
  { key: "task_assigned", label: "משימה שהוקצתה לי", hint: "כשמישהו בצוות משייך אליך משימה" },
  { key: "questionnaire_submitted", label: "שאלון אפיון התקבל", hint: "למי שאחראי/ת על הצעות מחיר (או לכל הצוות אם לא הוגדר)" },
  { key: "proposal_response", label: "תשובה להצעת מחיר", hint: "לקוח אישר או דחה הצעה" },
  { key: "contract_signed", label: "חוזה נחתם", hint: "הלקוח חתם דיגיטלית" },
  { key: "approval_response", label: "אישור / בקשת שינוי מלקוח", hint: "מקישור הצפייה של הפרויקט" },
  { key: "payment_added", label: "נרשם תשלום", hint: "למי שאחראי/ת על גבייה" },
  { key: "lead_created", label: "ליד חדש", hint: "למי שאחראי/ת על מכירות (או לכל הצוות)" },
  { key: "client_created", label: "לקוח חדש נפתח", hint: "תיק לקוח חדש — ידני או מתוך שאלון" },
  { key: "task_completed", label: "משימה שפתחתי הושלמה", hint: "כשמישהו אחר סוגר משימה שיצרת או שהייתה משויכת אליך" },
  { key: "proposal_viewed", label: "לקוח פתח הצעת מחיר", hint: "הזמן הכי טוב להתקשר" },
  { key: "follow_up_assigned", label: "מעקב שהוקצה לי", hint: "תזכורת לחזור ללקוח שמישהו שייך אליך" },
  { key: "project_status", label: "פרויקט עבר שלב", hint: "לאחראי/ת על הפרויקט" },
  { key: "expense_added", label: "נרשמה הוצאה", hint: "הוצאה חדשה של העסק" },
  { key: "partner_agreement", label: "הסכם השותפים", hint: "שינוי בהסכם או חתימה של שותף" },
  { key: "team_changes", label: "שינויים בצוות", hint: "תפקיד חדש, הרשאות, עובד שנוסף" },
] as const;

/** What the morning summary may include (each person decides). */
const DIGEST_PARTS = [
  { key: "digest_overdue", label: "משימות באיחור וחסומות" },
  { key: "digest_follow_ups", label: "מעקבים ולידים לחזור אליהם" },
  { key: "digest_deadlines", label: "תאריכי יעד של פרויקטים" },
  { key: "digest_inactive_clients", label: "לקוחות בלי קשר זמן רב" },
] as const;

/** Settings → notifications: this device on/off, a test, and which events. */
export function NotificationSettings({ prefs, morningLabel }: { prefs: Record<string, unknown>; morningLabel?: string }) {
  const push = usePush();
  const [values, setValues] = useState<Record<string, boolean>>(() => Object.fromEntries([...EVENTS, ...DIGEST_PARTS].map((e) => [e.key, prefs[e.key] !== false])));
  const [saving, start] = useTransition();

  const toggle = (key: string, on: boolean) => {
    const next = { ...values, [key]: on };
    setValues(next);
    start(async () => {
      const r = await setNotifyPrefs({ [key]: on });
      if (!r.ok) {
        toast.error(r.error);
        setValues(values);
      }
    });
  };
  const test = () =>
    start(async () => {
      const r = await sendTestPush();
      if (r.ok) toast.success(r.message ?? "נשלח");
      else toast.error(r.error);
    });

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border border-line bg-paper/60 p-4">
        <h3 className="text-sm font-semibold text-ink">המכשיר הזה</h3>
        {!push.ready ? (
          <p className="mt-1 text-sm text-ink-3">בודק…</p>
        ) : push.ios && !push.standalone ? (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-sm text-ink-2">באייפון, התראות עובדות רק כשהמערכת מותקנת במסך הבית (iOS 16.4 ומעלה):</p>
            <InstallSteps />
          </div>
        ) : !push.supported ? (
          <p className="mt-1 text-sm text-ink-3">הדפדפן הזה לא תומך בהתראות. נסו מהאפליקציה במסך הבית, או מ-Chrome / Safari עדכני.</p>
        ) : push.subscription ? (
          <div className="mt-2 flex flex-col gap-3">
            <p className="flex items-center gap-2 text-sm text-ok">
              <BellRing className="size-4" aria-hidden />
              ההתראות פעילות במכשיר הזה
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={test} loading={saving}>
                <Send aria-hidden />
                שליחת התראת בדיקה
              </Button>
              <Button size="sm" variant="ghost" onClick={push.disable} loading={push.pending}>
                <BellOff aria-hidden />
                כיבוי במכשיר הזה
              </Button>
            </div>
          </div>
        ) : push.permission === "denied" ? (
          <p className="mt-1 text-sm text-warn">ההתראות חסומות במכשיר. מאשרים אותן בהגדרות המכשיר ← weblly ← התראות, ואז חוזרים לכאן.</p>
        ) : (
          <div className="mt-2 flex flex-col items-start gap-2">
            <p className="text-sm text-ink-2">ההתראות כבויות במכשיר הזה.</p>
            <Button size="sm" onClick={push.enable} loading={push.pending}>
              <Bell aria-hidden />
              הפעלת התראות
            </Button>
          </div>
        )}
      </div>

      <fieldset>
        <legend className="mb-1 text-sm font-semibold text-ink">על מה להתריע לי</legend>
        <p className="mb-2 text-xs text-ink-3">חל על כל המכשירים שלך. {morningLabel}</p>
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {[...EVENTS, ...DIGEST_PARTS.map((d) => ({ ...d, hint: "בתוך סיכום הבוקר" }))].map((e) => (
            <li key={e.key} className={cn(e.key.startsWith("digest_") && "bg-paper/50 ps-4", e.key.startsWith("digest_") && values.daily_digest === false && "opacity-50")}>
              <label className="flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">{e.label}</span>
                  <span className="block text-xs text-ink-3">{e.hint}</span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="peer sr-only"
                  checked={values[e.key]}
                  onChange={(ev) => toggle(e.key, ev.target.checked)}
                />
                <span
                  aria-hidden
                  className={cn(
                    "relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 peer-focus-visible:ring-3 peer-focus-visible:ring-accent/30",
                    values[e.key] ? "bg-accent" : "bg-line-strong",
                  )}
                >
                  <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow-1 transition-[inset-inline-start] duration-200", values[e.key] ? "start-[18px]" : "start-0.5")} />
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
    </div>
  );
}
