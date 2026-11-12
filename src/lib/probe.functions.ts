import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ProbeVerdict } from "@/lib/classify";
import { isPrivateIpv4Address, parseProbeLine } from "@/lib/hosts";
import { captchaRequired, readMerchantProfile } from "@/lib/merchant";

const inputSchema = z.object({
  host: z.string().min(1).max(253),
  merchantId: z.string().regex(/^\d{3,8}$/).nullable(),
});

export type HostPrep = {
  host: string;
  endpoint: string;
  merchantId: string | null;
  needsCaptcha: boolean;
  skip: { verdict: ProbeVerdict; message: string } | null;
};

function sameSite(from: string, to: string): boolean {
  return to === from || to === `www.${from}` || from === `www.${to}`;
}

type SiteProfile = { merchantId: string; loginCaptcha: number | null };

const profileCache = new Map<string, { profile: SiteProfile; expires: number }>();
const PROFILE_TTL_MS = 30 * 60 * 1000;

async function readSiteHtml(response: Response): Promise<{ profile: SiteProfile | null; sample: string }> {
  const reader = response.body?.getReader();
  if (!reader) {
    const html = (await response.text()).slice(0, 2_000_000);
    const found = readMerchantProfile(html);
    return {
      profile: found.merchantId ? { merchantId: found.merchantId, loginCaptcha: found.loginCaptcha } : null,
      sample: html.slice(0, 4000),
    };
  }
  const decoder = new TextDecoder();
  let html = "";
  try {
    while (html.length < 2_000_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      const found = readMerchantProfile(html);
      if (found.merchantId && found.loginCaptcha !== null) {
        return { profile: { merchantId: found.merchantId, loginCaptcha: found.loginCaptcha }, sample: "" };
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const found = readMerchantProfile(html);
  return {
    profile: found.merchantId ? { merchantId: found.merchantId, loginCaptcha: found.loginCaptcha } : null,
    sample: html.slice(0, 4000),
  };
}

function transientFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "TimeoutError" ||
    error.name === "AbortError" ||
    /timeout|network|fetch|socket|reset|aborted|ebusy|eai_again|eagain/i.test(error.message)
  );
}

function dnsFailure(error: unknown): Error {
  const message = error instanceof Error ? error.message : "";
  if (/not allowed|blocked address/i.test(message)) return error instanceof Error ? error : new Error(message);
  if (/ENOTFOUND/i.test(message)) return new Error("This domain does not resolve. No login was sent.");
  if (/EBUSY|EAI_AGAIN|EAGAIN/i.test(message)) return new Error("DNS was busy. No login was sent.");
  return new Error("This domain could not be resolved. No login was sent.");
}

async function assertPublicHost(host: string): Promise<void> {
  const parsed = parseProbeLine(host);
  if (!parsed || !parsed.ok || parsed.host !== host) {
    throw new Error("Host is not allowed");
  }
  const { lookup } = await import("node:dns/promises");
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { address } = await lookup(host, { verbatim: true });
      if (address.includes(":") || isPrivateIpv4Address(address) || address === "0.0.0.0") {
        throw new Error("Host resolves to a blocked address");
      }
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/not allowed|blocked address/i.test(message)) throw error;
      last = error;
      if (attempt < 2 && /EBUSY|EAI_AGAIN|EAGAIN|ETIMEOUT/i.test(message)) {
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
        continue;
      }
      break;
    }
  }
  throw dnsFailure(last);
}

function pageBlock(status: number, html: string): string | null {
  if (/suspected phishing|just a moment|cf-browser-verification|attention required|enable javascript and cookies/i.test(html)) {
    return `The site blocked the merchant page${status ? ` (HTTP ${status})` : ""}. No login was sent.`;
  }
  if (status >= 400) return `The merchant page returned HTTP ${status}. No login was sent.`;
  return null;
}

async function loadSiteProfile(host: string): Promise<SiteProfile> {
  const cached = profileCache.get(host);
  if (cached && cached.expires > Date.now()) return cached.profile;
  if (cached) profileCache.delete(host);

  let url = `https://${host}/`;
  let response: Response | null = null;
  for (let hop = 0; hop < 2; hop++) {
    response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: {
        Accept: "text/html",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (response.status < 300 || response.status >= 400) break;
    if (hop === 1) throw new Error("This host redirected before publishing a merchant ID");
    const location = response.headers.get("location");
    if (!location) throw new Error("This host redirected before publishing a merchant ID");
    const next = new URL(location, url);
    if (next.protocol !== "https:") throw new Error("Merchant page redirected off HTTPS");
    if (next.port && next.port !== "443") throw new Error("Merchant page redirected to a blocked port");
    const nextHost = next.hostname.replace(/\.$/, "").toLowerCase();
    if (!sameSite(host, nextHost)) {
      throw new Error("Merchant page redirected to a different site");
    }
    await assertPublicHost(nextHost);
    url = next.toString();
    response = null;
  }

  if (!response) throw new Error("This site did not publish a merchant ID");
  if (response.status >= 400) {
    const html = await response.text().catch(() => "");
    throw new Error(pageBlock(response.status, html) ?? `The merchant page returned HTTP ${response.status}. No login was sent.`);
  }
  const { profile, sample } = await readSiteHtml(response);
  if (!profile) {
    throw new Error(pageBlock(response.status, sample) ?? "This page loaded, but it did not include a merchant ID. No login was sent.");
  }
  profileCache.set(host, { profile, expires: Date.now() + PROFILE_TTL_MS });
  return profile;
}

async function siteProfile(host: string): Promise<SiteProfile> {
  try {
    return await loadSiteProfile(host);
  } catch (error) {
    if (!transientFailure(error)) throw error;
    return loadSiteProfile(host);
  }
}

export const prepareHost = createServerFn({ method: "POST" })
  .validator((value: unknown) => inputSchema.parse(value))
  .handler(async ({ data }): Promise<HostPrep> => {
    const host = data.host.trim().toLowerCase();
    const endpoint = `https://${host}/api/v1/index.php`;
    const base: HostPrep = { host, endpoint, merchantId: data.merchantId, needsCaptcha: false, skip: null };

    try {
      await assertPublicHost(host);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Host is not allowed";
      return {
        ...base,
        skip: {
          verdict: /not allowed|blocked address/i.test(message) ? "blocked" : "unreachable",
          message,
        },
      };
    }

    let merchantId = data.merchantId;
    let loginCaptcha: number | null = null;
    try {
      const profile = await siteProfile(host);
      loginCaptcha = profile.loginCaptcha;
      merchantId = merchantId ?? profile.merchantId;
    } catch (error) {
      if (!merchantId) {
        const message = error instanceof Error ? error.message : "Could not read a merchant ID";
        const verdict = /blocked the merchant page|suspected phishing/i.test(message)
          ? "blocked"
          : /does not resolve|DNS was busy|could not be resolved|timed out|timeout/i.test(message)
            ? "unreachable"
            : "unclear";
        return {
          ...base,
          skip: { verdict, message },
        };
      }
    }

    if (!merchantId) {
      return {
        ...base,
        skip: {
          verdict: "unclear",
          message: "Could not read a merchant ID. No attempt was sent.",
        },
      };
    }

    return { ...base, merchantId, needsCaptcha: captchaRequired(loginCaptcha), skip: null };
  });
