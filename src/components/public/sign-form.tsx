"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eraser, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormGrid, Input, LtrInput } from "@/components/ui/field";
import { signContract } from "@/lib/actions/contracts";
import { useFormAction } from "@/lib/use-form-action";

/**
 * Draw-to-sign pad. Pointer events cover finger, stylus and mouse; the canvas
 * is scaled for the screen's pixel ratio so the line stays sharp on iPhone,
 * and `touch-action: none` keeps the page from scrolling while signing.
 */
function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current!;
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = c.getBoundingClientRect();
      c.width = Math.round(width * ratio);
      c.height = Math.round(height * ratio);
      const ctx = c.getContext("2d")!;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#141824";
      dirty.current = false;
      setEmpty(true);
      onChange(null);
    };
    resize();
    // Rotating the phone resizes the pad; the signature is redrawn by the signer.
    window.addEventListener("orientationchange", resize);
    return () => window.removeEventListener("orientationchange", resize);
  }, [onChange]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = canvas.current!.getContext("2d")!;
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.01, y);
    ctx.stroke();
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvas.current!.getContext("2d")!;
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    dirty.current = true;
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (dirty.current) {
      setEmpty(false);
      onChange(canvas.current!.toDataURL("image/png"));
    }
  };
  const clear = () => {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    dirty.current = false;
    setEmpty(true);
    onChange(null);
  };

  return (
    <div>
      <div className="relative overflow-hidden rounded-lg border border-line-strong bg-white">
        <canvas
          ref={canvas}
          className="block h-44 w-full cursor-crosshair touch-none select-none"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
          aria-label="אזור חתימה — חתמו עם האצבע או העכבר"
          role="img"
        />
        {empty && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-ink-3">
            <span className="inline-flex items-center gap-1.5"><PenLine className="size-4" aria-hidden />חתמו כאן</span>
          </span>
        )}
        <span className="pointer-events-none absolute inset-x-6 bottom-9 h-px bg-line-strong" aria-hidden />
      </div>
      <div className="mt-1.5 flex justify-end">
        <Button type="button" size="sm" variant="ghost" onClick={clear} disabled={empty}>
          <Eraser aria-hidden />
          ניקוי
        </Button>
      </div>
    </div>
  );
}

export function SignForm({ token, version, hash, defaultName }: { token: string; version: number; hash: string; defaultName: string }) {
  const router = useRouter();
  const [signature, setSignature] = useState<string | null>(null);
  const { pending, errors, onSubmit } = useFormAction(signContract.bind(null, token), {
    onSuccess: () => {
      router.refresh();
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="hash" value={hash} />
      <input type="hidden" name="signature" value={signature ?? ""} />
      <FormGrid>
        <Field label="שם מלא" required error={errors.name}>
          {(p) => <Input {...p} name="name" defaultValue={defaultName} autoComplete="name" />}
        </Field>
        <Field label="ת.ז / ח.פ" hint="לא חובה" error={errors.id_number}>
          {(p) => <LtrInput {...p} name="id_number" inputMode="numeric" maxLength={9} />}
        </Field>
      </FormGrid>
      <Field label="אימייל לקבלת עותק" hint="לא חובה" error={errors.email}>
        {(p) => <LtrInput {...p} name="email" type="email" inputMode="email" autoComplete="email" />}
      </Field>
      <div>
        <p className="mb-1.5 text-sm font-medium text-ink-2">
          חתימה <span className="text-danger" aria-hidden>*</span>
        </p>
        <SignaturePad onChange={setSignature} />
        {errors.signature && <p className="text-xs font-medium text-danger" role="alert">{errors.signature}</p>}
      </div>
      <Checkbox name="agree" label="קראתי את ההסכם, אני מאשר/ת את הפרטים ומסכים/ה לתנאיו" />
      {errors.agree && <p className="-mt-3 text-xs font-medium text-danger" role="alert">{errors.agree}</p>}
      <Button type="submit" size="lg" loading={pending} disabled={!signature} className="sm:self-start sm:min-w-48">
        <PenLine aria-hidden />
        חתימה ושליחה
      </Button>
    </form>
  );
}
