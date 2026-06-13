/* Authenticated UI review: creates a throwaway test user, forges real
 * @supabase/ssr cookies, and screenshots the redesigned surfaces. */
const fs = require("fs");
const path = require("path");

// Minimal .env.local loader
for (const line of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = "ui-review@eternavoice.test";
const PASSWORD = "ui-review-Passw0rd!";

async function getAuthCookies() {
  const { createClient } = require("@supabase/supabase-js");
  const admin = createClient(SUPABASE_URL, SERVICE);
  const { error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error && !/already.*registered|exists/i.test(error.message)) {
    console.log("createUser:", error.message);
  }

  const { createServerClient } = require("@supabase/ssr");
  const jar = [];
  const ssr = createServerClient(SUPABASE_URL, ANON, {
    cookies: {
      getAll: () => jar,
      setAll: (cs) => {
        for (const c of cs) jar.push({ name: c.name, value: c.value });
      },
    },
  });
  const { error: signInErr } = await ssr.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (signInErr) throw new Error("signIn failed: " + signInErr.message);
  return jar;
}

async function main() {
  const cookies = await getAuthCookies();
  console.log("auth cookies:", cookies.map((c) => c.name).join(", "));

  const puppeteer = require("puppeteer");
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    headless: "new",
  });

  const targets = [
    { url: "/", file: "rd-landing-desktop.png", w: 1440, h: 900, full: true },
    { url: "/", file: "rd-landing-mobile.png", w: 390, h: 844, full: true },
    { url: "/auth/login", file: "rd-login-desktop.png", w: 1440, h: 900 },
    { url: "/people", file: "rd-people-desktop.png", w: 1440, h: 900, auth: true },
    { url: "/people", file: "rd-people-mobile.png", w: 390, h: 844, auth: true },
    { url: "/people/new", file: "rd-wizard-who-desktop.png", w: 1440, h: 900, auth: true },
    { url: "/people/new", file: "rd-wizard-who-mobile.png", w: 390, h: 844, auth: true },
    { url: "/account", file: "rd-account-mobile.png", w: 390, h: 844, auth: true },
    { url: "/subscribe", file: "rd-subscribe-mobile.png", w: 390, h: 844, auth: true },
  ];

  for (const t of targets) {
    const page = await browser.newPage();
    await page.setViewport({ width: t.w, height: t.h });
    if (t.auth) {
      await page.setCookie(
        ...cookies.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })),
      );
    }
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://localhost:3000" + t.url, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 2200));
    await page.screenshot({
      path: path.join(__dirname, "..", "screenshots", t.file),
      fullPage: Boolean(t.full),
    });
    console.log("done:", t.file, "→", page.url(), errors.length ? "ERRORS: " + errors.join(" | ") : "");
    await page.close();
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
