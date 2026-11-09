export type ParsedHost =
  | { ok: true; host: string; merchantId: string | null; input: string }
  | { ok: false; input: string; reason: string };

export type ProbeTarget = { host: string; merchantId: string | null };

const BLOCKED_NAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.google",
]);

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function looksLikeIpv4(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function isPublicHostname(host: string): boolean {
  if (BLOCKED_NAMES.has(host)) return false;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) {
    return false;
  }
  if (host.includes(":")) return false;
  if (looksLikeIpv4(host)) return !isPrivateIpv4(host);
  return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(host);
}

/** Turn `9au.com`, `9au.com/RF123`, or `9au.com 10520` into a host plus optional merchant ID. */
export function parseProbeLine(raw: string): ParsedHost | null {
  const original = raw.trim();
  if (!original || original.startsWith("#")) return null;

  const split = original.match(/^(.*?)(?:[\s,|]+)(\d{3,8})$/);
  const target = (split?.[1] ?? original).trim();
  const merchantId = split?.[2] ?? null;
  if (!target) return { ok: false, input: original, reason: "Not a valid host" };

  const withScheme = /^https?:\/\//i.test(target) ? target : `https://${target}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, input: original, reason: "Not a valid host" };
  }

  if (url.username || url.password) {
    return { ok: false, input: original, reason: "Put the login in the fields above, not the URL" };
  }
  if (url.port && url.port !== "443" && url.port !== "80") {
    return { ok: false, input: original, reason: "Only ports 80 and 443 are allowed" };
  }

  const host = url.hostname.replace(/\.$/, "").toLowerCase();
  if (!isPublicHostname(host)) {
    return { ok: false, input: original, reason: "That host is not allowed" };
  }
  return { ok: true, host, merchantId, input: original };
}

export function parseProbeList(text: string): {
  targets: ProbeTarget[];
  rejected: Array<Extract<ParsedHost, { ok: false }>>;
} {
  const targets: ProbeTarget[] = [];
  const rejected: Array<Extract<ParsedHost, { ok: false }>> = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const parsed = parseProbeLine(line);
    if (!parsed) continue;
    if (!parsed.ok) {
      rejected.push(parsed);
      continue;
    }
    if (seen.has(parsed.host)) continue;
    seen.add(parsed.host);
    targets.push({ host: parsed.host, merchantId: parsed.merchantId });
  }
  return { targets, rejected };
}

export function isPrivateIpv4Address(ip: string): boolean {
  return looksLikeIpv4(ip) && isPrivateIpv4(ip);
}
