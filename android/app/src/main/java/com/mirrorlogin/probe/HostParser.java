package com.mirrorlogin.probe;

import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class HostParser {
    static final class Target {
        final String host;
        final String merchantId;

        Target(String host, String merchantId) {
            this.host = host;
            this.merchantId = merchantId;
        }
    }

    static final class Rejected {
        final String input;
        final String reason;

        Rejected(String input, String reason) {
            this.input = input;
            this.reason = reason;
        }
    }

    static final class Parsed {
        final List<Target> targets = new ArrayList<>();
        final List<Rejected> rejected = new ArrayList<>();
    }

    private static final Set<String> BLOCKED = Set.of(
            "localhost", "localhost.localdomain", "metadata.google.internal", "metadata.google");
    private static final Pattern HOST_RE = Pattern.compile(
            "^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern TAIL_ID = Pattern.compile("^(.*?)(?:[\\s,|]+)(\\d{3,8})$");

    private HostParser() {}

    static Parsed parse(String text) {
        Parsed parsed = new Parsed();
        Map<String, Target> seen = new LinkedHashMap<>();
        for (String line : text.split("\\r?\\n")) {
            String original = line.trim();
            if (original.isEmpty() || original.startsWith("#")) continue;
            Matcher split = TAIL_ID.matcher(original);
            String target = split.matches() ? split.group(1).trim() : original;
            String merchantId = split.matches() ? split.group(2) : null;
            if (target.isEmpty()) {
                parsed.rejected.add(new Rejected(original, "Not a valid host"));
                continue;
            }
            String withScheme = target.matches("(?i)https?://.*") ? target : "https://" + target;
            URI uri;
            try {
                uri = URI.create(withScheme);
            } catch (IllegalArgumentException error) {
                parsed.rejected.add(new Rejected(original, "Not a valid host"));
                continue;
            }
            if (uri.getUserInfo() != null) {
                parsed.rejected.add(new Rejected(original, "Put the login in the fields above, not the URL"));
                continue;
            }
            int port = uri.getPort();
            if (port != -1 && port != 443 && port != 80) {
                parsed.rejected.add(new Rejected(original, "Only ports 80 and 443 are allowed"));
                continue;
            }
            String host = uri.getHost();
            if (host == null) {
                parsed.rejected.add(new Rejected(original, "Not a valid host"));
                continue;
            }
            host = host.replaceAll("\\.$", "").toLowerCase(Locale.US);
            if (!isPublic(host)) {
                parsed.rejected.add(new Rejected(original, "That host is not allowed"));
                continue;
            }
            seen.putIfAbsent(host, new Target(host, merchantId));
        }
        parsed.targets.addAll(seen.values());
        return parsed;
    }

    static boolean isPrivateIpv4(String ip) {
        String[] parts = ip.split("\\.");
        if (parts.length != 4) return false;
        int a;
        int b;
        try {
            a = Integer.parseInt(parts[0]);
            b = Integer.parseInt(parts[1]);
            int c = Integer.parseInt(parts[2]);
            int d = Integer.parseInt(parts[3]);
            if (a < 0 || b < 0 || c < 0 || d < 0 || a > 255 || b > 255 || c > 255 || d > 255) return false;
        } catch (NumberFormatException error) {
            return false;
        }
        if (a == 0 || a == 10 || a == 127) return true;
        if (a == 169 && b == 254) return true;
        if (a == 172 && b >= 16 && b <= 31) return true;
        if (a == 192 && b == 168) return true;
        return a == 100 && b >= 64 && b <= 127;
    }

    private static boolean isPublic(String host) {
        if (BLOCKED.contains(host)) return false;
        if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) return false;
        if (host.indexOf(':') >= 0) return false;
        if (host.matches("\\d{1,3}(\\.\\d{1,3}){3}")) return !isPrivateIpv4(host);
        return HOST_RE.matcher(host).matches();
    }
}
