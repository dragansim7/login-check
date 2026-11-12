package com.mirrorlogin.probe;

import android.app.Activity;
import android.graphics.Typeface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.webkit.WebSettings;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends Activity {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final ExecutorService lookups = Executors.newSingleThreadExecutor();
    private final AtomicBoolean stop = new AtomicBoolean(false);
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final String[] lanes = {"", "", ""};
    private EditText mobile;
    private EditText password;
    private EditText hosts;
    private TextView passwordHint;
    private TextView egressIp;
    private TextView egressMeta;
    private TextView egressPlace;
    private TextView egressMask;
    private TextView egressMs;
    private TextView teleStatus;
    private TextView teleElapsed;
    private TextView teleStats;
    private TextView teleLanes;
    private TextView teleOutcomes;
    private Button run;
    private Button stopButton;
    private LinearLayout results;
    private boolean running;
    private long startedAt;
    private int done;
    private int total;
    private int loginOk;
    private int failed;
    private int dead;
    private int captchaCount;
    private long pingSum;
    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (!running) return;
            paintBoard();
            handler.postDelayed(this, 200);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        mobile = findViewById(R.id.mobile);
        password = findViewById(R.id.password);
        hosts = findViewById(R.id.hosts);
        passwordHint = findViewById(R.id.passwordHint);
        egressIp = findViewById(R.id.egressIp);
        egressMeta = findViewById(R.id.egressMeta);
        egressPlace = findViewById(R.id.egressPlace);
        egressMask = findViewById(R.id.egressMask);
        egressMs = findViewById(R.id.egressMs);
        teleStatus = findViewById(R.id.teleStatus);
        teleElapsed = findViewById(R.id.teleElapsed);
        teleStats = findViewById(R.id.teleStats);
        teleLanes = findViewById(R.id.teleLanes);
        teleOutcomes = findViewById(R.id.teleOutcomes);
        run = findViewById(R.id.run);
        stopButton = findViewById(R.id.stop);
        results = findViewById(R.id.results);
        String agent = WebSettings.getDefaultUserAgent(this);
        ProbeClient.setUserAgent(agent);
        egressMask.setText("Mask: " + maskFrom(agent));
        run.setOnClickListener(view -> start());
        stopButton.setOnClickListener(view -> stop.set(true));
        findViewById(R.id.egressRefresh).setOnClickListener(view -> refreshIp());
        paintBoard();
        refreshIp();
    }

    @Override
    protected void onDestroy() {
        stop.set(true);
        running = false;
        executor.shutdownNow();
        lookups.shutdownNow();
        super.onDestroy();
    }

    private void refreshIp() {
        egressIp.setText("Detecting…");
        egressMs.setText("…");
        lookups.execute(() -> {
            long started = System.currentTimeMillis();
            String[] sources = {
                    "https://get.geojs.io/v1/ip/geo.json",
                    "https://api.ip.sb/geoip",
                    "https://ipinfo.io/json"
            };
            for (String source : sources) {
                try {
                    HttpURLConnection conn = (HttpURLConnection) URI.create(source).toURL().openConnection();
                    conn.setConnectTimeout(8000);
                    conn.setReadTimeout(8000);
                    conn.setRequestProperty("User-Agent", WebSettings.getDefaultUserAgent(this));
                    conn.setRequestProperty("Accept", "application/json");
                    int status = conn.getResponseCode();
                    InputStream in = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
                    String text = readAll(in);
                    conn.disconnect();
                    if (status >= 400) continue;
                    JSONObject json = new JSONObject(text);
                    String ip = json.optString("ip", "");
                    if (ip.isEmpty()) continue;
                    String isp = first(json, "organization_name", "organization", "isp", "org");
                    String asn = json.optString("asn", "");
                    if (asn.isEmpty() && isp.startsWith("AS")) {
                        int space = isp.indexOf(' ');
                        if (space > 0) {
                            asn = isp.substring(0, space);
                            isp = isp.substring(space + 1);
                        }
                    } else if (!asn.isEmpty() && !asn.startsWith("AS")) {
                        asn = "AS" + asn;
                    }
                    String place = join(first(json, "city"), first(json, "region"), first(json, "country", "country_code"));
                    String line = isp.isEmpty() ? asn : (asn.isEmpty() ? isp : isp + " · " + asn);
                    long ms = Math.max(1, System.currentTimeMillis() - started);
                    String finalIsp = line.isEmpty() ? "Public address from this phone" : line;
                    String finalPlace = place.isEmpty() ? "Location unavailable" : place;
                    runOnUiThread(() -> {
                        egressIp.setText(ip);
                        egressMeta.setText(finalIsp);
                        egressPlace.setText(finalPlace);
                        egressMs.setText(ms + " ms");
                    });
                    return;
                } catch (Exception ignored) {
                    // try the next lookup
                }
            }
            runOnUiThread(() -> {
                egressIp.setText("Unavailable");
                egressMeta.setText("Could not read this phone’s address");
                egressMs.setText("—");
            });
        });
    }

    private void start() {
        String user = mobile.getText().toString().trim();
        String secret = password.getText().toString();
        if (user.isEmpty()) return;
        if (secret.length() < 6 || secret.length() > 20) {
            passwordHint.setText("Use 6–20 characters. Anything else never reaches the account.");
            passwordHint.setTextColor(0xFFE07A68);
            return;
        }
        passwordHint.setText("6–20 characters.");
        passwordHint.setTextColor(0xFFA89884);
        HostParser.Parsed parsed = HostParser.parse(hosts.getText().toString());
        if (parsed.targets.isEmpty()) return;
        stop.set(false);
        results.removeAllViews();
        done = 0;
        total = parsed.targets.size();
        loginOk = 0;
        failed = 0;
        dead = 0;
        captchaCount = 0;
        pingSum = 0;
        for (int i = 0; i < lanes.length; i++) lanes[i] = "";
        startedAt = System.currentTimeMillis();
        running = true;
        teleStatus.setText("LIVE");
        paintBoard();
        handler.removeCallbacks(tick);
        handler.post(tick);
        for (HostParser.Rejected rejected : parsed.rejected) {
            addCard(rejected.input, "Blocked", rejected.reason, "", null, null, 0, false);
        }
        run.setEnabled(false);
        stopButton.setVisibility(View.VISIBLE);
        executor.execute(() -> {
            ExecutorService pool = Executors.newFixedThreadPool(4);
            List<Future<ProbeClient.Prep>> futures = new ArrayList<>();
            for (HostParser.Target target : parsed.targets) {
                futures.add(pool.submit(() -> {
                    int slot = claimLane("READ " + target.host);
                    try {
                        return ProbeClient.prepare(target.host, target.merchantId);
                    } finally {
                        releaseLane(slot);
                    }
                }));
            }
            List<ProbeClient.Prep> ready = new ArrayList<>();
            Map<String, String> seenMerchant = new HashMap<>();
            for (Future<ProbeClient.Prep> future : futures) {
                if (stop.get()) break;
                try {
                    ProbeClient.Prep prep = future.get();
                    if (prep.skip != null) {
                        addCard(prep.skip.host, prep.skip.verdict, prep.skip.message, prep.skip.endpoint,
                                prep.skip.merchantId, prep.skip.httpStatus, prep.skip.ms);
                    } else if (prep.merchantId != null && seenMerchant.containsKey(prep.merchantId)) {
                        addCard(prep.host, "Unclear",
                                "Same merchant " + prep.merchantId + " as " + seenMerchant.get(prep.merchantId) + ". No second login was sent.",
                                prep.endpoint, prep.merchantId, null, 0);
                    } else {
                        if (prep.merchantId != null) seenMerchant.put(prep.merchantId, prep.host);
                        ready.add(prep);
                    }
                } catch (Exception error) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
            pool.shutdownNow();
            long nextAt = 0;
            for (ProbeClient.Prep prep : ready) {
                if (stop.get()) break;
                long wait = nextAt - System.currentTimeMillis();
                if (wait > 0) {
                    try {
                        Thread.sleep(wait);
                    } catch (InterruptedException error) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
                if (stop.get()) break;
                int slot = claimLane("LOGIN " + prep.host);
                setLabel("Checking " + prep.host);
                try {
                    ProbeClient.Result result;
                    if (prep.needsCaptcha) {
                        runOnUiThread(() -> teleStatus.setText("CAPTCHA"));
                        String token = CaptchaSheet.ask(this, prep.host);
                        runOnUiThread(() -> teleStatus.setText(running ? "LIVE" : "STANDBY"));
                        if (token == null) {
                            addCard(prep.host, "Captcha", "Captcha cancelled. This host was not checked.",
                                    prep.endpoint, prep.merchantId, null, 0);
                            continue;
                        }
                        result = ProbeClient.login(prep.host, prep.endpoint, prep.merchantId, user, secret, token);
                    } else {
                        result = ProbeClient.login(prep.host, prep.endpoint, prep.merchantId, user, secret, null);
                        if ("Captcha".equals(result.verdict) && !stop.get()) {
                            runOnUiThread(() -> teleStatus.setText("CAPTCHA"));
                            String token = CaptchaSheet.ask(this, prep.host);
                            runOnUiThread(() -> teleStatus.setText(running ? "LIVE" : "STANDBY"));
                            if (token == null) {
                                addCard(prep.host, "Captcha", "Captcha cancelled. No further attempt was sent.",
                                        prep.endpoint, prep.merchantId, result.httpStatus, result.ms);
                                continue;
                            }
                            result = ProbeClient.login(prep.host, prep.endpoint, prep.merchantId, user, secret, token);
                        }
                    }
                    addCard(result.host, result.verdict, result.message, result.endpoint, result.merchantId, result.httpStatus, result.ms);
                    if (result.stop) break;
                    nextAt = System.currentTimeMillis() + 400;
                } finally {
                    releaseLane(slot);
                }
            }
            runOnUiThread(() -> {
                running = false;
                handler.removeCallbacks(tick);
                teleStatus.setText("STANDBY");
                paintBoard();
                run.setEnabled(true);
                run.setText("Check hosts");
                stopButton.setVisibility(View.GONE);
                for (int i = 0; i < lanes.length; i++) lanes[i] = "";
                paintBoard();
            });
        });
    }

    private int claimLane(String label) {
        synchronized (lanes) {
            for (int i = 0; i < lanes.length; i++) {
                if (lanes[i].isEmpty()) {
                    lanes[i] = label;
                    runOnUiThread(this::paintBoard);
                    return i;
                }
            }
            lanes[0] = label;
            runOnUiThread(this::paintBoard);
            return 0;
        }
    }

    private void releaseLane(int slot) {
        synchronized (lanes) {
            if (slot >= 0 && slot < lanes.length) lanes[slot] = "";
        }
        runOnUiThread(this::paintBoard);
    }

    private void paintBoard() {
        long elapsedMs = running ? System.currentTimeMillis() - startedAt : (startedAt == 0 ? 0 : System.currentTimeMillis() - startedAt);
        if (!running && startedAt > 0 && teleElapsed.getText().length() > 0 && done > 0 && !running) {
            // freeze is applied by the last paint while running just stopped; keep the last shown value if already frozen
        }
        double seconds = running || startedAt == 0 ? elapsedMs / 1000.0 : parseSeconds(teleElapsed.getText().toString(), elapsedMs / 1000.0);
        if (running) seconds = elapsedMs / 1000.0;
        teleElapsed.setText(String.format(java.util.Locale.US, "%.1fs", seconds));
        int left = Math.max(0, total - done);
        String ping = done == 0 ? "—" : (pingSum / done) + " ms";
        String speed = !running || seconds < 0.2 || done == 0 ? "—" : String.format(java.util.Locale.US, "%.1f/s", done / seconds);
        teleStats.setText("DONE " + done + "/" + total + "    QUEUE " + left + " left\nAVG PING " + ping + "    SPEED " + speed);
        StringBuilder lanesText = new StringBuilder();
        for (int i = 0; i < lanes.length; i++) {
            if (i > 0) lanesText.append('\n');
            String lane = lanes[i];
            if (lane.isEmpty()) lanesText.append("W").append(i + 1).append(" IDLE  Waiting for host…");
            else lanesText.append("W").append(i + 1).append(" ").append(lane);
        }
        teleLanes.setText(lanesText.toString());
        teleOutcomes.setText("LOGIN " + loginOk + "   FAILED " + failed + "   DEAD " + dead + "   CAPTCHA " + captchaCount);
    }

    private double parseSeconds(String text, double fallback) {
        try {
            return Double.parseDouble(text.replace("s", ""));
        } catch (Exception error) {
            return fallback;
        }
    }

    private void setLabel(String text) {
        runOnUiThread(() -> run.setText(text));
    }

    private void addCard(String host, String verdict, String message, String endpoint, String merchantId,
                         Integer status, long ms) {
        addCard(host, verdict, message, endpoint, merchantId, status, ms, true);
    }

    private void addCard(String host, String verdict, String message, String endpoint, String merchantId,
                         Integer status, long ms, boolean tally) {
        runOnUiThread(() -> {
            if (isFinishing()) return;
            if (tally) {
                done += 1;
                pingSum += Math.max(0, ms);
                if ("Accepted".equals(verdict)) loginOk += 1;
                else if ("Captcha".equals(verdict)) captchaCount += 1;
                else if ("Unreachable".equals(verdict) || "Blocked".equals(verdict)) dead += 1;
                else if ("Rejected".equals(verdict) || "Refused".equals(verdict) || "No account".equals(verdict) || "Length".equals(verdict)) {
                    failed += 1;
                }
                paintBoard();
            }
            LinearLayout card = new LinearLayout(this);
            card.setOrientation(LinearLayout.VERTICAL);
            card.setBackgroundResource(R.drawable.card_bg);
            int pad = dp(14);
            card.setPadding(pad, pad, pad, pad);
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            params.topMargin = dp(8);
            card.setLayoutParams(params);

            TextView title = new TextView(this);
            title.setText(verdict + "  ·  " + host);
            title.setTextColor(colorFor(verdict));
            title.setTextSize(14);
            title.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
            card.addView(title);

            TextView body = new TextView(this);
            body.setText(message);
            body.setTextColor(0xFFF6F0E6);
            body.setTextSize(14);
            body.setPadding(0, dp(8), 0, 0);
            card.addView(body);

            String meta = "Merchant " + (merchantId == null ? "—" : merchantId)
                    + "   ·   " + (status == null ? "—" : status)
                    + "   ·   " + ms + " ms";
            TextView facts = new TextView(this);
            facts.setText(meta);
            facts.setTextColor(0xFFA89884);
            facts.setTextSize(12);
            facts.setPadding(0, dp(8), 0, 0);
            card.addView(facts);

            if (endpoint != null && !endpoint.isEmpty()) {
                TextView url = new TextView(this);
                url.setText(endpoint);
                url.setTextColor(0xFFA89884);
                url.setTextSize(11);
                url.setTypeface(Typeface.MONOSPACE);
                url.setPadding(0, dp(6), 0, 0);
                card.addView(url);
            }
            results.addView(card, 0);
        });
    }

    private int colorFor(String verdict) {
        if ("Accepted".equals(verdict)) return 0xFFE0A04A;
        if ("Captcha".equals(verdict) || "Refused".equals(verdict)) return 0xFFF0C27A;
        if ("Rejected".equals(verdict) || "Blocked".equals(verdict) || "No account".equals(verdict) || "Length".equals(verdict)) {
            return 0xFFE07A68;
        }
        return 0xFFA89884;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private static String readAll(InputStream in) throws Exception {
        if (in == null) return "";
        byte[] buf = new byte[4096];
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        int n;
        while ((n = in.read(buf)) != -1 && out.size() < 200_000) out.write(buf, 0, n);
        in.close();
        return out.toString(StandardCharsets.UTF_8);
    }

    private static String maskFrom(String ua) {
        Matcher chrome = Pattern.compile("Chrome/(\\d+\\.\\d+)").matcher(ua);
        String browser = chrome.find() ? "Chrome " + chrome.group(1) : "Android browser";
        return browser + " · Android";
    }

    private static String first(JSONObject json, String... keys) {
        for (String key : keys) {
            String value = json.optString(key, "");
            if (!value.isEmpty() && !"null".equals(value)) return value;
        }
        return "";
    }

    private static String join(String... parts) {
        StringBuilder out = new StringBuilder();
        for (String part : parts) {
            if (part == null || part.isEmpty()) continue;
            if (out.length() > 0) out.append(", ");
            out.append(part);
        }
        return out.toString();
    }
}
