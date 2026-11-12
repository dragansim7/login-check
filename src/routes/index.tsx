import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, Globe, MapPin, Radar, RefreshCw, Square, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { classify, redactSecrets, shouldStopRun, type ProbeResult, type ProbeVerdict } from "@/lib/classify";
import { parseProbeList } from "@/lib/hosts";
import { captchaRequired, readMerchantProfile } from "@/lib/merchant";
import { prepareHost, type HostPrep } from "@/lib/probe.functions";

export const Route = createFileRoute("/")({ component: Home });

const SAMPLE = "9au.com\n9au.com/RF12345667";
const HOSTS_KEY = "mirror-probe-hosts";
const CAPTCHA_SCENE = "dz5ch7sdh";
const CAPTCHA_PREFIX = "16dibs8";

const VERDICT_LABEL: Record<ProbeVerdict, string> = {
  accepted: "Accepted",
  "no-account": "No account",
  refused: "Refused",
  password: "Length",
  captcha: "Captcha",
  rejected: "Rejected",
  unclear: "Unclear",
  unreachable: "Unreachable",
  blocked: "Blocked",
};

function verdictClass(verdict: ProbeVerdict): string {
  if (verdict === "accepted") return "bg-accent text-accent-ink";
  if (verdict === "captcha" || verdict === "refused") return "bg-warn/15 text-warn";
  if (verdict === "rejected" || verdict === "blocked" || verdict === "no-account" || verdict === "password") {
    return "bg-danger/15 text-danger";
  }
  return "bg-raised text-muted";
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 rounded-md border border-line bg-bg px-2.5 py-1">
      <span className="text-[10px] tracking-wider text-muted uppercase">{label}</span>
      <span className="truncate font-mono text-xs text-fg">{value}</span>
    </span>
  );
}

type OutgoingIp = {
  ip: string;
  isp: string | null;
  asn: string | null;
  place: string | null;
  ms: number;
};

function browserMask(): string {
  if (typeof navigator === "undefined") return "This device";
  const ua = navigator.userAgent;
  let browser = "Browser";
  let version = "";
  const edge = ua.match(/Edg\/(\d+\.\d+)/);
  const chrome = ua.match(/Chrome\/(\d+\.\d+)/);
  const firefox = ua.match(/Firefox\/(\d+\.\d+)/);
  const safari = ua.match(/Version\/(\d+\.\d+)/);
  if (edge) {
    browser = "Edge";
    version = edge[1];
  } else if (chrome) {
    browser = "Chrome";
    version = chrome[1];
  } else if (firefox) {
    browser = "Firefox";
    version = firefox[1];
  } else if (safari && /Safari\//.test(ua)) {
    browser = "Safari";
    version = safari[1];
  }
  let os = "this device";
  if (/Android/.test(ua)) os = "Android";
  else if (/iPhone|iPad/.test(ua)) os = "iOS";
  else if (/Windows NT 10/.test(ua)) os = "Win10";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Linux/.test(ua)) os = "Linux";
  const arch = /aarch64|arm64|ARM/.test(ua) ? "arm64" : /x64|Win64|x86_64|WOW64/.test(ua) ? "x64" : "";
  return [browser, version].filter(Boolean).join(" ") + ` · ${os}${arch ? ` ${arch}` : ""}`;
}

function asnText(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return `AS${value}`;
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  return raw.startsWith("AS") ? raw : `AS${raw}`;
}

function splitOrg(org: string | null): { isp: string | null; asn: string | null } {
  if (!org) return { isp: null, asn: null };
  const match = org.match(/^(AS\d+)\s+(.+)$/);
  if (!match) return { isp: org, asn: null };
  return { asn: match[1], isp: match[2] };
}

