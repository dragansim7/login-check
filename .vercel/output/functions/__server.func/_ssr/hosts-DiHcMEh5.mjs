//#region node_modules/.nitro/vite/services/ssr/assets/hosts-DiHcMEh5.js
var BLOCKED_NAMES = /* @__PURE__ */ new Set([
	"localhost",
	"localhost.localdomain",
	"metadata.google.internal",
	"metadata.google"
]);
function isPrivateIpv4(ip) {
	const parts = ip.split(".").map((n) => Number(n));
	if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
	const [a, b] = parts;
	if (a === 0 || a === 10 || a === 127) return true;
	if (a === 169 && b === 254) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	if (a === 192 && b === 168) return true;
	if (a === 100 && b >= 64 && b <= 127) return true;
	return false;
}
function looksLikeIpv4(host) {
	return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}
function isPublicHostname(host) {
	if (BLOCKED_NAMES.has(host)) return false;
	if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) return false;
	if (host.includes(":")) return false;
	if (looksLikeIpv4(host)) return !isPrivateIpv4(host);
	return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(host);
}
/** Turn `9au.com`, `9au.com/RF123`, or `9au.com 10520` into a host plus optional merchant ID. */
function parseProbeLine(raw) {
	const original = raw.trim();
	if (!original || original.startsWith("#")) return null;
	const split = original.match(/^(.*?)(?:[\s,|]+)(\d{3,8})$/);
	const target = (split?.[1] ?? original).trim();
	const merchantId = split?.[2] ?? null;
	if (!target) return {
		ok: false,
		input: original,
		reason: "Not a valid host"
	};
	const withScheme = /^https?:\/\//i.test(target) ? target : `https://${target}`;
	let url;
	try {
		url = new URL(withScheme);
	} catch {
		return {
			ok: false,
			input: original,
			reason: "Not a valid host"
		};
	}
	if (url.username || url.password) return {
		ok: false,
		input: original,
		reason: "Put the login in the fields above, not the URL"
	};
	if (url.port && url.port !== "443" && url.port !== "80") return {
		ok: false,
		input: original,
		reason: "Only ports 80 and 443 are allowed"
	};
	const host = url.hostname.replace(/\.$/, "").toLowerCase();
	if (!isPublicHostname(host)) return {
		ok: false,
		input: original,
		reason: "That host is not allowed"
	};
	return {
		ok: true,
		host,
		merchantId,
		input: original
	};
}
function parseProbeList(text) {
	const targets = [];
	const rejected = [];
	const seen = /* @__PURE__ */ new Set();
	for (const line of text.split(/\r?\n/)) {
		const parsed = parseProbeLine(line);
		if (!parsed) continue;
		if (!parsed.ok) {
			rejected.push(parsed);
			continue;
		}
		if (seen.has(parsed.host)) continue;
		seen.add(parsed.host);
		targets.push({
			host: parsed.host,
			merchantId: parsed.merchantId
		});
	}
	return {
		targets,
		rejected
	};
}
function isPrivateIpv4Address(ip) {
	return looksLikeIpv4(ip) && isPrivateIpv4(ip);
}
//#endregion
export { parseProbeLine as n, parseProbeList as r, isPrivateIpv4Address as t };
