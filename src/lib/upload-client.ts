"use client";

/**
 * PUTs a file to a Supabase signed upload URL with progress reporting
 * (fetch() cannot report upload progress; XHR can).
 */
export function uploadWithProgress(signedUrl: string, file: File, mime: string, onProgress: (pct: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("content-type", mime);
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.setRequestHeader("x-upsert", "false");
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (anon) xhr.setRequestHeader("apikey", anon);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        let message = `ההעלאה נכשלה (${xhr.status})`;
        try {
          const body = JSON.parse(xhr.responseText) as { message?: string; error?: string };
          if (body.message?.includes("mime")) message = "סוג הקובץ לא נתמך";
          else if (body.message?.toLowerCase().includes("size") || xhr.status === 413) message = "הקובץ גדול מדי";
          else if (body.message) message = body.message;
        } catch {
          /* keep default */
        }
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error("החיבור נותק במהלך ההעלאה"));
    xhr.onabort = () => reject(new Error("ההעלאה בוטלה"));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(file);
  });
}
