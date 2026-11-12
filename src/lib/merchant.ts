export function readMerchantProfile(html: string): { merchantId: string | null; loginCaptcha: number | null } {
  const merchant =
    html.match(/\bMERCHANTID\s*[:=]\s*["']?(\d{3,8})\b/i)?.[1] ??
    html.match(/\bMERCHANT_ID\s*[:=]\s*["']?(\d{3,8})\b/i)?.[1] ??
    html.match(/["']merchantId["']\s*[:=]\s*["']?(\d{3,8})\b/i)?.[1] ??
    null;
  const captcha = html.match(/LoginCaptcha\\?"?\s*[:=]\s*\\?"?(\d+)/i)?.[1] ?? null;
  return { merchantId: merchant, loginCaptcha: captcha === null ? null : Number(captcha) };
}

export function captchaRequired(value: number | null): boolean {
  return value === 1 || value === 3;
}
