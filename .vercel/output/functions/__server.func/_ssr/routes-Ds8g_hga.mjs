import { i as __toESM } from "../_runtime.mjs";
import { U as isRedirect, b as require_jsx_runtime, q as require_react, y as useRouter } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as TSS_SERVER_FUNCTION, r as getServerFnById, t as createServerFn } from "./ssr.mjs";
import { r as parseProbeList } from "./hosts-DiHcMEh5.mjs";
import { i as string, r as object } from "../_libs/zod.mjs";
import { a as Eye, i as Radar, n as Trash2, o as EyeOff, r as Square } from "../_libs/lucide-react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-Ds8g_hga.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function useServerFn(serverFn) {
	const router = useRouter();
	return import_react.useCallback(async (...args) => {
		try {
			const res = await serverFn(...args);
			if (isRedirect(res)) throw res;
			return res;
		} catch (err) {
			if (isRedirect(err)) {
				err.options._fromLocation = router.stores.location.get();
				return router.navigate(router.resolveRedirect(err).options);
			}
			throw err;
		}
	}, [router, serverFn]);
}
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
		message: "Account found, but the login was refused. Wrong password, or this connection is blocked."
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
function shouldStopRun(message) {
	return /too many|rate limit|try again later|too frequent|account locked|please wait|temporarily locked/i.test(message);
}
var createSsrRpc = (functionId) => {
	const url = "/_serverFn/" + functionId;
	const serverFnMeta = { id: functionId };
	const fn = async (...args) => {
		return (await getServerFnById(functionId, { origin: "server" }))(...args);
	};
	return Object.assign(fn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var inputSchema = object({
	host: string().min(1).max(253),
	merchantId: string().regex(/^\d{3,8}$/).nullable()
});
var prepareHost = createServerFn({ method: "POST" }).validator((value) => inputSchema.parse(value)).handler(createSsrRpc("0ea1f44a58ac3a5e3733ada03592101954df1256731f527f5abfc4865c6b224e"));
var SAMPLE = "9au.com\n9au.com/RF12345667";
var VERDICT_LABEL = {
	accepted: "Accepted",
	"no-account": "No account",
	refused: "Refused",
	password: "Length",
	captcha: "Captcha",
	rejected: "Rejected",
	unclear: "Unclear",
	unreachable: "Unreachable",
	blocked: "Blocked"
};
function verdictClass(verdict) {
	if (verdict === "accepted") return "bg-accent text-accent-ink";
	if (verdict === "captcha" || verdict === "refused") return "bg-warn/15 text-warn";
	if (verdict === "rejected" || verdict === "blocked" || verdict === "no-account" || verdict === "password") return "bg-danger/15 text-danger";
	return "bg-raised text-muted";
}
function Fact({ label, value }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: "inline-flex min-w-0 items-center gap-2 rounded-md border border-line bg-bg px-2.5 py-1",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-[10px] tracking-wider text-muted uppercase",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "truncate font-mono text-xs text-fg",
			children: value
		})]
	});
}
function Home() {
	const prepare = useServerFn(prepareHost);
	const [mobile, setMobile] = (0, import_react.useState)("");
	const [password, setPassword] = (0, import_react.useState)("");
	const [showPassword, setShowPassword] = (0, import_react.useState)(false);
	const [domains, setDomains] = (0, import_react.useState)(SAMPLE);
	const [results, setResults] = (0, import_react.useState)([]);
	const [running, setRunning] = (0, import_react.useState)(false);
	const [current, setCurrent] = (0, import_react.useState)(null);
	const [stoppedEarly, setStoppedEarly] = (0, import_react.useState)(false);
	const stopRef = (0, import_react.useRef)(false);
	const passwordReady = password.length >= 6 && password.length <= 20;
	const parsed = (0, import_react.useMemo)(() => parseProbeList(domains), [domains]);
	async function onRun() {
		if (!mobile.trim() || !passwordReady || parsed.targets.length === 0) return;
		stopRef.current = false;
		setStoppedEarly(false);
		setRunning(true);
		setResults([]);
		let nextLoginAt = 0;
		for (const target of parsed.targets) {
			if (stopRef.current) break;
			setCurrent(target.host);
			const started = Date.now();
			try {
				const prep = await prepare({ data: {
					host: target.host,
					merchantId: target.merchantId
				} });
				if (prep.skip || !prep.merchantId) {
					setResults((prev) => [...prev, {
						host: prep.host,
						endpoint: prep.endpoint,
						verdict: prep.skip?.verdict ?? "unclear",
						httpStatus: null,
						message: prep.skip?.message ?? "Could not read a merchant ID. No attempt was sent.",
						snippet: "",
						merchantId: prep.merchantId,
						stop: false,
						ms: Date.now() - started
					}]);
					continue;
				}
				const wait = Math.max(0, nextLoginAt - Date.now());
				if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
				if (stopRef.current) break;
				nextLoginAt = Date.now() + 2e3;
				const response = await fetch(prep.endpoint, {
					method: "POST",
					signal: AbortSignal.timeout(12e3),
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
						Accept: "application/json, text/plain, */*"
					},
					body: new URLSearchParams({
						mobile: mobile.trim(),
						password,
						module: "/users/login",
						merchantId: prep.merchantId,
						accessId: "",
						accessToken: "",
						walletIsAdmin: ""
					})
				});
				const text = (await response.text()).slice(0, 600);
				const judged = classify(response.status, text);
				const postedCaptcha = judged.verdict === "captcha";
				const stop = postedCaptcha || shouldStopRun(judged.message);
				setResults((prev) => [...prev, {
					host: prep.host,
					endpoint: prep.endpoint,
					verdict: judged.verdict,
					httpStatus: response.status,
					message: (postedCaptcha ? "Captcha required. The rest of this run was stopped so it does not add more attempts." : stop ? `${judged.message} The rest of this run was stopped.` : judged.message).slice(0, 240),
					snippet: text.replace(/\s+/g, " ").slice(0, 280),
					merchantId: prep.merchantId,
					stop,
					ms: Date.now() - started
				}]);
				if (stop) {
					stopRef.current = true;
					setStoppedEarly(true);
					break;
				}
			} catch (error) {
				setResults((prev) => [...prev, {
					host: target.host,
					endpoint: `https://${target.host}/api/v1/index.php`,
					verdict: "unreachable",
					httpStatus: null,
					message: error instanceof Error ? error.message : "Request failed",
					snippet: "",
					merchantId: target.merchantId,
					stop: false,
					ms: Date.now() - started
				}]);
			}
		}
		setCurrent(null);
		setRunning(false);
	}
	function onStop() {
		stopRef.current = true;
	}
	const counts = results.reduce((acc, row) => {
		acc[row.verdict] += 1;
		return acc;
	}, {
		accepted: 0,
		"no-account": 0,
		refused: 0,
		password: 0,
		captcha: 0,
		rejected: 0,
		unclear: 0,
		unreachable: 0,
		blocked: 0
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "flex items-start gap-4 border-b border-line pb-6",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "mt-1 flex size-11 shrink-0 items-center justify-center rounded-xl bg-raised text-accent",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Radar, {
						className: "size-5",
						"aria-hidden": "true"
					})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "font-mono text-xs tracking-widest text-accent uppercase",
						children: "Login API"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "mt-1 text-2xl font-semibold tracking-tight sm:text-3xl",
						children: "Mirror Login Probe"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-2 max-w-2xl text-sm leading-relaxed text-muted",
						children: [
							"Paste hosts one per line. A path such as ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono text-fg",
								children: "/RF12345667"
							}),
							" ",
							"is ignored. Each host uses its own merchant ID. The login is sent from this phone or computer, so the site sees that connection. Captcha sites are skipped."
						]
					})
				] })]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "grid gap-4 lg:grid-cols-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					className: "flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 shadow-[inset_0_1px_0_0_color-mix(in_srgb,var(--color-accent)_35%,transparent)]",
					onSubmit: (event) => {
						event.preventDefault();
						onRun();
					},
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "flex flex-col gap-1.5 text-sm",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-muted",
								children: "Mobile or username"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								value: mobile,
								onChange: (event) => setMobile(event.target.value),
								autoComplete: "username",
								className: "h-11 rounded-lg border border-line bg-bg px-3 font-mono text-sm text-fg outline-none focus:border-accent",
								placeholder: "61480050689"
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "flex flex-col gap-1.5 text-sm",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-muted",
									children: "Password"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "flex gap-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										value: password,
										onChange: (event) => setPassword(event.target.value),
										type: showPassword ? "text" : "password",
										autoComplete: "current-password",
										className: "h-11 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 font-mono text-sm text-fg outline-none focus:border-accent"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => setShowPassword((value) => !value),
										className: "flex size-11 items-center justify-center rounded-lg border border-line bg-raised text-muted",
										"aria-label": showPassword ? "Hide password" : "Show password",
										children: showPassword ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EyeOff, { className: "size-4" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Eye, { className: "size-4" })
									})]
								}),
								password.length > 0 && !passwordReady ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-xs text-danger",
									children: "Use 6–20 characters. Anything else never reaches the account."
								}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-xs text-muted",
									children: "6–20 characters."
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-auto flex gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "submit",
								disabled: running || !mobile.trim() || !passwordReady || parsed.targets.length === 0,
								className: "h-11 flex-1 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink disabled:opacity-40",
								children: running ? `Checking ${current ?? "…"}` : `Check ${parsed.targets.length || ""} host${parsed.targets.length === 1 ? "" : "s"}`
							}), running ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								onClick: onStop,
								className: "flex h-11 items-center gap-2 rounded-lg border border-line px-4 text-sm text-fg",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Square, { className: "size-3.5" }), "Stop"]
							}) : null]
						})
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex min-h-72 flex-col rounded-2xl border border-line bg-surface p-4 shadow-[inset_0_1px_0_0_color-mix(in_srgb,var(--color-accent)_35%,transparent)]",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mb-2 flex items-center justify-between gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
								htmlFor: "domains",
								className: "text-sm text-muted",
								children: "Hosts"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								onClick: () => setDomains(""),
								className: "flex items-center gap-1 text-xs text-muted",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "size-3.5" }), "Clear"]
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
							id: "domains",
							value: domains,
							onChange: (event) => setDomains(event.target.value),
							spellCheck: false,
							className: "min-h-48 flex-1 resize-y rounded-lg border border-line bg-bg p-3 font-mono text-sm leading-relaxed text-fg outline-none focus:border-accent",
							placeholder: "9au.com\nothersite.com 60813"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-2 text-xs text-muted",
							children: [
								parsed.targets.length,
								" unique host",
								parsed.targets.length === 1 ? "" : "s",
								parsed.rejected.length > 0 ? ` · ${parsed.rejected.length} skipped` : ""
							]
						}),
						parsed.targets.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "mt-2 flex flex-wrap gap-1.5",
							children: parsed.targets.map((target) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: "rounded-md bg-raised px-2 py-1 font-mono text-xs text-fg",
								children: [target.host, target.merchantId ? ` · ${target.merchantId}` : ""]
							}, target.host))
						}) : null
					]
				})]
			}),
			parsed.rejected.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "flex flex-col gap-1 text-xs text-danger",
				children: parsed.rejected.map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "font-mono",
						children: row.input
					}),
					" — ",
					row.reason
				] }, row.input))
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "flex flex-col gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap items-end justify-between gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "text-lg font-semibold",
						children: "Results"
					}), results.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
						className: "flex flex-wrap gap-1.5",
						children: [[
							[counts.accepted, "accepted"],
							[counts["no-account"], "no account"],
							[counts.refused, "refused"],
							[counts.captcha, "captcha"],
							[counts.password + counts.rejected + counts.unclear + counts.unreachable + counts.blocked, "other"]
						].filter(([count]) => count > 0).map(([count, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "rounded-md border border-line bg-surface px-2 py-1 font-mono text-xs text-muted",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-fg",
									children: count
								}),
								" ",
								label
							]
						}, label)), stoppedEarly ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
							className: "rounded-md border border-warn/40 bg-warn/10 px-2 py-1 text-xs text-warn",
							children: "Stopped early"
						}) : null]
					}) : null]
				}), results.length === 0 && !running ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted",
					children: "Results show up here, one host at a time."
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "flex flex-col gap-3",
					children: results.map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "overflow-hidden rounded-2xl border border-line bg-surface",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-start justify-between gap-3 px-4 pt-4",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "min-w-0",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "truncate font-mono text-sm text-fg",
										children: row.host
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-1 text-sm leading-relaxed text-fg",
										children: row.message
									})]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: `shrink-0 rounded-md px-2 py-1 text-xs font-medium ${verdictClass(row.verdict)}`,
									children: VERDICT_LABEL[row.verdict]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-3 flex flex-wrap gap-1.5 px-4",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Fact, {
										label: "Merchant",
										value: row.merchantId ?? "—"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Fact, {
										label: "Status",
										value: row.httpStatus === null ? "—" : String(row.httpStatus)
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Fact, {
										label: "Time",
										value: `${row.ms} ms`
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-3 px-4 font-mono text-[11px] break-all text-muted",
								children: row.endpoint
							}),
							row.snippet ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", {
								className: "mx-4 mt-3 mb-4 overflow-x-auto rounded-lg border border-line bg-bg px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-muted",
								children: row.snippet
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-4" })
						]
					}, row.host))
				})]
			})
		]
	});
}
//#endregion
export { Home as component };
