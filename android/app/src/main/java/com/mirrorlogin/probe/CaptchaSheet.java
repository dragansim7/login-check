package com.mirrorlogin.probe;

import android.app.Activity;
import android.app.Dialog;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

final class CaptchaSheet {
    private CaptchaSheet() {}

    static String ask(Activity activity, String host) {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> token = new AtomicReference<>();
        new Handler(Looper.getMainLooper()).post(() -> {
            if (activity.isFinishing()) {
                latch.countDown();
                return;
            }
            present(activity, host, value -> {
                token.set(value);
                latch.countDown();
            });
        });
        try {
            if (!latch.await(4, TimeUnit.MINUTES)) return null;
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            return null;
        }
        return token.get();
    }

    private static void present(Activity activity, String host, Result callback) {
        Dialog dialog = new Dialog(activity);
        dialog.setCancelable(false);
        LinearLayout root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xFF14110E);
        int pad = Math.round(16 * activity.getResources().getDisplayMetrics().density);
        root.setPadding(pad, pad, pad, pad);

        TextView title = new TextView(activity);
        title.setText("Captcha for " + host);
        title.setTextColor(0xFFF6F0E6);
        title.setTextSize(16);
        root.addView(title);

        TextView body = new TextView(activity);
        body.setText("The run stays on this host. Open the puzzle, solve it, then the login is sent. Cancel skips only this host.");
        body.setTextColor(0xFFA89884);
        body.setTextSize(13);
        body.setPadding(0, pad / 2, 0, pad / 2);
        root.addView(body);

        WebView web = new WebView(activity);
        LinearLayout.LayoutParams webParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, Math.round(220 * activity.getResources().getDisplayMetrics().density));
        web.setLayoutParams(webParams);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.setBackgroundColor(0xFF14110E);
        root.addView(web);

        LinearLayout row = new LinearLayout(activity);
        row.setOrientation(LinearLayout.HORIZONTAL);
        Button open = new Button(activity);
        open.setText("Open puzzle");
        open.setAllCaps(false);
        open.setBackgroundColor(0xFFE0A04A);
        open.setTextColor(0xFF1A1208);
        Button cancel = new Button(activity);
        cancel.setText("Cancel");
        cancel.setAllCaps(false);
        cancel.setTextColor(0xFFF6F0E6);
        LinearLayout.LayoutParams openParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        openParams.rightMargin = pad / 2;
        row.addView(open, openParams);
        row.addView(cancel, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(row);

        final boolean[] finished = {false};
        Runnable finish = () -> {
            if (finished[0]) return;
            finished[0] = true;
            web.destroy();
            dialog.dismiss();
        };
        web.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void onToken(String value) {
                if (finished[0] || value == null || value.length() < 20 || value.contains("\"failover\":\"T\"")) return;
                activity.runOnUiThread(() -> {
                    callback.onResult(value);
                    finish.run();
                });
            }
        }, "ProbeCaptcha");
        open.setOnClickListener(view -> web.evaluateJavascript(
                "opened=Date.now();var button=document.getElementById('captcha-button');if(button)button.click();", null));
        cancel.setOnClickListener(view -> {
            callback.onResult(null);
            finish.run();
        });
        dialog.setContentView(root);
        dialog.show();
        web.loadDataWithBaseURL("https://o.alicdn.com", page(), "text/html", "utf-8", null);
    }

    private static String page() {
        return "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
                + "<script>window.AliyunCaptchaConfig={region:'sgp',prefix:'16dibs8'};</script>"
                + "<script src='https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js'></script>"
                + "</head><body style='margin:0;background:#14110e;color:#f6f0e6'>"
                + "<div id='captcha-element'></div><button id='captcha-button' style='display:none'></button>"
                + "<script>var opened=0;function boot(){if(!window.initAliyunCaptcha){setTimeout(boot,200);return;}"
                + "initAliyunCaptcha({SceneId:'dz5ch7sdh',prefix:'16dibs8',mode:'popup',region:'sgp',language:'en',"
                + "element:'#captcha-element',button:'#captcha-button',"
                + "captchaVerifyCallback:function(token){var value=typeof token==='string'?token:'';"
                + "if(!value||value.indexOf('failover')>=0||opened===0||Date.now()-opened<800){"
                + "return {captchaResult:false,bizResult:false};}"
                + "ProbeCaptcha.onToken(value);return {captchaResult:true,bizResult:true};}});}boot();</script>"
                + "</body></html>";
    }

    private interface Result {
        void onResult(String token);
    }
}
