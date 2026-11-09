import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, Radar, Square, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { parseProbeList } from "@/lib/hosts";
import { probeLogin, type ProbeResult, type ProbeVerdict } from "@/lib/probe.functions";

export const Route = createFileRoute("/")({ component: Home });

const SAMPLE = "9au.com\n9au.com/RF12345667";

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
  if (verdict === "captcha") return "bg-warn/15 text-warn";
  if (verdict === "refused") return "bg-warn/15 text-warn";
  if (verdict === "rejected" || verdict === "blocked" || verdict === "no-account" || verdict === "password") {
    return "bg-danger/15 text-danger";
  }
  return "bg-raised text-muted";
}

function Home() {
  const runProbe = useServerFn(probeLogin);
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [domains, setDomains] = useState(SAMPLE);
  const [results, setResults] = useState<ProbeResult[]>([]);
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const stopRef = useRef(false);
  const passwordReady = password.length >= 6 && password.length <= 20;

  const parsed = useMemo(() => parseProbeList(domains), [domains]);

  async function onRun() {
    if (!mobile.trim() || !passwordReady || parsed.targets.length === 0) return;
    stopRef.current = false;
    setRunning(true);
    setResults([]);
    const queue = [...parsed.targets];
    const active = new Set<string>();

    async function worker() {
      while (!stopRef.current) {
        const target = queue.shift();
        if (!target) return;
        active.add(target.host);
        setCurrent(active.size === 1 ? "1 host" : `${active.size} hosts`);
        try {
          const result = await runProbe({
            data: {
              host: target.host,
              mobile: mobile.trim(),
              password,
              merchantId: target.merchantId,
            },
          });
          setResults((prev) => [...prev, result]);
        } catch (error) {
          setResults((prev) => [
            ...prev,
            {
              host: target.host,
              endpoint: `https://${target.host}/api/v1/index.php`,
              verdict: "unreachable",
              httpStatus: null,
              message: error instanceof Error ? error.message : "Request failed",
              snippet: "",
              merchantId: target.merchantId,
              ms: 0,
            },
          ]);
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
            is ignored. Each host is checked with its own merchant ID, read from that site.
            Add <span className="font-mono text-fg">10520</span> after a host only if you need to override it.{" "}
            Every check uses <span className="font-mono text-fg">POST /api/v1/index.php</span>. Nothing is saved.
          </p>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <form
          className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4"
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
              {running
                ? `Checking ${current ?? "…"}`
                : `Check ${parsed.targets.length || ""} host${parsed.targets.length === 1 ? "" : "s"}`}
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

        <div className="flex min-h-72 flex-col rounded-2xl border border-line bg-surface p-4">
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
          {parsed.targets.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {parsed.targets.map((target) => (
                <li key={target.host} className="rounded-md bg-raised px-2 py-1 font-mono text-xs text-fg">
                  {target.host}
                  {target.merchantId ? ` · ${target.merchantId}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
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
            <p className="font-mono text-xs text-muted">
              {counts.accepted} accepted · {counts["no-account"]} no account · {counts.refused} refused ·{" "}
              {counts.captcha} captcha · {counts.password + counts.rejected + counts.unclear + counts.unreachable + counts.blocked} other
            </p>
          ) : null}
        </div>

        {results.length === 0 && !running ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
            Results show up here, up to three hosts at a time.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {results.map((row) => (
              <li key={row.host} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md px-2 py-1 text-xs font-medium ${verdictClass(row.verdict)}`}>
                    {VERDICT_LABEL[row.verdict]}
                  </span>
                  <span className="font-mono text-sm text-fg">{row.host}</span>
                  <span className="ml-auto font-mono text-xs text-muted">
                    {row.merchantId ? `merchant ${row.merchantId} · ` : ""}
                    {row.httpStatus ?? "—"} · {row.ms} ms
                  </span>
                </div>
                <p className="mt-2 text-sm text-fg">{row.message}</p>
                <p className="mt-1 font-mono text-xs break-all text-muted">{row.endpoint}</p>
                {row.snippet ? (
                  <p className="mt-2 font-mono text-xs leading-relaxed break-all text-muted">{row.snippet}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
