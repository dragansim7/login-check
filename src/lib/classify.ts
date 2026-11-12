export type ProbeVerdict =
  | "accepted"
  | "no-account"
  | "refused"
  | "password"
  | "captcha"
  | "rejected"
  | "unclear"
  | "unreachable"
  | "blocked";

export type ProbeResult = {
  host: string;
  endpoint: string;
  verdict: ProbeVerdict;
  httpStatus: number | null;
  message: string;
  snippet: string;
  merchantId: string | null;
  stop: boolean;
  ms: number;
  order: number;
};

export function explainLogin(message: string): { verdict: ProbeVerdict; message: string } | null {
  const text = message.trim();
  if (/invalid password/i.test(text)) {
    return {
      verdict: "password",
      message: "Password must be 6–20 characters. The site did not look up the account.",
    };
  }
  if (/invalid captcha/i.test(text)) {
    return {
      verdict: "captcha",
      message: "Captcha required. This site did not check the password.",
    };
  }
  const code = text.match(/invalid login\.\s*(\d+)/i);
  if (code?.[1] === "7") {
    return { verdict: "no-account", message: "No account on this merchant." };
  }
  if (code?.[1] === "8") {
    return {
      verdict: "refused",
      message: "Account found, but the login was refused. Wrong password, or this connection is blocked.",
    };
  }
  if (code?.[1]) {
    return {
      verdict: "rejected",
      message: `Invalid Login. ${code[1]}. This code is not 7 or 8, so it was left as its own result.`,
    };
  }
  if (/^invalid login\.?$/i.test(text)) {
    return {
      verdict: "rejected",
      message: "Login refused. This site did not say whether the account exists.",
    };
  }
  return null;
}

export function redactSecrets(text: string): string {
  return text.replace(/"(accessToken|token|accessId|password)"\s*:\s*"[^"]*"/gi, '"$1":"[redacted]"');
}

export function classify(status: number, text: string): { verdict: ProbeVerdict; message: string } {
  const trimmed = text.trim();
  let json: unknown = null;
  try {
    json = JSON.parse(trimmed);
  } catch {
    json = null;
  }

  if (json && typeof json === "object") {
    const record = json as Record<string, unknown>;
    const data =
      record.data && typeof record.data === "object"
        ? (record.data as Record<string, unknown>)
        : null;
    const statusText = String(record.status ?? "").toUpperCase();
    const message = String(data?.message ?? record.message ?? record.msg ?? "");
    const explained = explainLogin(message);
    if (explained) return explained;
    const token = data?.accessToken ?? data?.token ?? record.accessToken ?? record.token;
    if (typeof token === "string" && token.length > 8) {
      return { verdict: "accepted", message: message || "Login accepted — token returned" };
    }
    if (statusText === "SUCCESS" || statusText === "OK" || record.success === true) {
      return { verdict: "accepted", message: message || "Login accepted" };
    }
    if (statusText === "ERROR" || statusText === "FAIL" || record.success === false) {
      return { verdict: "rejected", message: message || "Login rejected" };
    }
    if (message) return { verdict: "unclear", message };
  }

  const plain = explainLogin(trimmed);
  if (plain) return plain;

  if (trimmed.startsWith("<") || trimmed.startsWith("<!")) {
    return { verdict: "unclear", message: "HTML came back instead of the login API" };
  }
  if (status >= 400) return { verdict: "rejected", message: `HTTP ${status}` };
  return { verdict: "unclear", message: trimmed ? "Unexpected response" : `HTTP ${status} with an empty body` };
}

export function shouldStopRun(message: string): boolean {
  return /too many|rate limit|try again later|too frequent|account locked|please wait|temporarily locked/i.test(
    message,
  );
}
