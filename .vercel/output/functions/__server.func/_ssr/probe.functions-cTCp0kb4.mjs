import { n as TSS_SERVER_FUNCTION, t as createServerFn } from "./ssr.mjs";
import { n as parseProbeLine, t as isPrivateIpv4Address } from "./hosts-DiHcMEh5.mjs";
import { i as string, r as object } from "../_libs/zod.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/probe.functions-cTCp0kb4.js
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
	mobile: string().min(1).max(120),
	password: string().min(1).max(200),
	merchantId: string().regex(/^\d{3,8}$/).nullable()
});
function explainLogin(message) {
	const text = message.trim();
	if (/invalid password/i.test(text)) return {
		verdict: "password",
		message: "Password must be 6–20 characters. The site did not look up the account."
	};
	if (/invalid captcha/i.test(text)) return {
		verdict: "captcha",
		message: "Captcha required. This site did not check the password."
	};
	const code = text.match(/invalid login\.\s*(\d+)/i);
	if (code?.[1] === "7") return {
		verdict: "no-account",
		message: "No account on this merchant."
	};
	if (code?.[1] === "8") return {
		verdict: "refused",
		message: "Account found, but the login was refused. Wrong password, or this server IP is blocked."
	};
	return null;
}
function classify(status, text) {
	const trimmed = text.trim();
	let json = null;
	try {
		json = JSON.parse(trimmed);
	} catch {
		json = null;
	}
	if (json && typeof json === "object") {
		const record = json;
		const data = record.data && typeof record.data === "object" ? record.data : null;
		const statusText = String(record.status ?? "").toUpperCase();
		const message = String(data?.message ?? record.message ?? record.msg ?? "");
		const explained = explainLogin(message);
		if (explained) return explained;
		const token = data?.accessToken ?? data?.token ?? record.accessToken ?? record.token;
		if (typeof token === "string" && token.length > 8) return {
			verdict: "accepted",
			message: message || "Login accepted — token returned"
		};
		if (statusText === "SUCCESS" || statusText === "OK" || record.success === true) return {
			verdict: "accepted",
			message: message || "Login accepted"
		};
		if (statusText === "ERROR" || statusText === "FAIL" || record.success === false) return {
			verdict: "rejected",
			message: message || "Login rejected"
		};
		if (message) return {
			verdict: "unclear",
			message
		};
	}
	const plain = explainLogin(trimmed);
	if (plain) return plain;
	if (trimmed.startsWith("<") || trimmed.startsWith("<!")) return {
		verdict: "unclear",
		message: "HTML came back instead of the login API"
	};
	if (status >= 400) return {
		verdict: "rejected",
		message: `HTTP ${status}`
	};
	return {
		verdict: "unclear",
		message: trimmed ? "Unexpected response" : `HTTP ${status} with an empty body`
	};
}
function readMerchantId(html) {
	return (html.match(/\bMERCHANTID\s*=\s*["']?(\d{3,8})\b/i) ?? html.match(/\bMERCHANT_ID\s*=\s*["']?(\d{3,8})\b/i))?.[1] ?? null;
}
var merchantCache = /* @__PURE__ */ new Map();
var MERCHANT_TTL_MS = 18e5;
function sameSite(from, to) {
	return to === from || to === `www.${from}` || from === `www.${to}`;
}
async function htmlUntilMerchant(response) {
	const reader = response.body?.getReader();
	if (!reader) return readMerchantId((await response.text()).slice(0, 12e5));
	const decoder = new TextDecoder();
	let html = "";
	try {
		while (html.length < 12e5) {
			const { done, value } = await reader.read();
			if (done) break;
			html += decoder.decode(value, { stream: true });
			const id = readMerchantId(html);
			if (id) return id;
		}
	} finally {
		await reader.cancel().catch(() => void 0);
	}
	return readMerchantId(html);
}
async function merchantIdFor(host) {
	const cached = merchantCache.get(host);
	if (cached && cached.expires > Date.now()) return cached.id;
	if (cached) merchantCache.delete(host);
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
	const id = await htmlUntilMerchant(response);
	if (!id) throw new Error("This site did not publish a merchant ID");
	merchantCache.set(host, {
		id,
		expires: Date.now() + MERCHANT_TTL_MS
	});
	return id;
}
async function assertPublicHost(host) {
	const parsed = parseProbeLine(host);
	if (!parsed || !parsed.ok || parsed.host !== host) throw new Error("Host is not allowed");
	const { lookup } = await import("node:dns/promises");
	const { address } = await lookup(host, { verbatim: true });
	if (address.includes(":") || isPrivateIpv4Address(address) || address === "0.0.0.0") throw new Error("Host resolves to a blocked address");
}
var probeLogin_createServerFn_handler = createServerRpc({
	id: "879e8689f5e1e7bdb848f4d51cc342876bb20a0beed0746fbdc79c6291ebac07",
	name: "probeLogin",
	filename: "src/lib/probe.functions.ts"
}, (opts) => probeLogin.__executeServer(opts));
var probeLogin = createServerFn({ method: "POST" }).validator((value) => inputSchema.parse(value)).handler(probeLogin_createServerFn_handler, async ({ data }) => {
	const started = Date.now();
	const host = data.host.trim().toLowerCase();
	const endpoint = `https://${host}/api/v1/index.php`;
	const base = {
		host,
		endpoint,
		verdict: "blocked",
		httpStatus: null,
		message: "",
		snippet: "",
		merchantId: data.merchantId,
		ms: 0
	};
	try {
		await assertPublicHost(host);
	} catch (error) {
		return {
			...base,
			verdict: "blocked",
			message: error instanceof Error ? error.message : "Host is not allowed",
			ms: Date.now() - started
		};
	}
	if (data.password.length < 6 || data.password.length > 20) return {
		...base,
		verdict: "password",
		message: "Password must be 6–20 characters. No host was contacted.",
		ms: Date.now() - started
	};
	let merchantId = data.merchantId;
	if (!merchantId) try {
		merchantId = await merchantIdFor(host);
	} catch (error) {
		return {
			...base,
			verdict: "unclear",
			message: error instanceof Error ? error.message : "Could not read a merchant ID",
			ms: Date.now() - started
		};
	}
	const body = new URLSearchParams({
		mobile: data.mobile,
		password: data.password,
		module: "/users/login",
		merchantId,
		accessId: "",
		accessToken: "",
		walletIsAdmin: ""
	});
	try {
		const response = await fetch(endpoint, {
			method: "POST",
			redirect: "manual",
			signal: AbortSignal.timeout(12e3),
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Accept: "application/json, text/plain, */*",
				Origin: `https://${host}`,
				Referer: `https://${host}/`,
				"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
			},
			body
		});
		if (response.status >= 300 && response.status < 400) return {
			...base,
			verdict: "unclear",
			httpStatus: response.status,
			message: "The host redirected instead of answering the login API",
			ms: Date.now() - started
		};
		const text = (await response.text()).slice(0, 600);
		const judged = classify(response.status, text);
		return {
			...base,
			verdict: judged.verdict,
			httpStatus: response.status,
			message: judged.message.slice(0, 240),
			snippet: text.replace(/\s+/g, " ").slice(0, 280),
			merchantId,
			ms: Date.now() - started
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : "Request failed";
		return {
			...base,
			verdict: "unreachable",
			message: message.slice(0, 240),
			ms: Date.now() - started
		};
	}
});
//#endregion
export { probeLogin_createServerFn_handler };
