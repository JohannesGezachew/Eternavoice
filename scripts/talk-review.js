/* Visual review of /people + talk surfaces: forges auth cookies via a
 * throwaway Supabase user, seeds a local zustand session so the talk page
 * renders fully, and screenshots every state at multiple breakpoints. */
const fs = require("fs");
const path = require("path");

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

// Fake local session: one person + two conversations so the talk page,
// history drawer, and transcript all render with content.
const NOW = Date.now();
const SESSION = {
  state: {
    voiceId: "fake-voice-id",
    voiceCreatedAt: NOW - 86400000 * 12,
    voiceName: "Margaret",
    activeSubjectId: null,
    voices: [{ id: "fake-voice-id", name: "Margaret", createdAt: NOW - 86400000 * 12 }],
    persona: {
      mode: "persona",
      name: "Margaret",
      relationship: "My grandmother",
      description: "Warm, dry-witted, loved her garden.",
    },
    turns: [
      { id: "t1", role: "assistant", content: "Oh, hello love. I was just thinking about you — come sit down and tell me everything.", createdAt: NOW - 60000 },
      { id: "t2", role: "user", content: "I got the job, Grandma. The one in Edinburgh I told you about.", createdAt: NOW - 40000 },
      { id: "t3", role: "assistant", content: "I knew you would. I never doubted it for a second — you've always been braver than you think.", createdAt: NOW - 20000 },
    ],
    conversations: [
      {
        id: "c1",
        voiceId: "fake-voice-id",
        voiceName: "Margaret",
        subjectId: null,
        persona: { mode: "persona", name: "Margaret", relationship: "My grandmother" },
        title: "I got the job, Grandma. The one in Edinburgh I told you about.",
        turns: [
          { id: "t1", role: "assistant", content: "Oh, hello love.", createdAt: NOW - 60000 },
          { id: "t2", role: "user", content: "I got the job, Grandma.", createdAt: NOW - 40000 },
          { id: "t3", role: "assistant", content: "I knew you would.", createdAt: NOW - 20000 },
        ],
        createdAt: NOW - 60000,
        updatedAt: NOW - 20000,
        pinned: true,
      },
      {
        id: "c2",
        voiceId: "fake-voice-id",
        voiceName: "Margaret",
        subjectId: null,
        persona: { mode: "persona", name: "Margaret", relationship: "My grandmother" },
        title: "Do you remember the summer at the allotment?",
        turns: [
          { id: "t4", role: "user", content: "Do you remember the summer at the allotment?", createdAt: NOW - 86400000 * 3 },
          { id: "t5", role: "assistant", content: "How could I forget? You ate half the strawberries before they ever reached a bowl.", createdAt: NOW - 86400000 * 3 },
        ],
        createdAt: NOW - 86400000 * 3,
        updatedAt: NOW - 86400000 * 3,
      },
    ],
    currentConversationId: "c1",
    memories: [],
    status: "idle",
  },
  version: 0,
};

async function main() {
  const mode = process.argv[2] || "all";
  const cookies = await getAuthCookies();
  console.log("auth ok");

  const puppeteer = require("puppeteer");
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
    headless: "new",
  });

  const shoot = async ({ url, file, w, h, auth, session, full, before }) => {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h });
    if (auth) {
      await page.setCookie(
        ...cookies.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })),
      );
    }
    if (session) {
      // Seed localStorage before app scripts run.
      await page.evaluateOnNewDocument((s) => {
        localStorage.setItem("eternavoice-session", JSON.stringify(s));
      }, SESSION);
    }
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://localhost:3000" + url, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 2500));
    if (before) await before(page);
    await page.screenshot({
      path: path.join(__dirname, "..", "screenshots", file),
      fullPage: Boolean(full),
    });
    console.log("done:", file, "→", page.url(), errors.length ? "ERRORS: " + errors.join(" | ") : "");
    await page.close();
  };

  const openHistory = async (page) => {
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll("button")];
      const b = btns.find((x) => x.getAttribute("aria-label") === "Past conversations" || x.textContent.trim() === "History");
      if (b) b.click();
    });
    await new Promise((r) => setTimeout(r, 800));
  };
  const openTranscript = async (page) => {
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll("button")];
      const b = btns.find((x) => x.getAttribute("aria-label") === "Transcript" || x.textContent.trim() === "Transcript");
      if (b) b.click();
    });
    await new Promise((r) => setTimeout(r, 800));
  };

  const targets = [
    { url: "/people", file: "cr-people-desktop.png", w: 1440, h: 900, auth: true, session: true },
    { url: "/people", file: "cr-people-mobile.png", w: 390, h: 844, auth: true, session: true },
    { url: "/people/current/talk", file: "cr-talk-desktop.png", w: 1440, h: 900, auth: true, session: true },
    { url: "/people/current/talk", file: "cr-talk-mobile.png", w: 390, h: 844, auth: true, session: true },
    { url: "/people/current/talk", file: "cr-talk-history-desktop.png", w: 1440, h: 900, auth: true, session: true, before: openHistory },
    { url: "/people/current/talk", file: "cr-talk-history-mobile.png", w: 390, h: 844, auth: true, session: true, before: openHistory },
    { url: "/people/current/talk", file: "cr-talk-transcript-mobile.png", w: 390, h: 844, auth: true, session: true, before: openTranscript },
    { url: "/", file: "cr-landing-desktop.png", w: 1440, h: 900, full: true },
    { url: "/", file: "cr-landing-mobile.png", w: 390, h: 844, full: true },
  ];

  for (const t of targets) {
    if (mode !== "all" && !t.file.includes(mode)) continue;
    await shoot(t);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
