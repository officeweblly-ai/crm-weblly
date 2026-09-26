/** Storage rules. The bucket enforces the same limits server-side. */
export const BUCKET = "crm-files";
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml", "image/avif", "image/heic", "image/heif"];

export const VIDEO_MIME = ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"];

export const DOCUMENT_MIME = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
  "application/postscript",
  "application/illustrator",
  "image/vnd.adobe.photoshop",
  "application/x-photoshop",
  "font/ttf",
  "font/otf",
  "font/woff",
  "font/woff2",
];

export const ALLOWED_MIME = [...IMAGE_MIME, ...VIDEO_MIME, ...DOCUMENT_MIME];

/** Extensions the browser often reports with an empty/odd MIME type. */
const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  zip: "application/zip",
  ai: "application/postscript",
  eps: "application/postscript",
  psd: "image/vnd.adobe.photoshop",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
  mp4: "video/mp4",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  webm: "video/webm",
};

export function extensionOf(name: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

/** Resolves a trustworthy MIME type from the browser value + extension. */
export function resolveMime(name: string, browserMime: string): string | null {
  if (ALLOWED_MIME.includes(browserMime)) return browserMime;
  const byExt = EXT_MIME[extensionOf(name)];
  return byExt && ALLOWED_MIME.includes(byExt) ? byExt : null;
}

export function isImageMime(mime: string): boolean {
  return IMAGE_MIME.includes(mime);
}

export function isVideoMime(mime: string): boolean {
  return VIDEO_MIME.includes(mime);
}

export function isPreviewable(mime: string): boolean {
  return (isImageMime(mime) && mime !== "image/heic" && mime !== "image/heif") || mime === "application/pdf" || isVideoMime(mime);
}

/** ASCII-only object key; the original (Hebrew) name lives in the DB. */
export function objectPath(prefix: string, originalName: string): string {
  const ext = extensionOf(originalName);
  return `${prefix}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
}

export const ACCEPT_IMAGES = IMAGE_MIME.join(",");
export const ACCEPT_MEDIA = [...IMAGE_MIME, ...VIDEO_MIME, "application/pdf", ".pdf", ".mov", ".mp4", ".heic"].join(",");
export const ACCEPT_ALL = [...ALLOWED_MIME, ...Object.keys(EXT_MIME).map((e) => `.${e}`)].join(",");
