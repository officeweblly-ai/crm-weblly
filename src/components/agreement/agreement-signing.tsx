"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertDialog, Dialog } from "radix-ui";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowDown, Check, Eraser, Loader2, PenLine, Undo2, X } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { PdfButton } from "@/components/ui/pdf-button";
import { signAgreement } from "@/lib/actions/agreement";
import { signingSummary, signsNow, type Party, type PartnerAgreement } from "@/lib/domain/partners";
import { cn } from "@/lib/utils";
import { AgreementDocument, signedStamp, type DocSignature } from "./agreement-document";
import { SignaturePad, type SignaturePadHandle } from "./signature-pad";

export type SigningView = {
  id: string;
  token: string;
  title: string;
  content: PartnerAgreement;
  version: number;
  currentVersion: number;
  isCurrent: boolean;
  hash: string;
  signatures: DocSignature[];
};

const VIEWER = "__viewer";
const btnInk =
  "inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#111] px-5 text-[15px] font-medium text-white transition-[background-color,transform] duration-150 hover:bg-[#2b2b2b] active:translate-y-px disabled:cursor-not-allowed disabled:bg-[#111]/35 [&_svg]:size-4";
const btnLine =
  "inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#111]/20 bg-white px-4 text-[15px] font-medium text-[#111] transition-colors duration-150 hover:border-[#111]/45 hover:bg-[#f6f6f4] [&_svg]:size-4";
const btnTool =
  "inline-flex min-h-11 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-[#3d3d3d] hover:bg-[#f3f3f1] hover:text-[#111] disabled:text-[#111]/30 disabled:hover:bg-transparent [&_svg]:size-4";
const btnText = "inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-[#111] underline decoration-[#111]/30 underline-offset-4 hover:decoration-[#111] [&_svg]:size-4";

/**
 * The dedicated signing page: choose who is signing (remembered for this
 * browser session), read the full agreement, sign / replace a signature.
 */
