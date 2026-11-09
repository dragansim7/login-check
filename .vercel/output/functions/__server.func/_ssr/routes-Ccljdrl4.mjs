import { i as __toESM } from "../_runtime.mjs";
import { U as isRedirect, b as require_jsx_runtime, q as require_react, y as useRouter } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as TSS_SERVER_FUNCTION, r as getServerFnById, t as createServerFn } from "./ssr.mjs";
import { r as parseProbeList } from "./hosts-DiHcMEh5.mjs";
import { i as string, r as object } from "../_libs/zod.mjs";
import { a as Eye, i as Radar, n as Trash2, o as EyeOff, r as Square } from "../_libs/lucide-react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-Ccljdrl4.js
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
	mobile: string().min(1).max(120),
	password: string().min(1).max(200),
	merchantId: string().regex(/^\d{3,8}$/).nullable()
});
var probeLogin = createServerFn({ method: "POST" }).validator((value) => inputSchema.parse(value)).handler(createSsrRpc("879e8689f5e1e7bdb848f4d51cc342876bb20a0beed0746fbdc79c6291ebac07"));
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
	if (verdict === "captcha") return "bg-warn/15 text-warn";
	if (verdict === "refused") return "bg-warn/15 text-warn";
	if (verdict === "rejected" || verdict === "blocked" || verdict === "no-account" || verdict === "password") return "bg-danger/15 text-danger";
	return "bg-raised text-muted";
}
function Home() {
	const runProbe = useServerFn(probeLogin);
	const [mobile, setMobile] = (0, import_react.useState)("");
	const [password, setPassword] = (0, import_react.useState)("");
	const [showPassword, setShowPassword] = (0, import_react.useState)(false);
	const [domains, setDomains] = (0, import_react.useState)(SAMPLE);
	const [results, setResults] = (0, import_react.useState)([]);
	const [running, setRunning] = (0, import_react.useState)(false);
	const [current, setCurrent] = (0, import_react.useState)(null);
	const stopRef = (0, import_react.useRef)(false);
	const passwordReady = password.length >= 6 && password.length <= 20;
	const parsed = (0, import_react.useMemo)(() => parseProbeList(domains), [domains]);
	async function onRun() {
		if (!mobile.trim() || !passwordReady || parsed.targets.length === 0) return;
		stopRef.current = false;
		setRunning(true);
		setResults([]);
		const queue = [...parsed.targets];
		const active = /* @__PURE__ */ new Set();
		async function worker() {
			while (!stopRef.current) {
				const target = queue.shift();
				if (!target) return;
				active.add(target.host);
				setCurrent(active.size === 1 ? "1 host" : `${active.size} hosts`);
				try {
					const result = await runProbe({ data: {
						host: target.host,
						mobile: mobile.trim(),
						password,
						merchantId: target.merchantId
					} });
					setResults((prev) => [...prev, result]);
				} catch (error) {
					setResults((prev) => [...prev, {
						host: target.host,
						endpoint: `https://${target.host}/api/v1/index.php`,
						verdict: "unreachable",
						httpStatus: null,
						message: error instanceof Error ? error.message : "Request failed",
						snippet: "",
						merchantId: target.merchantId,
						ms: 0
					}]);
				} finally {
					active.delete(target.host);
					setCurrent(active.size === 0 ? null : active.size === 1 ? "1 host" : `${active.size} hosts`);
				}
			}
		}
		await Promise.all(Array.from({ length: Math.min(3, queue.length) }, () => worker()));
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
							"is ignored. Each host is checked with its own merchant ID, read from that site. Add ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono text-fg",
								children: "10520"
							}),
							" after a host only if you need to override it.",
							" ",
							"Every check uses ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono text-fg",
								children: "POST /api/v1/index.php"
							}),
							". Nothing is saved."
						]
					})
				] })]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "grid gap-4 lg:grid-cols-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					className: "flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4",
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
					className: "flex min-h-72 flex-col rounded-2xl border border-line bg-surface p-4",
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
					}), results.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "font-mono text-xs text-muted",
						children: [
							counts.accepted,
							" accepted · ",
							counts["no-account"],
							" no account · ",
							counts.refused,
							" refused ·",
							" ",
							counts.captcha,
							" captcha · ",
							counts.password + counts.rejected + counts.unclear + counts.unreachable + counts.blocked,
							" other"
						]
					}) : null]
				}), results.length === 0 && !running ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted",
					children: "Results show up here, up to three hosts at a time."
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "flex flex-col gap-2",
					children: results.map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "rounded-2xl border border-line bg-surface p-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-wrap items-center gap-2",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: `rounded-md px-2 py-1 text-xs font-medium ${verdictClass(row.verdict)}`,
										children: VERDICT_LABEL[row.verdict]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "font-mono text-sm text-fg",
										children: row.host
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "ml-auto font-mono text-xs text-muted",
										children: [
											row.merchantId ? `merchant ${row.merchantId} · ` : "",
											row.httpStatus ?? "—",
											" · ",
											row.ms,
											" ms"
										]
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-2 text-sm text-fg",
								children: row.message
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 font-mono text-xs break-all text-muted",
								children: row.endpoint
							}),
							row.snippet ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-2 font-mono text-xs leading-relaxed break-all text-muted",
								children: row.snippet
							}) : null
						]
					}, row.host))
				})]
			})
		]
	});
}
//#endregion
export { Home as component };
