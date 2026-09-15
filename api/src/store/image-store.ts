import { createHash } from "crypto";
import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

const MAX_REMOTE_BYTES = 8 * 1024 * 1024;

function uploadsDir(): string {
  if (process.env.UPLOAD_DIR?.trim()) return process.env.UPLOAD_DIR.trim();
  const db = process.env.DATABASE_URL ?? "";
  if (db.includes("/data/") || db.includes("file:/data")) return "/data/uploads";
  return join(process.cwd(), "uploads");
}

function extFromMime(mime: string): string {
  const t = mime.toLowerCase();
  if (t.includes("png")) return "png";
  if (t.includes("webp")) return "webp";
  if (t.includes("gif")) return "gif";
  if (t.includes("avif")) return "avif";
  if (t.includes("svg")) return "svg";
  return "jpg";
}

function publicUrl(fileName: string): string {
  return `/api/uploads/${fileName}`;
}

export async function ensureUploadsDir(): Promise<string> {
  const dir = uploadsDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

export function getUploadsDir(): string {
  return uploadsDir();
}

async function writeBuffer(key: string, buf: Buffer, ext: string): Promise<string> {
  const dir = await ensureUploadsDir();
  const hash = createHash("sha1").update(buf).digest("hex").slice(0, 16);
  const fileName = `${key.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "img"}-${hash}.${ext}`;
  const full = join(dir, fileName);
  if (!existsSync(full)) {
    await writeFile(full, buf);
  }
  return publicUrl(fileName);
}

async function persistDataUrl(value: string, key: string): Promise<string> {
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return value;
  try {
    const buf = Buffer.from(match[2].replace(/\s/g, ""), "base64");
    if (!buf.length || buf.length > MAX_REMOTE_BYTES) return value;
    return await writeBuffer(key, buf, extFromMime(match[1]));
  } catch {
    return value;
  }
}

async function persistRemoteUrl(value: string, key: string): Promise<string> {
  const dir = await ensureUploadsDir();
  const hash = createHash("sha1").update(value).digest("hex").slice(0, 16);
  const guessed = `${key.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "img"}-${hash}`;
  for (const ext of ["jpg", "jpeg", "png", "webp", "gif", "avif"]) {
    const existing = join(dir, `${guessed}.${ext}`);
    if (existsSync(existing)) return publicUrl(`${guessed}.${ext}`);
  }
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 12000);
    const res = await fetch(value, { signal: ac.signal, redirect: "follow" });
    clearTimeout(timer);
    if (!res.ok) return value;
    const mime = res.headers.get("content-type") || "image/jpeg";
    if (!mime.startsWith("image/")) return value;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_REMOTE_BYTES) return value;
    const ext = extFromMime(mime);
    const fileName = `${guessed}.${ext}`;
    const full = join(dir, fileName);
    if (!existsSync(full)) await writeFile(full, buf);
    return publicUrl(fileName);
  } catch {
    return value;
  }
}

/** Сохраняет картинку на диск. При ошибке возвращает исходный URL — карточка не теряется. */
export async function persistStoreImage(raw: string | undefined | null, key: string): Promise<string | undefined> {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  if (value.startsWith("/api/uploads/") || value.startsWith("/image") || value.startsWith("/img")) {
    return value;
  }
  if (value.startsWith("data:image/")) return persistDataUrl(value, key);
  if (/^https?:\/\//i.test(value)) return persistRemoteUrl(value, key);
  return value;
}