export function AgreementSigning({ view }: { view: SigningView }) {
  const router = useRouter();
  const { content, token } = view;
  const storageKey = `agreement-signer:${token}`;
  const [signer, setSigner] = useState<string | null>(null);
  const [introOpen, setIntroOpen] = useState(false);
  const [signFor, setSignFor] = useState<{ party: Party; replace: boolean } | null>(null);
  const [confirmReplace, setConfirmReplace] = useState<Party | null>(null);
  const [sigInView, setSigInView] = useState(false);

  const signedKeys = view.signatures.map((s) => s.party);
  const summary = signingSummary(content.parties, signedKeys);
  const me = content.parties.find((p) => p.key === signer) ?? null;
  const mySig = me ? view.signatures.find((s) => s.party === me.key) : undefined;

  // Restore the signer chosen earlier in this session; never ask inside print/PDF rendering.
  useEffect(() => {
    if (!view.isCurrent || window.matchMedia("print").matches) return;
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(storageKey);
    } catch {
      /* storage blocked */
    }
    const valid = saved === VIEWER || content.parties.some((p) => p.key === saved);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from sessionStorage
    if (valid) setSigner(saved);
    else setIntroOpen(true);
  }, [storageKey, content.parties, view.isCurrent]);

  useEffect(() => {
    const el = document.querySelector(".agr-signatures");
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setSigInView(e.isIntersecting), { rootMargin: "0px 0px -15% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const choose = (key: string) => {
    setSigner(key);
    setIntroOpen(false);
    try {
      sessionStorage.setItem(storageKey, key);
    } catch {
      /* storage blocked — still works for this page view */
    }
  };

  const toSignatures = () => document.querySelector(".agr-signatures")?.scrollIntoView({ behavior: "smooth", block: "start" });

  const stateText =
    summary.state === "signed" ? "נחתם במלואו" : summary.state === "partial" ? "נחתם חלקית" : "טיוטה · ממתין לחתימות";
  const pdfName = `הסכם שותפות WEBLLY — גרסה ${view.version}${summary.state === "signed" ? " — חתום" : summary.state === "partial" ? " — נחתם חלקית" : " — טיוטה"}`;

  return (
    <div className="min-h-dvh bg-[#ededeb] text-[#111] print:min-h-0 print:bg-white">
      <header className="sticky top-0 z-30 border-b border-[#111]/10 bg-white/95 backdrop-blur-sm print:hidden">
        <div className="mx-auto flex h-14 max-w-[900px] items-center gap-3 px-4 sm:px-6">
          <span className="inline-flex items-center gap-2" dir="ltr" aria-label="WEBLLY">
            <LogoMark tone="mono" className="h-[18px] w-auto" />
            <span className="font-[Arial,Helvetica,sans-serif] text-[14px] font-bold tracking-[0.14em]">WEBLLY</span>
          </span>
          <div className="ms-auto flex items-center gap-1 sm:gap-2">
            {view.isCurrent && me && (
              <button
                type="button"
                onClick={() => setIntroOpen(true)}
                className="flex min-h-11 flex-col items-start justify-center rounded-md px-2 text-start leading-tight hover:bg-[#f3f3f1]"
                aria-label={`${signsNow(me)}: ${me.name}. החלפת חותם`}
              >
                <span className="text-[11px] text-[#6a6a6a]">{signsNow(me)}</span>
                <span className="text-sm font-semibold">{me.name}</span>
              </button>
            )}
            {view.isCurrent && signer === VIEWER && (
              <button type="button" onClick={() => setIntroOpen(true)} className={btnText}>
                בחירת חותם
              </button>
            )}
            <PdfButton path={`/agreement/${token}`} version={view.isCurrent ? undefined : view.version} name={pdfName} label="PDF" variant="secondary" size="sm" className="h-10! rounded-md! px-3!" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[900px] pb-32 sm:px-6 sm:pt-8 print:max-w-none print:p-0 print:pb-0">
        {/* Status — what is signed and what is still missing. */}
        <section className="border-b border-[#111]/10 bg-white px-5 py-5 sm:mb-6 sm:rounded-md sm:border sm:px-7 print:hidden" aria-label="מצב ההסכם">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-lg font-bold leading-snug sm:text-xl">{view.title}</p>
            <p className="text-sm text-[#5a5a5a]">
              גרסה {view.version} · <span className="font-medium text-[#111]">{stateText}</span>
            </p>
          </div>
          {!view.isCurrent && (
            <p className="mt-3 border-s-2 border-[#111] ps-3 text-sm leading-relaxed">
              זו גרסה קודמת ({view.version}) שנשמרה כפי שנחתמה — לצפייה בלבד.{" "}
              <Link href={`/agreement/${token}`} className="font-medium underline underline-offset-4">
                לגרסה הנוכחית ({view.currentVersion})
              </Link>
            </p>
          )}
          {summary.state === "signed" ? (
            <p className="mt-4 flex items-center gap-2 text-[15px] font-semibold">
              <span className="grid size-6 place-items-center rounded-full bg-[#111] text-white">
                <Check className="size-3.5" strokeWidth={3} aria-hidden />
              </span>
              ההסכם נחתם על ידי שני הצדדים
            </p>
          ) : null}
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 sm:gap-6">
            {content.parties.map((p) => {
              const s = view.signatures.find((x) => x.party === p.key);
              return (
                <li key={p.key} className="flex items-start gap-2.5 text-sm">
                  <span
                    className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border", s ? "border-[#111] bg-[#111] text-white" : "border-[#111]/30")}
                    aria-hidden
                  >
                    {s && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{p.name}</span>
                    <span className="block text-[#5a5a5a]">
                      {s ? (
                        <>
                          חתום · <span dir="ltr">{signedStamp(s.signedAt)}</span>
                        </>
                      ) : (
                        "ממתין לחתימה"
                      )}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="bg-white sm:rounded-[3px] sm:shadow-[0_1px_2px_rgb(0_0_0/0.06),0_12px_32px_-12px_rgb(0_0_0/0.18)] sm:ring-1 sm:ring-[#111]/[0.06] print:shadow-none print:ring-0">
          <AgreementDocument
            id={view.id}
            title={view.title}
            content={content}
            version={view.version}
            hash={view.hash}
            signatures={view.signatures}
            signatureSlot={
              view.isCurrent
                ? (p) => (
                    <SignatureControls
                      party={p}
                      signed={view.signatures.find((s) => s.party === p.key)}
                      isMe={signer === p.key}
                      onSign={() => setSignFor({ party: p, replace: false })}
                      onReplace={() => setConfirmReplace(p)}
                      onSignAs={() => {
                        choose(p.key);
                        setSignFor({ party: p, replace: false });
                      }}
                    />
                  )
                : undefined
            }
          />
        </div>
      </main>

      {/* Phone/desktop helper: jump to the signature once the reader is ready. */}
      {view.isCurrent && me && !mySig && !sigInView && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#111]/10 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm print:hidden">
          <div className="mx-auto flex max-w-[900px] items-center justify-between gap-3">
            <p className="text-sm leading-snug text-[#3d3d3d]">קראו את ההסכם עד הסוף. החתימה בתחתית המסמך.</p>
            <button type="button" className={cn(btnInk, "h-11 shrink-0 px-4")} onClick={toSignatures}>
              <ArrowDown aria-hidden />
              לחתימה
            </button>
          </div>
        </div>
      )}

      <SignerIntro
        open={introOpen}
        onOpenChange={(o) => (o || signer ? setIntroOpen(o) : choose(VIEWER))}
        parties={content.parties}
        signatures={view.signatures}
        current={signer}
        title={view.title}
        version={view.version}
        onChoose={choose}
      />

      <AlertDialog.Root open={!!confirmReplace} onOpenChange={(o) => !o && setConfirmReplace(null)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-[fade-in_160ms_ease-out] print:hidden" />
          <AlertDialog.Content className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-sm -translate-y-1/2 rounded-lg bg-white p-6 shadow-[0_24px_60px_-12px_rgb(0_0_0/0.35)] outline-none data-[state=open]:animate-[fade-in_160ms_ease-out] print:hidden">
            <AlertDialog.Title className="text-lg font-bold">שינוי חתימה</AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-[15px] leading-relaxed text-[#3d3d3d]">
              החתימה הקיימת תוחלף בחתימה החדשה. להמשיך?
            </AlertDialog.Description>
            <p className="mt-2 text-xs leading-relaxed text-[#6a6a6a]">החתימה הקודמת נשמרת בהיסטוריית ההסכם ואינה נמחקת.</p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
              <AlertDialog.Action
                className={btnInk}
                onClick={() => {
                  const p = confirmReplace!;
                  setConfirmReplace(null);
                  setSignFor({ party: p, replace: true });
                }}
              >
                המשך לחתימה חדשה
              </AlertDialog.Action>
              <AlertDialog.Cancel className={btnLine}>ביטול</AlertDialog.Cancel>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      <SignDialog
        target={signFor}
        onClose={() => setSignFor(null)}
        token={token}
        version={view.version}
        hash={view.hash}
        onSigned={(complete, replaced) => {
          setSignFor(null);
          toast.success(complete ? "ההסכם נחתם על ידי שני הצדדים" : replaced ? "החתימה הוחלפה" : "החתימה נשמרה");
          router.refresh();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
    </div>
  );
}

function SignatureControls({
  party,
  signed,
  isMe,
  onSign,
  onReplace,
  onSignAs,
}: {
  party: Party;
  signed: DocSignature | undefined;
  isMe: boolean;
  onSign: () => void;
  onReplace: () => void;
  onSignAs: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {signed ? (
        <>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <Check className="size-4" strokeWidth={2.5} aria-hidden />
            חתום
          </span>
          {isMe && (
            <button type="button" onClick={onReplace} className={btnText}>
              שינוי חתימה
            </button>
          )}
        </>
      ) : isMe ? (
        <button type="button" onClick={onSign} className={cn(btnInk, "w-full sm:w-auto")}>
          <PenLine aria-hidden />
          חתימה
        </button>
      ) : (
        <button type="button" onClick={onSignAs} className={btnText}>
          חתימה בתור {party.short}
        </button>
      )}
    </div>
  );
}

function SignerIntro({
  open,
  onOpenChange,
  parties,
  signatures,
  current,
  title,
  version,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  parties: Party[];
  signatures: DocSignature[];
  current: string | null;
  title: string;
  version: number;
  onChoose: (key: string) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[#ededeb]/80 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_180ms_ease-out] print:hidden" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-xl bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6 shadow-[0_-12px_40px_-12px_rgb(0_0_0/0.25)] outline-none data-[state=open]:animate-[sheet-in_260ms_cubic-bezier(0.32,0.72,0,1)] sm:inset-x-0 sm:bottom-auto sm:top-[12vh] sm:mx-auto sm:w-[calc(100vw-2rem)] sm:max-w-[440px] sm:rounded-lg sm:px-7 sm:pb-7 sm:pt-7 sm:shadow-[0_24px_60px_-12px_rgb(0_0_0/0.3)] sm:data-[state=open]:animate-[pop-in_200ms_cubic-bezier(0.2,0.8,0.2,1)] print:hidden">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2" dir="ltr">
              <LogoMark tone="mono" className="h-4 w-auto" />
              <span className="font-[Arial,Helvetica,sans-serif] text-[13px] font-bold tracking-[0.14em]">WEBLLY</span>
            </span>
            {current && (
              <Dialog.Close className="-me-2 grid size-11 place-items-center rounded-md text-[#6a6a6a] hover:bg-[#f3f3f1] hover:text-[#111]" aria-label="סגירה">
                <X className="size-5" />
              </Dialog.Close>
            )}
          </div>
          <p className="mt-5 text-sm text-[#5a5a5a]">
            {title} · גרסה {version}
          </p>
          <Dialog.Title className="mt-1 text-[22px] font-bold leading-tight">מי חותם עכשיו?</Dialog.Title>
          <Dialog.Description className="mt-1.5 text-[15px] leading-relaxed text-[#3d3d3d]">
            הבחירה נשמרת לחלון הזה בלבד. כל אחד מהשותפים חותם מאותו קישור.
          </Dialog.Description>
          <ul className="mt-5 divide-y divide-[#111]/10 border-y border-[#111]/10">
            {parties.map((p) => {
              const s = signatures.find((x) => x.party === p.key);
              return (
                <li key={p.key}>
                  <button
                    type="button"
                    onClick={() => onChoose(p.key)}
                    className={cn(
                      "group flex min-h-[68px] w-full items-center gap-3 px-1 py-3 text-start transition-colors hover:bg-[#f6f6f4] focus-visible:bg-[#f6f6f4]",
                      current === p.key && "bg-[#f6f6f4]",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[17px] font-semibold leading-snug">{p.name}</span>
                      <span className="block text-sm text-[#5a5a5a]">
                        {p.title} · {p.role}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-[#5a5a5a]">
                      {s ? (
                        <span className="inline-flex items-center gap-1 font-medium text-[#111]">
                          <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
                          חתום
                        </span>
                      ) : p.gender === "f" ? (
                        "טרם חתמה"
                      ) : (
                        "טרם חתם"
                      )}
                    </span>
                    <span className="text-lg leading-none text-[#111]/30 transition-transform group-hover:-translate-x-0.5" aria-hidden>
                      ‹
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" onClick={() => onChoose(VIEWER)} className={cn(btnText, "mt-3 text-[#3d3d3d]")}>
            צפייה בלבד, בלי לחתום
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SignDialog({
  target,
  onClose,
  token,
  version,
  hash,
  onSigned,
}: {
  target: { party: Party; replace: boolean } | null;
  onClose: () => void;
  token: string;
  version: number;
  hash: string;
  onSigned: (complete: boolean, replaced: boolean) => void;
}) {
  const pad = useRef<SignaturePadHandle>(null);
  const [empty, setEmpty] = useState(true);
  const [agree, setAgree] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const onPadChange = useCallback((e: boolean) => setEmpty(e), []);

  const open = !!target;
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the form each time the dialog opens
      setAgree(false);
      setTyped("");
      setError(null);
      setEmpty(true);
    }
  }, [open]);

  const party = target?.party;
  const submit = () => {
    if (!party) return;
    const png = pad.current?.toPng();
    if (!png) return setError("צריך לחתום בתוך המסגרת.");
    if (!agree) return setError("צריך לאשר שקראת את ההסכם.");
    setError(null);
    start(async () => {
      const r = await signAgreement(token, { party: party.key, version, hash, signature: png, typedName: typed.trim() || undefined, agree: true, replace: target!.replace });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onSigned(r.data.complete, r.data.replaced);
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && !pending && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-[fade-in_180ms_ease-out] print:hidden" />
        <Dialog.Content
          onPointerDownOutside={(e) => e.preventDefault()}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[96dvh] flex-col rounded-t-xl bg-white outline-none data-[state=open]:animate-[sheet-in_260ms_cubic-bezier(0.32,0.72,0,1)] sm:inset-x-0 sm:bottom-auto sm:top-[6vh] sm:mx-auto sm:max-h-[88vh] sm:w-[calc(100vw-2rem)] sm:max-w-[560px] sm:rounded-lg sm:shadow-[0_24px_60px_-12px_rgb(0_0_0/0.35)] sm:data-[state=open]:animate-[pop-in_200ms_cubic-bezier(0.2,0.8,0.2,1)] print:hidden"
        >
          <header className="flex items-start justify-between gap-3 border-b border-[#111]/10 px-5 pb-3 pt-4 sm:px-6">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-bold">{target?.replace ? "שינוי חתימה" : "חתימה על ההסכם"}</Dialog.Title>
              <Dialog.Description className="text-sm text-[#5a5a5a]">
                {party ? signsNow(party) : ""}: <span className="font-semibold text-[#111]">{party?.name}</span>
                {party ? ` · ${party.title}` : ""}
              </Dialog.Description>
            </div>
            <Dialog.Close className="-me-2 grid size-11 shrink-0 place-items-center rounded-md text-[#6a6a6a] hover:bg-[#f3f3f1] hover:text-[#111]" aria-label="סגירה" disabled={pending}>
              <X className="size-5" />
            </Dialog.Close>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
            <div className="rounded-md border border-[#111]/20 bg-white">
              {open && <SignaturePad ref={pad} onChange={onPadChange} label={`אזור חתימה עבור ${party?.name ?? ""}`} />}
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-xs text-[#6a6a6a]">גרסה {version}</span>
              <div className="flex items-center">
                <button type="button" className={btnTool} onClick={() => pad.current?.undo()} disabled={empty}>
                  <Undo2 aria-hidden />
                  ביטול פעולה
                </button>
                <button type="button" className={btnTool} onClick={() => pad.current?.clear()} disabled={empty}>
                  <Eraser aria-hidden />
                  ניקוי
                </button>
              </div>
            </div>

            <label className="mt-4 block">
              <span className="text-sm font-medium">אישור בהקלדת שם מלא <span className="font-normal text-[#6a6a6a]">(לא חובה)</span></span>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={party?.name}
                autoComplete="name"
                maxLength={120}
                className="mt-1.5 block h-12 w-full rounded-md border border-[#111]/20 bg-white px-3 text-base outline-none placeholder:text-[#111]/30 focus:border-[#111] focus:ring-2 focus:ring-[#111]/10"
              />
            </label>

            <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-3">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-5 shrink-0 cursor-pointer accent-[#111]" />
              <span className="text-[15px] leading-relaxed">קראתי את ההסכם ואני מאשר/ת את תוכנו</span>
            </label>

            <p className="mt-2 text-xs leading-relaxed text-[#6a6a6a]">
              החתימה תישמר עם גרסה {version} של ההסכם, התאריך והשעה, ותיקשר לנוסח המדויק שהוצג.
              {target?.replace ? " החתימה הקודמת תישמר בהיסטוריה." : ""}
            </p>
            {error && (
              <p className="mt-3 border-s-2 border-[#b4333a] ps-3 text-sm font-medium text-[#b4333a]" role="alert">
                {error}
              </p>
            )}
          </div>

          <footer className="flex flex-col-reverse gap-2 border-t border-[#111]/10 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:flex-row sm:px-6 sm:pb-4">
            <button type="button" className={cn(btnInk, "h-12 sm:min-w-44")} onClick={submit} disabled={pending || empty || !agree} aria-busy={pending || undefined}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <PenLine aria-hidden />}
              חתום ואשר
            </button>
            <button type="button" className={cn(btnLine, "h-12")} onClick={onClose} disabled={pending}>
              ביטול
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
