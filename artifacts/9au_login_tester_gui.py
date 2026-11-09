#!/usr/bin/env python3
"""
9AU Multi-Domain Login Tester (GUI)
Paste domains (one per line) like:
  9au.com
  9au.com/RF12345667
  https://other-site.com/anything

It normalizes them and tests the login API.
"""

import tkinter as tk
from tkinter import scrolledtext, messagebox, ttk
import requests
import threading
from urllib.parse import urlparse

def normalize_domain(raw):
    """Turn '9au.com', '9au.com/RF123...', 'https://9au.com/foo' into 'https://9au.com'"""
    raw = raw.strip()
    if not raw:
        return None
    if not raw.startswith(("http://", "https://")):
        raw = "https://" + raw
    parsed = urlparse(raw)
    if not parsed.netloc:
        return None
    return f"https://{parsed.netloc}"

def test_login(mobile, password, domain, timeout=15):
    url = f"{domain.rstrip('/')}/api/v1/index.php"
    data = {
        "mobile": mobile,
        "password": password,
        "module": "/users/login",
        "merchantId": "10520",
        "accessId": "",
        "accessToken": "",
        "walletIsAdmin": ""
    }
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Origin": domain,
        "Referer": domain + "/",
    }
    try:
        r = requests.post(url, data=data, headers=headers, timeout=timeout)
        text = r.text.strip()
        likely_success = (
            r.status_code == 200
            and "error" not in text.lower()
            and "invalid" not in text.lower()
            and "fail" not in text.lower()
        )
        return {
            "status_code": r.status_code,
            "response": text[:400],
            "likely_success": likely_success
        }
    except requests.exceptions.RequestException as e:
        return {"error": str(e)}

class LoginTesterApp:
    def __init__(self, root):
        self.root = root
        self.root.title("9AU Multi-Domain Login Tester")
        self.root.geometry("800x650")
        self.root.minsize(700, 550)

        # Credentials
        cred_frame = ttk.LabelFrame(root, text="Credentials", padding=10)
        cred_frame.pack(fill="x", padx=10, pady=5)

        ttk.Label(cred_frame, text="Mobile / Username:").grid(row=0, column=0, sticky="w")
        self.mobile_entry = ttk.Entry(cred_frame, width=40)
        self.mobile_entry.grid(row=0, column=1, padx=5, pady=2, sticky="ew")

        ttk.Label(cred_frame, text="Password:").grid(row=1, column=0, sticky="w")
        self.password_entry = ttk.Entry(cred_frame, width=40, show="*")
        self.password_entry.grid(row=1, column=1, padx=5, pady=2, sticky="ew")
        cred_frame.columnconfigure(1, weight=1)

        # Domains
        domain_frame = ttk.LabelFrame(root, text="Domains (one per line — paste freely)", padding=10)
        domain_frame.pack(fill="both", expand=True, padx=10, pady=5)

        self.domains_text = scrolledtext.ScrolledText(domain_frame, height=8, wrap="none")
        self.domains_text.pack(fill="both", expand=True)
        self.domains_text.insert("1.0", "9au.com\n9au.com/RF12345667\n")

        # Buttons
        btn_frame = ttk.Frame(root)
        btn_frame.pack(fill="x", padx=10, pady=5)

        self.test_btn = ttk.Button(btn_frame, text="Test All Domains", command=self.start_test)
        self.test_btn.pack(side="left", padx=5)

        self.clear_btn = ttk.Button(btn_frame, text="Clear Results", command=self.clear_results)
        self.clear_btn.pack(side="left", padx=5)

        # Results
        results_frame = ttk.LabelFrame(root, text="Results", padding=10)
        results_frame.pack(fill="both", expand=True, padx=10, pady=5)

        self.results_text = scrolledtext.ScrolledText(results_frame, height=15, state="disabled", wrap="word")
        self.results_text.pack(fill="both", expand=True)

        self.status_var = tk.StringVar(value="Ready")
        status_bar = ttk.Label(root, textvariable=self.status_var, relief="sunken", anchor="w")
        status_bar.pack(fill="x", side="bottom")

    def log(self, message):
        self.results_text.config(state="normal")
        self.results_text.insert("end", message + "\n")
        self.results_text.see("end")
        self.results_text.config(state="disabled")
        self.root.update_idletasks()

    def clear_results(self):
        self.results_text.config(state="normal")
        self.results_text.delete("1.0", "end")
        self.results_text.config(state="disabled")
        self.status_var.set("Ready")

    def start_test(self):
        mobile = self.mobile_entry.get().strip()
        password = self.password_entry.get().strip()
        if not mobile or not password:
            messagebox.showwarning("Missing info", "Enter mobile/username and password.")
            return

        raw_domains = self.domains_text.get("1.0", "end").strip().splitlines()
        domains = []
        for line in raw_domains:
            norm = normalize_domain(line)
            if norm and norm not in domains:
                domains.append(norm)

        if not domains:
            messagebox.showwarning("No domains", "Paste at least one domain.")
            return

        self.test_btn.config(state="disabled")
        self.status_var.set(f"Testing {len(domains)} domain(s)...")
        self.clear_results()
        self.log(f"Testing {len(domains)} domain(s) with user: {mobile}\n" + "="*50)

        # Run in background so GUI stays responsive
        thread = threading.Thread(target=self.run_tests, args=(mobile, password, domains), daemon=True)
        thread.start()

    def run_tests(self, mobile, password, domains):
        for i, domain in enumerate(domains, 1):
            self.root.after(0, lambda d=domain, n=i, total=len(domains): 
                            self.status_var.set(f"Testing {n}/{total}: {d}"))
            self.root.after(0, lambda d=domain: self.log(f"\n[{d}]"))

            result = test_login(mobile, password, domain)

            if "error" in result:
                msg = f"  ERROR: {result['error']}"
            else:
                success = "YES" if result["likely_success"] else "NO"
                msg = (f"  Status: {result['status_code']}\n"
                       f"  Likely success: {success}\n"
                       f"  Response: {result['response']}")

            self.root.after(0, lambda m=msg: self.log(m))

        self.root.after(0, lambda: self.status_var.set("Done"))
        self.root.after(0, lambda: self.test_btn.config(state="normal"))

def main():
    root = tk.Tk()
    app = LoginTesterApp(root)
    root.mainloop()

if __name__ == "__main__":
    main()
