package com.mirrorlogin.probe;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class ProbeClient {
    static final class Result {
        final String host;
        final String endpoint;
        final String verdict;
        final Integer httpStatus;
        final String message;
        final String snippet;
        final String merchantId;
        final boolean stop;
        final long ms;

        Result(String host, String endpoint, String verdict, Integer httpStatus, String message,
               String snippet, String merchantId, boolean stop, long ms) {
            this.host = host;
            this.endpoint = endpoint;
            this.verdict = verdict;
            this.httpStatus = httpStatus;
            this.message = message;
            this.snippet = snippet;
            this.merchantId = merchantId;
            this.stop = stop;
            this.ms = ms;
        }
    }

    private static final Pattern MERCHANT = Pattern.compile("(?i)\\bMERCHANTID\\s*[:=]\\s*[\"']?(\\d{3,8})\\b");
    private static final Pattern MERCHANT_ALT = Pattern.compile("(?i)\\bMERCHANT_ID\\s*[:=]\\s*[\"']?(\\d{3,8})\\b");
    private static final Pattern MERCHANT_JSON = Pattern.compile("(?i)[\"']merchantId[\"']\\s*[:=]\\s*[\"']?(\\d{3,8})\\b");
    private static final Pattern CAPTCHA = Pattern.compile("(?i)LoginCaptcha\\\\?\"?\\s*[:=]\\s*\\\\?\"?(\\d+)");
    private static final Pattern LOGIN_CODE = Pattern.compile("(?i)invalid login\\.\\s*(\\d+)");
    private static final Pattern STOP = Pattern.compile(
            "(?i)too many|rate limit|try again later|too frequent|account locked|please wait|temporarily locked");

    private static volatile String userAgent =
            "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

    static void setUserAgent(String value) {
        if (value != null && !value.isBlank()) userAgent = value;
    }

    private ProbeClient() {}

    static final class Prep {
        final String host;
        final String endpoint;
        final String merchantId;
        final Result skip;

        final boolean needsCaptcha;

        Prep(String host, String endpoint, String merchantId, boolean needsCaptcha, Result skip) {
            this.host = host;
            this.endpoint = endpoint;
            this.merchantId = merchantId;
            this.needsCaptcha = needsCaptcha;
            this.skip = skip;
        }
    }

    static Prep prepare(String host, String merchantOverride) {
        long started = System.currentTimeMillis();
        String endpoint = "https://" + host + "/api/v1/index.php";
        try {
            assertPublic(host);
            Profile profile;
            try {
                profile = loadProfile(host);
            } catch (Exception first) {
                String detail = first.getMessage() == null ? "" : first.getMessage().toLowerCase();
                if (!detail.contains("timeout") && !detail.contains("reset") && !detail.contains("failed")) throw first;
                profile = loadProfile(host);
            }
            String merchantId = merchantOverride != null ? merchantOverride : profile.merchantId;
            if (profile.loginCaptcha != null && (profile.loginCaptcha == 1 || profile.loginCaptcha == 3)) {
                return new Prep(host, endpoint, merchantId, true, null);
            }
            if (merchantId == null) {
                return new Prep(host, endpoint, null, false, done(host, endpoint, "Unclear", null,
                        "Could not read a merchant ID. No attempt was sent.", "", null, false, started));
            }
            return new Prep(host, endpoint, merchantId, false, null);
        } catch (Exception error) {
            String message = error.getMessage() == null ? "Request failed" : error.getMessage();
            String lower = message.toLowerCase();
            String verdict = "Unreachable";
            if (lower.contains("not allowed") || lower.contains("blocked address")) verdict = "Blocked";
            if (lower.contains("unable to resolve") || lower.contains("unknown host")) {
                message = "This domain does not resolve. No login was sent.";
            }
            return new Prep(host, endpoint, merchantOverride, false, done(host, endpoint, verdict, null, clip(message), "", merchantOverride, false, started));
        }
    }

    static Result login(String host, String endpoint, String merchantId, String mobile, String password, String captchaOutput) {
        long started = System.currentTimeMillis();
        try {
            return postLogin(host, endpoint, merchantId, mobile, password, captchaOutput, started);
        } catch (Exception error) {
            String message = error.getMessage() == null ? "Request failed" : error.getMessage();
            return done(host, endpoint, "Unreachable", null, clip(message), "", merchantId, false, started);
        }
    }

    static Result check(String host, String merchantOverride, String mobile, String password) {
        long started = System.currentTimeMillis();
        String endpoint = "https://" + host + "/api/v1/index.php";
        try {
            assertPublic(host);
            Profile profile = loadProfile(host);
            String merchantId = merchantOverride != null ? merchantOverride : profile.merchantId;
            if (profile.loginCaptcha != null && (profile.loginCaptcha == 1 || profile.loginCaptcha == 3)) {
                return done(host, endpoint, "Captcha", null,
                        "This site asks for a captcha. No attempt was sent.",
                        "", merchantId, false, started);
            }
            if (merchantId == null) {
                return done(host, endpoint, "Unclear", null,
                        "Could not read a merchant ID. No attempt was sent.", "", null, false, started);
            }
            return postLogin(host, endpoint, merchantId, mobile, password, null, started);
        } catch (Exception error) {
            String message = error.getMessage() == null ? "Request failed" : error.getMessage();
            String verdict = message.contains("not allowed") || message.contains("blocked address") ? "Blocked" : "Unreachable";
            return done(host, endpoint, verdict, null, clip(message), "", merchantOverride, false, started);
        }
    }

    private static Result postLogin(String host, String endpoint, String merchantId, String mobile,
                                    String password, String captchaOutput, long started) throws Exception {
        String body = "mobile=" + enc(mobile)
                + "&password=" + enc(password)
                + "&module=" + enc("/users/login")
                + "&merchantId=" + enc(merchantId)
                + "&accessId=&accessToken=&walletIsAdmin=";
        if (captchaOutput != null && !captchaOutput.isEmpty()) {
            body += "&captchaOutput=" + enc(captchaOutput);
        }
        HttpURLConnection conn = open(endpoint, "POST");
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
        conn.setRequestProperty("Accept", "application/json, text/plain, */*");
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        conn.setFixedLengthStreamingMode(bytes.length);
        conn.getOutputStream().write(bytes);
        int status = conn.getResponseCode();
        String text = readLimited(stream(conn), 600);
        conn.disconnect();
        Judged judged = classify(status, text);
        boolean stop = STOP.matcher(judged.message).find();
        String message = stop ? judged.message + " The rest of this run was stopped." : judged.message;
        String snippet = text.replaceAll("\\s+", " ")
                .replaceAll("(?i)\"(accessToken|token|accessId|password)\"\\s*:\\s*\"[^\"]*\"", "\"$1\":\"[redacted]\"");
        return done(host, endpoint, judged.verdict, status, clip(message), snippet, merchantId, stop, started);
    }

    private static Profile loadProfile(String host) throws Exception {
        String url = "https://" + host + "/";
        for (int hop = 0; hop < 2; hop++) {
            HttpURLConnection conn = open(url, "GET");
            conn.setInstanceFollowRedirects(false);
            int status = conn.getResponseCode();
            if (status >= 300 && status < 400) {
                if (hop == 1) throw new IllegalStateException("This host redirected before publishing a merchant ID");
                String location = conn.getHeaderField("Location");
                conn.disconnect();
                if (location == null) throw new IllegalStateException("This host redirected before publishing a merchant ID");
                URI next = URI.create(url).resolve(location);
                if (!"https".equalsIgnoreCase(next.getScheme())) {
                    throw new IllegalStateException("Merchant page redirected off HTTPS");
                }
                if (next.getPort() != -1 && next.getPort() != 443) {
                    throw new IllegalStateException("Merchant page redirected to a blocked port");
                }
                String nextHost = next.getHost() == null ? "" : next.getHost().replaceAll("\\.$", "").toLowerCase();
                if (!sameSite(host, nextHost)) {
                    throw new IllegalStateException("Merchant page redirected to a different site");
                }
                assertPublic(nextHost);
                url = next.toString();
                continue;
            }
            String html = readUntilProfile(stream(conn));
            conn.disconnect();
            if (status >= 400) {
                String sample = html.toLowerCase();
                if (sample.contains("captcha") || sample.contains("cloudflare") || sample.contains("attention required") || sample.contains("phishing")) {
                    throw new IllegalStateException("The site blocked the merchant page (HTTP " + status + "). No login was sent.");
                }
                throw new IllegalStateException("Merchant page returned HTTP " + status + ". No login was sent.");
            }
            Profile profile = readProfile(html);
            if (profile.merchantId == null) {
                throw new IllegalStateException("This site did not publish a merchant ID");
            }
            return profile;
        }
        throw new IllegalStateException("This site did not publish a merchant ID");
    }

    private static HttpURLConnection open(String url, String method) throws Exception {
        URI uri = URI.create(url);
        assertPublic(uri.getHost());
        HttpURLConnection conn = (HttpURLConnection) uri.toURL().openConnection();
        conn.setConnectTimeout(12_000);
        conn.setReadTimeout(12_000);
        conn.setInstanceFollowRedirects(false);
        conn.setRequestMethod(method);
        conn.setRequestProperty("User-Agent", userAgent);
        conn.setRequestProperty("Accept", "GET".equals(method) ? "text/html" : "application/json, text/plain, */*");
        return conn;
    }

    private static void assertPublic(String host) throws Exception {
        if (host == null || host.trim().isEmpty()) throw new IllegalStateException("Host is not allowed");
        InetAddress[] addresses = InetAddress.getAllByName(host);
        for (InetAddress address : addresses) {
            byte[] raw = address.getAddress();
            if (raw.length != 4) throw new IllegalStateException("Host resolves to a blocked address");
            String ip = address.getHostAddress();
            if (HostParser.isPrivateIpv4(ip) || "0.0.0.0".equals(ip)) {
                throw new IllegalStateException("Host resolves to a blocked address");
            }
        }
    }

    private static boolean sameSite(String from, String to) {
        return to.equals(from) || to.equals("www." + from) || from.equals("www." + to);
    }

    private static Profile readProfile(String html) {
        Matcher merchant = MERCHANT.matcher(html);
        String id = merchant.find() ? merchant.group(1) : null;
        if (id == null) {
            Matcher alt = MERCHANT_ALT.matcher(html);
            if (alt.find()) id = alt.group(1);
        }
        if (id == null) {
            Matcher json = MERCHANT_JSON.matcher(html);
            if (json.find()) id = json.group(1);
        }
        Matcher captcha = CAPTCHA.matcher(html);
        Integer value = captcha.find() ? Integer.valueOf(captcha.group(1)) : null;
        return new Profile(id, value);
    }

    private static String readUntilProfile(InputStream in) throws Exception {
        if (in == null) return "";
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int n;
        while (buf.size() < 1_200_000 && (n = in.read(chunk)) != -1) {
            buf.write(chunk, 0, Math.min(n, 1_200_000 - buf.size()));
            Profile profile = readProfile(buf.toString(StandardCharsets.UTF_8));
            if (profile.merchantId != null && profile.loginCaptcha != null) break;
        }
        in.close();
        return buf.toString(StandardCharsets.UTF_8);
    }

    private static String readLimited(InputStream in, int max) throws Exception {
        if (in == null) return "";
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] chunk = new byte[1024];
        int n;
        while (buf.size() < max && (n = in.read(chunk)) != -1) {
            buf.write(chunk, 0, Math.min(n, max - buf.size()));
        }
        in.close();
        return buf.toString(StandardCharsets.UTF_8);
    }

    private static InputStream stream(HttpURLConnection conn) {
        try {
            return conn.getInputStream();
        } catch (Exception error) {
            return conn.getErrorStream();
        }
    }

    private static Judged classify(int status, String text) {
        String trimmed = text == null ? "" : text.trim();
        String message = jsonMessage(trimmed);
        if (message != null) {
            Judged explained = explain(message);
            if (explained != null) return explained;
            if (trimmed.contains("\"accessToken\"") || trimmed.contains("\"token\"")) {
                return new Judged("Accepted", message.isEmpty() ? "Login accepted — token returned" : message);
            }
            if (trimmed.contains("\"SUCCESS\"") || trimmed.contains("\"OK\"")) {
                return new Judged("Accepted", message.isEmpty() ? "Login accepted" : message);
            }
            if (trimmed.contains("\"ERROR\"") || trimmed.contains("\"FAIL\"")) {
                return new Judged("Rejected", message.isEmpty() ? "Login rejected" : message);
            }
            if (!message.isEmpty()) return new Judged("Unclear", message);
        }
        Judged plain = explain(trimmed);
        if (plain != null) return plain;
        if (trimmed.startsWith("<")) return new Judged("Unclear", "HTML came back instead of the login API");
        if (status >= 400) return new Judged("Rejected", "HTTP " + status);
        return new Judged("Unclear", trimmed.isEmpty() ? "HTTP " + status + " with an empty body" : "Unexpected response");
    }

    private static Judged explain(String text) {
        if (text.toLowerCase().contains("invalid password")) {
            return new Judged("Length", "Password must be 6–20 characters. The site did not look up the account.");
        }
        if (text.toLowerCase().contains("invalid captcha")) {
            return new Judged("Captcha", "Captcha required. This site did not check the password.");
        }
        Matcher code = LOGIN_CODE.matcher(text);
        if (code.find()) {
            if ("7".equals(code.group(1))) return new Judged("No account", "No account on this merchant.");
            if ("8".equals(code.group(1))) {
                return new Judged("Refused", "Account found, but the login was refused. Wrong password, or this connection is blocked.");
            }
            return new Judged("Rejected", "Invalid Login. " + code.group(1) + ". This code is not 7 or 8, so it was left as its own result.");
        }
        if (text.trim().matches("(?i)invalid login\\.?")) {
            return new Judged("Rejected", "Login refused. This site did not say whether the account exists.");
        }
        return null;
    }

    private static String jsonMessage(String text) {
        if (!text.startsWith("{")) return null;
        Matcher matcher = Pattern.compile("\"message\"\\s*:\\s*\"([^\"]*)\"").matcher(text);
        return matcher.find() ? matcher.group(1) : "";
    }

    private static String enc(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private static String clip(String value) {
        return value.length() <= 240 ? value : value.substring(0, 240);
    }

    private static Result done(String host, String endpoint, String verdict, Integer status, String message,
                               String snippet, String merchantId, boolean stop, long started) {
        return new Result(host, endpoint, verdict, status, message, snippet, merchantId, stop,
                System.currentTimeMillis() - started);
    }

    private static final class Profile {
        final String merchantId;
        final Integer loginCaptcha;

        Profile(String merchantId, Integer loginCaptcha) {
            this.merchantId = merchantId;
            this.loginCaptcha = loginCaptcha;
        }
    }

    private static final class Judged {
        final String verdict;
        final String message;

        Judged(String verdict, String message) {
            this.verdict = verdict;
            this.message = message;
        }
    }
}
