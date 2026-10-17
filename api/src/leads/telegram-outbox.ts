import { createHash, timingSafeEqual } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

function sentFilePath(): string {
  const uploadDir = process.env.UPLOAD_DIR || "/data/uploads";
  return join(dirname(uploadDir), "telegram-sent.json");
}

export function loadSentIds(): Set<string> {
  const path = sentFilePath();
  if (!existsSync(path)) {
    return new Set();
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    let ids: unknown[] = [];
    if (Array.isArray(raw)) {
      ids = raw;
    } else if (raw && typeof raw === "object" && Array.isArray((raw as { ids?: unknown }).ids)) {
      ids = (raw as { ids: unknown[] }).ids;
    }
    return new Set(ids.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

export function markSent(ids: string[]): void {
  const current = loadSentIds();
  for (const id of ids) {
    if (id) current.add(id);
  }
  const path = sentFilePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify([...current]));
}

export function outboxSecretsMatch(authorization: string | undefined, secret: string | undefined): boolean {
  const expected = secret?.trim() ?? "";
  const got = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!expected || !got) {
    return false;
  }
  const a = createHash("sha256").update(got).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
