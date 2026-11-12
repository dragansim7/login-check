import { n as TSS_SERVER_FUNCTION, t as createServerFn } from "./ssr.mjs";
import { n as parseProbeLine, t as isPrivateIpv4Address } from "./hosts-DiHcMEh5.mjs";
import { i as string, r as object } from "../_libs/zod.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/probe.functions-Diz9JxJD.js
var createServerRpc = (serverFnMeta, splitImportFn) => {
	const url = "/_serverFn/" + serverFnMeta.id;
	return Object.assign(splitImportFn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var inputSchema = object({
	host: string().min(1).max(253),
	merchantId: string().regex(/^\d{3,8}$/).nullable()
});
function sameSite(from, to) {
	return to === from || to === `www.${from}` || from === `www.${to}`;
}
function readProfile(html) {
	const merchant = html.match(/\bMERCHANTID\s*=\s*["']?(\d{3,8})\b/i)?.[1] ?? html.match(/\bMERCHANT_ID\s*=\s*["']?(\d{3,8})\b/i)?.[1] ?? null;
	const captcha = html.match(/LoginCaptcha\\?"?\s*[:=]\s*\\?"?(\d+)/i)?.[1] ?? null;
	return {
		merchantId: merchant,
		loginCaptcha: captcha === null ? null : Number(captcha)
	};
}
function captchaBlocksLogin(value) {
	return value === 1 || value === 3;
}
var profileCache = /* @__PURE__ */ new Map();
var PROFILE_TTL_MS = 18e5;
async function readSiteHtml(response) {
	const reader = response.body?.getReader();
	if (!reader) {
		const found = readProfile((await response.text()).slice(0, 12e5));
		return found.merchantId ? {
			merchantId: found.merchantId,
			loginCaptcha: found.loginCaptcha
		} : null;
	}
	const decoder = new TextDecoder();
	let html = "";
	try {
		while (html.length < 12e5) {
			const { done, value } = await reader.read();
			if (done) break;
			html += decoder.decode(value, { stream: true });
			const found = readProfile(html);
			if (found.merchantId && found.loginCaptcha !== null) return {
				merchantId: found.merchantId,
				loginCaptcha: found.loginCaptcha
			};
		}
	} finally {
		await reader.cancel().catch(() => void 0);
	}
	const found = readProfile(html);
	return found.merchantId ? {
		merchantId: found.merchantId,
		loginCaptcha: found.loginCaptcha
	} : null;
}
async function siteProfile(host) {
	const cached = profileCache.get(host);
	if (cached && cached.expires > Date.now()) return cached.profile;
	if (cached) profileCache.delete(host);
	let url = `https://${host}/`;
	let response = null;
	for (let hop = 0; hop < 2; hop++) {
		response = await fetch(url, {
			method: "GET",
			redirect: "manual",
			signal: AbortSignal.timeout(12e3),
			headers: {
				Accept: "text/html",
				"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
			}
		});
		if (response.status < 300 || response.status >= 400) break;
		if (hop === 1) throw new Error("This host redirected before publishing a merchant ID");
		const location = response.headers.get("location");
		if (!location) throw new Error("This host redirected before publishing a merchant ID");
		const next = new URL(location, url);
		if (next.protocol !== "https:") throw new Error("Merchant page redirected off HTTPS");
		if (next.port && next.port !== "443") throw new Error("Merchant page redirected to a blocked port");
		const nextHost = next.hostname.replace(/\.$/, "").toLowerCase();
		if (!sameSite(host, nextHost)) throw new Error("Merchant page redirected to a different site");
		await assertPublicHost(nextHost);
		url = next.toString();
		response = null;
	}
	if (!response) throw new Error("This site did not publish a merchant ID");
	const profile = await readSiteHtml(response);
	if (!profile) throw new Error("This site did not publish a merchant ID");
	profileCache.set(host, {
		profile,
		expires: Date.now() + PROFILE_TTL_MS
	});
	return profile;
}
async function assertPublicHost(host) {
	const parsed = parseProbeLine(host);
	if (!parsed || !parsed.ok || parsed.host !== host) throw new Error("Host is not allowed");
	const { lookup } = await import("node:dns/promises");
	const { address } = await lookup(host, { verbatim: true });
	if (address.includes(":") || isPrivateIpv4Address(address) || address === "0.0.0.0") throw new Error("Host resolves to a blocked address");
}
var prepareHost_createServerFn_handler = createServerRpc({
	id: "0ea1f44a58ac3a5e3733ada03592101954df1256731f527f5abfc4865c6b224e",
	name: "prepareHost",
	filename: "src/lib/probe.functions.ts"
}, (opts) => prepareHost.__executeServer(opts));
var prepareHost = createServerFn({ method: "POST" }).validator((value) => inputSchema.parse(value)).handler(prepareHost_createServerFn_handler, async ({ data }) => {
	const host = data.host.trim().toLowerCase();
	const base = {
		host,
		endpoint: `https://${host}/api/v1/index.php`,
		merchantId: data.merchantId,
		skip: null
	};
	try {
		await assertPublicHost(host);
	} catch (error) {
		return {
			...base,
			skip: {
				verdict: "blocked",
				message: error instanceof Error ? error.message : "Host is not allowed"
			}
		};
	}
	let merchantId = data.merchantId;
	let loginCaptcha = null;
	try {
		const profile = await siteProfile(host);
		loginCaptcha = profile.loginCaptcha;
		merchantId = merchantId ?? profile.merchantId;
	} catch (error) {
		if (!merchantId) return {
			...base,
			skip: {
				verdict: "unclear",
				message: error instanceof Error ? error.message : "Could not read a merchant ID"
			}
		};
	}
	if (captchaBlocksLogin(loginCaptcha)) return {
		...base,
		merchantId,
		skip: {
			verdict: "captcha",
			message: "Skipped. This site asks for a captcha before login, so no attempt was sent."
		}
	};
	if (!merchantId) return {
		...base,
		skip: {
			verdict: "unclear",
			message: "Could not read a merchant ID. No attempt was sent."
		}
	};
	return {
		...base,
		merchantId,
		skip: null
	};
});
//#endregion
export { prepareHost_createServerFn_handler };