async function readOutgoingIp(): Promise<OutgoingIp> {
  const sources = [fromGeoJs, fromIpSb, fromIpInfo, fromIpify];
  let lastError: unknown;
  for (const source of sources) {
    const started = performance.now();
    try {
      const value = await source();
      return { ...value, ms: Math.max(1, Math.round(performance.now() - started)) };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("no ip");
}

async function readJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(String(response.status));
  const data = (await response.json()) as unknown;
  if (!data || typeof data !== "object") throw new Error("shape");
  return data as Record<string, unknown>;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asIp(
  data: Record<string, unknown>,
  isp: string | null,
  asn: string | null,
  city: string | null,
  region: string | null,
  country: string | null,
): OutgoingIp {
  const ip = text(data.ip);
  if (!ip) throw new Error("shape");
  const place = [city, region, country].filter(Boolean).join(", ");
  return { ip, isp, asn, place: place || null, ms: 0 };
}

async function fromGeoJs(): Promise<OutgoingIp> {
  const data = await readJson("https://get.geojs.io/v1/ip/geo.json");
  return asIp(
    data,
    text(data.organization_name) ?? text(data.organization),
    asnText(data.asn),
    text(data.city),
    text(data.region),
    text(data.country),
  );
}

async function fromIpSb(): Promise<OutgoingIp> {
  const data = await readJson("https://api.ip.sb/geoip");
  const org = splitOrg(text(data.organization) ?? text(data.isp));
  return asIp(data, org.isp, asnText(data.asn) ?? org.asn, text(data.city), text(data.region), text(data.country));
}

async function fromIpInfo(): Promise<OutgoingIp> {
  const data = await readJson("https://ipinfo.io/json");
  const org = splitOrg(text(data.org));
  return asIp(data, org.isp, org.asn, text(data.city), text(data.region), text(data.country));
}

async function fromIpify(): Promise<OutgoingIp> {
  const data = await readJson("https://api.ipify.org?format=json");
  return asIp(data, null, null, null, null, null);
}

function OutgoingIpCard({ cachedMerchants }: { cachedMerchants: number }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [info, setInfo] = useState<OutgoingIp | null>(null);
  const [tick, setTick] = useState(0);
  const [mask, setMask] = useState("This device");

  useEffect(() => {
    setMask(browserMask());
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    readOutgoingIp()
      .then((value) => {
        if (cancelled) return;
        setInfo(value);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const ispLine = [info?.isp, info?.asn].filter(Boolean).join(" · ");

  return (
    <section className="rounded-2xl border border-[#6a5428] bg-[#14110e] p-4 shadow-[inset_0_1px_0_0_rgba(224,160,74,0.18)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-accent uppercase">
          <Globe className="size-3.5 shrink-0" />
          Outgoing egress IP & mask
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-[#6a5428] px-2 py-1 font-mono text-[11px] text-muted">
            {status === "ready" && info ? `${info.ms} ms` : "—"}
          </span>
          <button
            type="button"
            onClick={() => setTick((value) => value + 1)}
            disabled={status === "loading"}
            className="text-accent disabled:opacity-40"
            aria-label="Refresh IP"
          >
            <RefreshCw className={`size-4 ${status === "loading" ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[#3a3128] bg-black/40 px-3 py-3">
        <div className="min-w-0">
          <p className="text-[10px] tracking-[0.16em] text-muted uppercase">Current egress IP</p>
          <p className="mt-1 truncate font-mono text-2xl font-semibold tracking-tight text-white">
            {status === "loading" ? "Detecting…" : status === "error" ? "Unavailable" : info?.ip}
          </p>
        </div>
        <span className={`size-2.5 shrink-0 rounded-full ${status === "ready" ? "bg-[#3dcc6a]" : "bg-muted"}`} />
      </div>
      <div className="mt-3 space-y-1.5 text-sm text-[#d7d0c6]">
        <p className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted">ISP</span>
          <span className="truncate">{status === "ready" ? ispLine || "Public address from this device" : "Looking up this connection"}</span>
        </p>
        <p className="flex items-center gap-2">
          <MapPin className="size-3.5 shrink-0 text-accent" />
          <span className="truncate">{status === "ready" ? info?.place || "Location unavailable" : "—"}</span>
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-md border border-[#6a5428] bg-black/30 px-2.5 py-1.5 font-mono text-[11px] text-[#f0e2c8]">
          Mask: {mask}
        </span>
        <span className="rounded-md border border-[#3a3128] bg-black/30 px-2.5 py-1.5 font-mono text-[11px] text-muted">
          {cachedMerchants} cached merchant ID{cachedMerchants === 1 ? "" : "s"}
        </span>
      </div>
    </section>
  );
}

function TelemetryCard({
  running,
  captchaHost,
  elapsedSec,
  done,
  total,
  activity,
  avgPing,
  speed,
  accepted,
  failed,
  dead,
  captcha,
}: {
  running: boolean;
  captchaHost: string | null;
  elapsedSec: number;
  done: number;
  total: number;
  activity: string[];
  avgPing: number | null;
  speed: string;
  accepted: number;
  failed: number;
  dead: number;
  captcha: number;
}) {
  const left = Math.max(0, total - done);
  const width = total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100));
  const status = captchaHost ? "CAPTCHA" : running ? "LIVE" : "STANDBY";
  const lanes = [0, 1, 2].map((index) => activity[index] ?? "");

  return (
    <section className="rounded-2xl border border-[#6a5428] bg-[#14110e] p-4 shadow-[inset_0_1px_0_0_rgba(224,160,74,0.18)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-accent uppercase">
          <Radar className="size-3.5 shrink-0" />
          Live worker telemetry
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-[#6a5428] px-2 py-1 text-[10px] font-semibold tracking-wider text-accent uppercase">
            {status}
          </span>
          <span className="font-mono text-sm text-fg">{elapsedSec.toFixed(1)}s</span>
        </div>
      </div>
      <div className="relative mt-3 h-1.5 rounded-full bg-black/50">
        <div className="h-full rounded-full bg-accent" style={{ width: `${width}%` }} />
        <span className="absolute top-1/2 size-2 -translate-y-1/2 rounded-full bg-accent" style={{ left: `calc(${width}% - 4px)` }} />
      </div>
      <dl className="mt-3 grid grid-cols-4 gap-2 font-mono text-[11px]">
        {[
          ["Done", total ? `${done}/${total}` : "0/0"],
          ["Queue", `${left} left`],
          ["Avg ping", avgPing === null ? "—" : `${avgPing} ms`],
          ["Speed", speed],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-[#3a3128] bg-black/30 px-2 py-2">
            <dt className="text-[10px] tracking-wider text-muted uppercase">{label}</dt>
            <dd className="mt-1 truncate text-fg">{value}</dd>
          </div>
        ))}
      </dl>
      <ul className="mt-3 flex flex-col gap-2">
        {lanes.map((tag, index) => {
          const host = tag.startsWith("login:") ? tag.slice(6) : tag.startsWith("read:") ? tag.slice(5) : "";
          const phase = captchaHost && host === captchaHost ? "CAPTCHA" : tag.startsWith("login:") ? "LOGIN" : host ? "READ" : "IDLE";
          return (
            <li key={index} className="flex items-center gap-2 rounded-lg border border-[#3a3128] bg-black/25 px-2.5 py-2 font-mono text-xs">
              <span className="text-muted">W{index + 1}</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] tracking-wide ${phase === "IDLE" ? "text-muted" : "bg-accent/15 text-accent"}`}>
                {phase}
              </span>
              <span className="truncate text-[#d7d0c6]">{host || "Waiting for host…"}</span>
            </li>
          );
        })}
      </ul>
      <dl className="mt-3 grid grid-cols-4 gap-2 font-mono text-[11px]">
        {[
          ["Login", accepted],
          ["Failed", failed],
          ["Dead", dead],
          ["Captcha", captcha],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border border-[#3a3128] px-2 py-2">
            <dt className="text-[10px] tracking-wider text-muted uppercase">{label}</dt>
            <dd className="mt-1 text-fg">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

type CaptchaAnswer = { captchaResult: boolean; bizResult: boolean };

type CaptchaPrompt = {
  host: string;
  verify: (token: string) => Promise<CaptchaAnswer>;
  onCancel: () => void;
};

type PostedLogin = {
  status: number | null;
  text: string;
  judged: { verdict: ProbeVerdict; message: string };
};

function CaptchaSheet({ prompt }: { prompt: CaptchaPrompt }) {
  const [error, setError] = useState<string | null>(null);
  const openedAtRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const win = window as Window & {
      AliyunCaptchaConfig?: { region: string; prefix: string };
      initAliyunCaptcha?: (options: Record<string, unknown>) => void;
    };

    async function open() {
      win.AliyunCaptchaConfig = { region: "sgp", prefix: CAPTCHA_PREFIX };
      if (!win.initAliyunCaptcha) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js";
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("The captcha puzzle could not be loaded."));
          document.head.appendChild(script);
        });
      }
      if (cancelled || !win.initAliyunCaptcha) return;
      win.initAliyunCaptcha({
        SceneId: CAPTCHA_SCENE,
        prefix: CAPTCHA_PREFIX,
        mode: "popup",
        region: "sgp",
        language: "en",
        element: "#mirror-captcha-element",
        button: "#mirror-captcha-trigger",
        captchaVerifyCallback: async (token: unknown) => {
          const value = typeof token === "string" ? token : "";
          const failover = /"failover"\s*:\s*"T"/.test(value);
          const tooSoon = Date.now() - openedAtRef.current < 800;
          if (!value || failover || openedAtRef.current === 0 || tooSoon) {
            if (!cancelled && failover) setError("The puzzle did not open. Try again, or cancel this host.");
            return { captchaResult: false, bizResult: false };
          }
          return prompt.verify(value);
        },
      });
    }

    open().catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "The captcha puzzle could not be loaded.");
    });
    return () => {
      cancelled = true;
    };
  }, [prompt]);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60 p-4 sm:items-center sm:justify-center">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3 rounded-2xl border border-accent/50 bg-surface p-4 shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
        <div>
          <p className="text-sm font-semibold">Captcha for {prompt.host}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            The run stays on this host. Open the puzzle, solve it, and only then is the login sent. Cancel skips only this host.
          </p>
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div id="mirror-captcha-element" />
        <button id="mirror-captcha-trigger" type="button" className="hidden" tabIndex={-1} aria-hidden="true" />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              openedAtRef.current = Date.now();
              document.getElementById("mirror-captcha-trigger")?.click();
            }}
            className="h-11 flex-1 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink"
          >
            Open puzzle
          </button>
          <button
            type="button"
            onClick={prompt.onCancel}
            className="h-11 rounded-lg border border-line px-4 text-sm text-fg"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

