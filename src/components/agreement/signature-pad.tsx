"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

type Pt = { x: number; y: number; w: number };
type Stroke = Pt[];

export type SignaturePadHandle = { undo: () => void; clear: () => void; toPng: () => string | null; isEmpty: () => boolean };

const INK = "#111111";
const MIN_W = 1.3;
const MAX_W = 3.4;

/**
 * Draw-to-sign pad for finger, stylus, mouse and trackpad (pointer events,
 * coalesced samples). Strokes are kept as data, so the pad supports undo,
 * survives resize/rotation, and exports a cropped, padded, black PNG that
 * sits cleanly on the signature line of the document and the PDF.
 * Line width follows speed (slower = thicker), like a pen.
 */
export const SignaturePad = forwardRef<SignaturePadHandle, { onChange: (empty: boolean) => void; label: string }>(function SignaturePad({ onChange, label }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<{ stroke: Stroke; last: { x: number; y: number; t: number } } | null>(null);
  const size = useRef({ w: 0, h: 0 });
  const [empty, setEmpty] = useState(true);

  const redraw = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, size.current.w, size.current.h);
    for (const s of strokes.current) drawStroke(ctx, s, 1, 0, 0);
  }, []);

  const notify = useCallback(() => {
    const e = strokes.current.length === 0;
    setEmpty(e);
    onChange(e);
  }, [onChange]);

  useEffect(() => {
    const c = canvas.current!;
    const fit = () => {
      const { width, height } = c.getBoundingClientRect();
      if (!width || !height) return;
      const prev = size.current;
      // Keep the drawing when the pad changes size (rotation, sheet resize).
      if (prev.w && prev.w !== width) {
        const k = width / prev.w;
        strokes.current = strokes.current.map((s) => s.map((p) => ({ x: p.x * k, y: p.y * k, w: p.w })));
      }
      size.current = { w: width, h: height };
      const ratio = Math.min(window.devicePixelRatio || 1, 3);
      c.width = Math.round(width * ratio);
      c.height = Math.round(height * ratio);
      const ctx = c.getContext("2d")!;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    return () => ro.disconnect();
  }, [redraw]);

  useImperativeHandle(
    ref,
    () => ({
      undo: () => {
        strokes.current.pop();
        redraw();
        notify();
      },
      clear: () => {
        strokes.current = [];
        redraw();
        notify();
      },
      isEmpty: () => strokes.current.length === 0,
      toPng: () => exportPng(strokes.current),
    }),
    [notify, redraw],
  );

  const pos = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    try {
      canvas.current!.setPointerCapture(e.pointerId);
    } catch {
      /* capture is a nicety (keeps the stroke when leaving the pad) */
    }
    const p = pos(e);
    const w = e.pointerType === "pen" && e.pressure > 0 ? MIN_W + (MAX_W - MIN_W) * e.pressure : (MIN_W + MAX_W) / 2;
    current.current = { stroke: [{ ...p, w }], last: { ...p, t: e.timeStamp } };
    const ctx = canvas.current!.getContext("2d")!;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(p.x, p.y, w / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cur = current.current;
    if (!cur) return;
    e.preventDefault();
    const events = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [];
    const samples = events.length ? events : [e.nativeEvent];
    const ctx = canvas.current!.getContext("2d")!;
    for (const ev of samples) {
      const p = pos(ev);
      const dx = p.x - cur.last.x;
      const dy = p.y - cur.last.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.8) continue;
      const dt = Math.max(1, ev.timeStamp - cur.last.t);
      const prevW = cur.stroke[cur.stroke.length - 1].w;
      let target: number;
      if (ev.pointerType === "pen" && ev.pressure > 0) target = MIN_W + (MAX_W - MIN_W) * ev.pressure;
      else target = Math.max(MIN_W, Math.min(MAX_W, MAX_W - (dist / dt) * 0.9));
      const w = prevW * 0.7 + target * 0.3;
      cur.stroke.push({ ...p, w });
      cur.last = { ...p, t: ev.timeStamp };
      drawTail(ctx, cur.stroke);
    }
  };

  const up = () => {
    const cur = current.current;
    if (!cur) return;
    current.current = null;
    strokes.current.push(cur.stroke);
    redraw();
    notify();
  };

  return (
    <div className="relative">
      <canvas
        ref={canvas}
        className="block h-48 w-full cursor-crosshair touch-none select-none sm:h-52"
        style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        aria-label={label}
        role="img"
      />
      {/* Baseline + "X" like a paper signature line. */}
      <span className="pointer-events-none absolute inset-x-6 bottom-10 h-px bg-[#111]/30" aria-hidden />
      <span className="pointer-events-none absolute bottom-11 start-6 text-sm leading-none text-[#111]/40" aria-hidden>
        ×
      </span>
      {empty && (
        <span className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-6 text-center text-sm text-[#6a6a6a]" aria-hidden>
          חתמו כאן באצבע או בעכבר
        </span>
      )}
    </div>
  );
});

/** Smooth stroke: quadratic curves through midpoints, width per segment. */
function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, k: number, ox: number, oy: number) {
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const X = (p: Pt) => (p.x - ox) * k;
  const Y = (p: Pt) => (p.y - oy) * k;
  if (s.length === 1) {
    ctx.beginPath();
    ctx.arc(X(s[0]), Y(s[0]), (s[0].w * k) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1];
    const b = s[i];
    const startX = i === 1 ? X(a) : (X(s[i - 2]) + X(a)) / 2;
    const startY = i === 1 ? Y(a) : (Y(s[i - 2]) + Y(a)) / 2;
    const midX = (X(a) + X(b)) / 2;
    const midY = (Y(a) + Y(b)) / 2;
    ctx.lineWidth = ((a.w + b.w) / 2) * k;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(X(a), Y(a), midX, midY);
    ctx.stroke();
  }
  const last = s[s.length - 1];
  const prev = s[s.length - 2];
  ctx.lineWidth = last.w * k;
  ctx.beginPath();
  ctx.moveTo((X(prev) + X(last)) / 2, (Y(prev) + Y(last)) / 2);
  ctx.lineTo(X(last), Y(last));
  ctx.stroke();
}

/** Live drawing: only the newest segment, so long strokes stay fast. */
function drawTail(ctx: CanvasRenderingContext2D, s: Stroke) {
  const n = s.length;
  if (n < 2) return;
  const b = s[n - 1];
  const a = s[n - 2];
  const startX = n === 2 ? a.x : (s[n - 3].x + a.x) / 2;
  const startY = n === 2 ? a.y : (s[n - 3].y + a.y) / 2;
  ctx.strokeStyle = INK;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = (a.w + b.w) / 2;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
  ctx.stroke();
}

/** Crops to the ink, pads, renders at 3× for a crisp signature in print. */
function exportPng(strokes: Stroke[]): string | null {
  const pts = strokes.flat();
  if (!pts.length) return null;
  const pad = 6;
  const minX = Math.min(...pts.map((p) => p.x - p.w));
  const minY = Math.min(...pts.map((p) => p.y - p.w));
  const maxX = Math.max(...pts.map((p) => p.x + p.w));
  const maxY = Math.max(...pts.map((p) => p.y + p.w));
  const w = maxX - minX + pad * 2;
  const h = maxY - minY + pad * 2;
  const k = Math.min(3, 1200 / w, 480 / h);
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(w * k));
  out.height = Math.max(1, Math.round(h * k));
  const ctx = out.getContext("2d")!;
  for (const s of strokes) drawStroke(ctx, s, k, minX - pad, minY - pad);
  return out.toDataURL("image/png");
}