async function mapLimit<T>(items: T[], limit: number, task: (item: T, index: number) => Promise<void>) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await task(items[index], index);
    }
  }
  const workers = Math.min(limit, items.length);
  if (workers > 0) await Promise.all(Array.from({ length: workers }, () => worker()));
}

async function browserProfile(host: string) {
  const response = await fetch(`https://${host}/`, {
    method: "GET",
    signal: AbortSignal.timeout(8000),
    headers: { Accept: "text/html" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return readMerchantProfile((await response.text()).slice(0, 1_200_000));
}

function Home() {
  const prepare = useServerFn(prepareHost);
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [domains, setDomains] = useState(SAMPLE);
  const [hostsLoaded, setHostsLoaded] = useState(false);
  const [results, setResults] = useState<ProbeResult[]>([]);
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [stoppedEarly, setStoppedEarly] = useState(false);
  const [captchaPrompt, setCaptchaPrompt] = useState<CaptchaPrompt | null>(null);
  const [progress, setProgress] = useState({ total: 0, profiles: 0, logins: 0, queue: 0 });
  const [activity, setActivity] = useState<string[]>([]);
  const [runStarted, setRunStarted] = useState<number | null>(null);
  const [runElapsed, setRunElapsed] = useState(0);
  const [clock, setClock] = useState(0);
  const [cachedMerchants, setCachedMerchants] = useState(0);
  const stopRef = useRef(false);
  const cancelCaptchaRef = useRef<(() => void) | null>(null);
  const activityRef = useRef<string[]>([]);
  const merchantCacheRef = useRef(new Set<string>());
  const passwordReady = password.length >= 6 && password.length <= 20;

  const parsed = useMemo(() => parseProbeList(domains), [domains]);
  const orderedResults = useMemo(() => [...results].sort((a, b) => a.order - b.order), [results]);

  useEffect(() => {
    const saved = localStorage.getItem(HOSTS_KEY);
    if (saved !== null) setDomains(saved);
    setHostsLoaded(true);
  }, []);

  useEffect(() => {
    if (!hostsLoaded) return;
    localStorage.setItem(HOSTS_KEY, domains);
  }, [domains, hostsLoaded]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setClock(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [running]);

  async function onRun() {
    if (!mobile.trim() || !passwordReady || parsed.targets.length === 0) return;
    stopRef.current = false;
    setStoppedEarly(false);
    setRunning(true);
    setResults([]);
    setProgress({ total: parsed.targets.length, profiles: 0, logins: 0, queue: 0 });
    const started = Date.now();
    setRunStarted(started);
    setClock(started);
    activityRef.current = [];
    setActivity([]);
    let nextLoginAt = 0;

    const touch = (tag: string, on: boolean) => {
      const next = activityRef.current.filter((item) => item !== tag);
      activityRef.current = on ? [...next, tag] : next;
      setActivity([...activityRef.current]);
    };

    const add = (row: ProbeResult) => {
      if (row.merchantId) {
        const key = `${row.host}|${row.merchantId}`;
        if (!merchantCacheRef.current.has(key)) {
          merchantCacheRef.current.add(key);
          setCachedMerchants(merchantCacheRef.current.size);
        }
      }
      setResults((prev) => [...prev, row].sort((a, b) => a.order - b.order));
    };

    async function sendLogin(endpoint: string, merchantId: string, captchaOutput: string | null): Promise<PostedLogin> {
      const body = new URLSearchParams({
        mobile: mobile.trim(),
        password,
        module: "/users/login",
        merchantId,
        accessId: "",
        accessToken: "",
        walletIsAdmin: "",
      });
      if (captchaOutput) body.set("captchaOutput", captchaOutput);
      const response = await fetch(endpoint, {
        method: "POST",
        signal: AbortSignal.timeout(12_000),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json, text/plain, */*",
        },
        body,
      });
      const text = (await response.text()).slice(0, 600);
      return { status: response.status, text, judged: classify(response.status, text) };
    }

    function solveCaptcha(host: string, endpoint: string, merchantId: string): Promise<PostedLogin | "cancel"> {
      return new Promise((resolve) => {
        let tries = 0;
        let settled = false;
        const finish = (value: PostedLogin | "cancel") => {
          if (settled) return;
          settled = true;
          cancelCaptchaRef.current = null;
          setCaptchaPrompt(null);
          resolve(value);
        };
        cancelCaptchaRef.current = () => finish("cancel");
        setCaptchaPrompt({
          host,
          onCancel: () => finish("cancel"),
          verify: async (token) => {
            try {
              const posted = await sendLogin(endpoint, merchantId, token);
              tries += 1;
              const captchaOk = posted.judged.verdict !== "captcha";
              if (captchaOk || tries >= 2) finish(posted);
              return { captchaResult: captchaOk, bizResult: posted.judged.verdict === "accepted" };
            } catch (error) {
              finish({
                status: null,
                text: "",
                judged: {
                  verdict: "unreachable",
                  message: error instanceof Error ? error.message : "Request failed",
                },
              });
              return { captchaResult: true, bizResult: false };
            }
          },
        });
      });
    }

    const prepared: Array<{
      index: number;
      host: string;
      endpoint: string;
      merchantId: string | null;
      needsCaptcha: boolean;
      skip: HostPrep["skip"];
      ms: number;
    }> = [];
    const seenMerchant = new Map<string, string>();
    let profilePhaseDone = false;
    const wake: Array<() => void> = [];

    function wakeLogin() {
      wake.shift()?.();
    }

    function queueLogin(item: (typeof prepared)[number]) {
      prepared.push(item);
      setProgress((prev) => ({ ...prev, queue: prev.queue + 1 }));
      wakeLogin();
    }

    async function takeLogin() {
      for (;;) {
        const next = prepared.shift();
        if (next) return next;
        if (profilePhaseDone || stopRef.current) return null;
        await new Promise<void>((resolve) => wake.push(resolve));
      }
    }

    const profiles = mapLimit(parsed.targets, 4, async (target, index) => {
      if (stopRef.current) return;
      const tag = `read:${target.host}`;
      touch(tag, true);
      try {
      const started = Date.now();
      const endpoint = `https://${target.host}/api/v1/index.php`;
      let item: (typeof prepared)[number];
      try {
        const local = await browserProfile(target.host).catch(() => null);
        if (local?.merchantId && local.loginCaptcha !== null) {
          item = {
            index,
            host: target.host,
            endpoint,
            merchantId: target.merchantId ?? local.merchantId,
            needsCaptcha: captchaRequired(local.loginCaptcha),
            skip: null,
            ms: Date.now() - started,
          };
        } else {
          const prep = await prepare({ data: { host: target.host, merchantId: target.merchantId } });
          item = {
            index,
            host: prep.host,
            endpoint: prep.endpoint,
            merchantId: prep.merchantId,
            needsCaptcha: prep.needsCaptcha,
            skip: prep.skip,
            ms: Date.now() - started,
          };
        }
      } catch (error) {
        item = {
          index,
          host: target.host,
          endpoint,
          merchantId: target.merchantId,
          needsCaptcha: false,
          skip: {
            verdict: "unreachable",
            message: error instanceof Error ? error.message : "Request failed",
          },
          ms: Date.now() - started,
        };
      }
      setCurrent(item.host);
      setProgress((prev) => ({ ...prev, profiles: prev.profiles + 1 }));
      if (item.skip || !item.merchantId) {
        add({
          host: item.host,
          endpoint: item.endpoint,
          verdict: item.skip?.verdict ?? "unclear",
          httpStatus: null,
          message: item.skip?.message ?? "Could not read a merchant ID. No attempt was sent.",
          snippet: "",
          merchantId: item.merchantId,
          stop: false,
          ms: item.ms,
          order: item.index,
        });
        return;
      }
      const first = seenMerchant.get(item.merchantId);
      if (first) {
        add({
          host: item.host,
          endpoint: item.endpoint,
          verdict: "unclear",
          httpStatus: null,
          message: `Same merchant ${item.merchantId} as ${first}. No second login was sent.`,
          snippet: "",
          merchantId: item.merchantId,
          stop: false,
          ms: item.ms,
          order: item.index,
        });
        return;
      }
      seenMerchant.set(item.merchantId, item.host);
      queueLogin(item);
      } finally {
        touch(tag, false);
      }
    }).then(() => {
      profilePhaseDone = true;
      wakeLogin();
    });

    const logins = (async () => {
      for (;;) {
        const item = await takeLogin();
        if (!item || stopRef.current) break;
        if (!item.merchantId) continue;
        const tag = `login:${item.host}`;
        touch(tag, true);
        setCurrent(item.host);
        const started = Date.now();
        try {
          const wait = Math.max(0, nextLoginAt - Date.now());
          if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
          if (stopRef.current) break;

          let posted: PostedLogin;
          let postedSomething = false;
          if (item.needsCaptcha) {
            const solved = await solveCaptcha(item.host, item.endpoint, item.merchantId);
            if (solved === "cancel") {
              if (!stopRef.current) {
                add({
                  host: item.host,
                  endpoint: item.endpoint,
                  verdict: "captcha",
                  httpStatus: null,
                  message: "Captcha cancelled. This host was not checked.",
                  snippet: "",
                  merchantId: item.merchantId,
                  stop: false,
                  ms: Date.now() - started,
                  order: item.index,
                });
              }
              setProgress((prev) => ({ ...prev, logins: prev.logins + 1 }));
              continue;
            }
            posted = solved;
            postedSomething = true;
          } else {
            posted = await sendLogin(item.endpoint, item.merchantId, null);
            postedSomething = true;
            if (posted.judged.verdict === "captcha" && !stopRef.current) {
              const solved = await solveCaptcha(item.host, item.endpoint, item.merchantId);
              if (solved === "cancel") {
                if (!stopRef.current) {
                  add({
                    host: item.host,
                    endpoint: item.endpoint,
                    verdict: "captcha",
                    httpStatus: posted.status,
                    message: "Captcha cancelled. No further attempt was sent.",
                    snippet: redactSecrets(posted.text).replace(/\s+/g, " ").slice(0, 280),
                    merchantId: item.merchantId,
                    stop: false,
                    ms: Date.now() - started,
                    order: item.index,
                  });
                }
                nextLoginAt = Date.now() + 400;
                setProgress((prev) => ({ ...prev, logins: prev.logins + 1 }));
                continue;
              }
              posted = solved;
            }
          }

          const stop = posted.judged.verdict === "captcha" || shouldStopRun(posted.judged.message);
          const message = stop
            ? `${posted.judged.message} The rest of this run was stopped.`.slice(0, 240)
            : posted.judged.message.slice(0, 240);
          add({
            host: item.host,
            endpoint: item.endpoint,
            verdict: posted.judged.verdict,
            httpStatus: posted.status,
            message,
            snippet: redactSecrets(posted.text).replace(/\s+/g, " ").slice(0, 280),
            merchantId: item.merchantId,
            stop,
            ms: Date.now() - started,
            order: item.index,
          });
          if (stop) {
            stopRef.current = true;
            setStoppedEarly(true);
            wakeLogin();
            break;
          }
          if (postedSomething) nextLoginAt = Date.now() + 400;
          setProgress((prev) => ({ ...prev, logins: prev.logins + 1 }));
        } catch (error) {
          add({
            host: item.host,
            endpoint: item.endpoint,
            verdict: "unreachable",
            httpStatus: null,
            message: error instanceof Error ? error.message : "Request failed",
            snippet: "",
            merchantId: item.merchantId,
            stop: false,
            ms: Date.now() - started,
            order: item.index,
          });
          nextLoginAt = Date.now() + 400;
          setProgress((prev) => ({ ...prev, logins: prev.logins + 1 }));
        } finally {
          touch(tag, false);
        }
      }
    })();

    await Promise.all([profiles, logins]);
    setCaptchaPrompt(null);
    setCurrent(null);
    activityRef.current = [];
    setActivity([]);
    setRunElapsed(Math.max(0, (Date.now() - started) / 1000));
    setRunning(false);
  }

  function onStop() {
    stopRef.current = true;
    cancelCaptchaRef.current?.();
  }

  const counts = results.reduce(
    (acc, row) => {
      acc[row.verdict] += 1;
      return acc;
    },
    { accepted: 0, "no-account": 0, refused: 0, password: 0, captcha: 0, rejected: 0, unclear: 0, unreachable: 0, blocked: 0 } as Record<
      ProbeVerdict,
      number
    >,
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex items-start gap-4 border-b border-line pb-6">
        <span className="mt-1 flex size-11 shrink-0 items-center justify-center rounded-xl bg-raised text-accent">
          <Radar className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="font-mono text-xs tracking-widest text-accent uppercase">Login API</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Mirror Login Probe</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Paste hosts one per line. A path such as <span className="font-mono text-fg">/RF12345667</span>{" "}
            is ignored. Each host uses its own merchant ID. The login is sent from this phone or computer, so the site sees that connection. If a host asks for a captcha, you solve the puzzle yourself.
          </p>
        </div>
      </header>

      <OutgoingIpCard cachedMerchants={cachedMerchants} />
      <TelemetryCard
        running={running}
        captchaHost={captchaPrompt?.host ?? null}
        elapsedSec={running && runStarted ? Math.max(0, (clock - runStarted) / 1000) : runElapsed}
        done={results.length}
        total={running ? progress.total : parsed.targets.length}
        activity={activity}
        avgPing={results.length ? Math.round(results.reduce((sum, row) => sum + row.ms, 0) / results.length) : null}
        speed={
          running && runStarted && clock > runStarted && results.length
            ? `${(results.length / ((clock - runStarted) / 1000)).toFixed(1)}/s`
            : "—"
        }
        accepted={counts.accepted}
        failed={counts.rejected + counts.password + counts.refused + counts["no-account"]}
        dead={counts.unreachable + counts.blocked}
        captcha={counts.captcha}
      />

      <section className="grid gap-4 lg:grid-cols-2">
        <form
          className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 shadow-[inset_0_1px_0_0_color-mix(in_srgb,var(--color-accent)_35%,transparent)]"
          onSubmit={(event) => {
            event.preventDefault();
            void onRun();
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">Mobile or username</span>
            <input
              value={mobile}
              onChange={(event) => setMobile(event.target.value)}
              autoComplete="username"
              className="h-11 rounded-lg border border-line bg-bg px-3 font-mono text-sm text-fg outline-none focus:border-accent"
              placeholder="61480050689"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">Password</span>
            <span className="flex gap-2">
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 font-mono text-sm text-fg outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="flex size-11 items-center justify-center rounded-lg border border-line bg-raised text-muted"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </span>
            {password.length > 0 && !passwordReady ? (
              <span className="text-xs text-danger">Use 6–20 characters. Anything else never reaches the account.</span>
            ) : (
              <span className="text-xs text-muted">6–20 characters.</span>
            )}
          </label>
          <div className="mt-auto flex gap-2">
            <button
              type="submit"
              disabled={running || !mobile.trim() || !passwordReady || parsed.targets.length === 0}
              className="h-11 flex-1 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink disabled:opacity-40"
            >
              {running ? `Checking ${current ?? "…"}` : `Check ${parsed.targets.length || ""} host${parsed.targets.length === 1 ? "" : "s"}`}
            </button>
            {running ? (
              <button
                type="button"
                onClick={onStop}
                className="flex h-11 items-center gap-2 rounded-lg border border-line px-4 text-sm text-fg"
              >
                <Square className="size-3.5" />
                Stop
              </button>
            ) : null}
          </div>
        </form>

        <div className="flex min-h-72 flex-col rounded-2xl border border-line bg-surface p-4 shadow-[inset_0_1px_0_0_color-mix(in_srgb,var(--color-accent)_35%,transparent)]">
          <div className="mb-2 flex items-center justify-between gap-3">
            <label htmlFor="domains" className="text-sm text-muted">
              Hosts
            </label>
            <button
              type="button"
              onClick={() => setDomains("")}
              className="flex items-center gap-1 text-xs text-muted"
            >
              <Trash2 className="size-3.5" />
              Clear
            </button>
          </div>
          <textarea
            id="domains"
            value={domains}
            onChange={(event) => setDomains(event.target.value)}
            spellCheck={false}
            className="min-h-48 flex-1 resize-y rounded-lg border border-line bg-bg p-3 font-mono text-sm leading-relaxed text-fg outline-none focus:border-accent"
            placeholder={"9au.com\nothersite.com 60813"}
          />
          <p className="mt-2 text-xs text-muted">
            {parsed.targets.length} unique host{parsed.targets.length === 1 ? "" : "s"}
            {parsed.rejected.length > 0 ? ` · ${parsed.rejected.length} skipped` : ""}
          </p>
        </div>
      </section>

      {parsed.rejected.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs text-danger">
          {parsed.rejected.map((row) => (
            <li key={row.input}>
              <span className="font-mono">{row.input}</span> — {row.reason}
            </li>
          ))}
        </ul>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">Results</h2>
          {results.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {(
                [
                  [counts.accepted, "accepted"],
                  [counts["no-account"], "no account"],
                  [counts.refused, "refused"],
                  [counts.captcha, "captcha"],
                  [counts.password + counts.rejected + counts.unclear + counts.unreachable + counts.blocked, "other"],
                ] as Array<[number, string]>
              )
                .filter(([count]) => count > 0)
                .map(([count, label]) => (
                  <li key={label} className="rounded-md border border-line bg-surface px-2 py-1 font-mono text-xs text-muted">
                    <span className="text-fg">{count}</span> {label}
                  </li>
                ))}
              {stoppedEarly ? (
                <li className="rounded-md border border-warn/40 bg-warn/10 px-2 py-1 text-xs text-warn">Stopped early</li>
              ) : null}
            </ul>
          ) : null}
        </div>

        {orderedResults.length === 0 && !running ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
            Results show up here, one host at a time.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {orderedResults.map((row) => (
              <li key={row.host} className="overflow-hidden rounded-2xl border border-line bg-surface">
                <div className="flex items-start justify-between gap-3 px-4 pt-4">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm text-fg">{row.host}</p>
                    <p className="mt-1 text-sm leading-relaxed text-fg">{row.message}</p>
                  </div>
                  <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium ${verdictClass(row.verdict)}`}>
                    {VERDICT_LABEL[row.verdict]}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 px-4">
                  <Fact label="Merchant" value={row.merchantId ?? "—"} />
                  <Fact label="Status" value={row.httpStatus === null ? "—" : String(row.httpStatus)} />
                  <Fact label="Time" value={`${row.ms} ms`} />
                </div>
                <p className="mt-3 px-4 font-mono text-[11px] break-all text-muted">{row.endpoint}</p>
                {row.snippet ? (
                  <pre className="mx-4 mt-3 mb-4 overflow-x-auto rounded-lg border border-line bg-bg px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-muted">
                    {row.snippet}
                  </pre>
                ) : (
                  <div className="h-4" />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {captchaPrompt ? <CaptchaSheet prompt={captchaPrompt} /> : null}
    </main>
  );
}
