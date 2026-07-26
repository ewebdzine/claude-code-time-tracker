/**
 * Render social slides (1080x1920 vertical) to docs/social/slide-NN.png.
 * Uses the demo screenshots in docs/screenshots/. No dev server needed.
 *
 *   node scripts/slides.mjs
 */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SHOTS = path.join(ROOT, "docs/screenshots");
const OUT = path.join(ROOT, "docs/social");
fs.mkdirSync(OUT, { recursive: true });

const dataUri = (file) => {
  const b = fs.readFileSync(path.join(SHOTS, file));
  return `data:image/png;base64,${b.toString("base64")}`;
};

const ACCENT = "#7c8cff";
const slides = [
  {
    kind: "title",
    eyebrow: "OPEN SOURCE · FOR CLAUDE CODE",
    title: "Claude Code<br>Time Tracker",
    caption: "See how long you <em>and Claude</em><br>actually worked.",
    foot: "Built from your ~/.claude logs — nothing to install.",
  },
  {
    kind: "feature",
    n: "01",
    title: "Active hours,<br>not wall-clock",
    caption: "Idle gaps don’t count. Totals per project, per day, per session.",
    img: "overview.png",
  },
  {
    kind: "feature",
    n: "02",
    title: "A calendar of<br>when you worked",
    caption: "Every session placed by the hour it actually ran — week or day view.",
    img: "calendar-week.png",
    tall: true,
  },
  {
    kind: "feature",
    n: "03",
    title: "Dive into<br>any project",
    caption: "One click scopes the entire dashboard to a single project.",
    img: "project-drilldown.png",
  },
  {
    kind: "feature",
    n: "04",
    title: "Every session,<br>decoded",
    caption: "Tokens, tool activity, canon references, and desktop-vs-CLI — per session.",
    img: "session-modal.png",
    tall: true,
  },
  {
    kind: "feature",
    n: "05",
    title: "How well did<br>you prompt?",
    caption:
      'Optional AI-graded <span class="dots"><i class="g"></i><i class="y"></i><i class="r"></i></span> ratings and a coaching note for every session.',
    img: "sessions.png",
  },
  {
    kind: "outro",
    eyebrow: "PRIVATE BY DEFAULT",
    title: "Your data<br>never leaves<br>your machine",
    caption: "Run it locally, snapshot it, or self-host behind a magic-link login.",
    foot: "★ github.com/ewebdzine/claude-code-time-tracker",
  },
];

function html(s) {
  const brand = `
    <div class="brand">
      <span class="logo"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3.2 2"/></svg></span>
      <span>Claude Code Time Tracker</span>
    </div>`;

  const win = s.img
    ? `<div class="window ${s.tall ? "tall" : ""}">
         <div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></div>
         <div class="shot"><img src="${dataUri(s.img)}"/></div>
       </div>`
    : "";

  if (s.kind === "feature") {
    return `<div class="slide feature">
      ${brand}
      <div class="head">
        <div class="num">${s.n}</div>
        <h1>${s.title}</h1>
        <p class="cap">${s.caption}</p>
      </div>
      ${win}
      <div class="foot"><span>claude-code-time-tracker.vercel.app</span></div>
    </div>`;
  }
  // title / outro — centered
  return `<div class="slide center ${s.kind}">
    ${brand}
    <div class="mid">
      ${s.eyebrow ? `<div class="eyebrow">${s.eyebrow}</div>` : ""}
      <h1>${s.title}</h1>
      <p class="cap">${s.caption}</p>
    </div>
    <div class="foot big"><span>${s.foot}</span></div>
  </div>`;
}

const css = `
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1080px; height:1920px; }
  .slide {
    width:1080px; height:1920px; position:relative;
    background:radial-gradient(120% 80% at 50% 0%, #14141c 0%, #0b0b10 55%, #070709 100%);
    color:#fff; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    padding:110px 90px 96px; display:flex; flex-direction:column;
    overflow:hidden;
  }
  .brand { display:flex; align-items:center; gap:16px; font-size:30px; font-weight:600; color:#c7c7d2; letter-spacing:.2px; }
  .brand .logo {
    width:56px; height:56px; border-radius:14px; display:grid; place-items:center; font-size:30px;
    background:linear-gradient(160deg, ${ACCENT}, #4d5bd6); box-shadow:0 8px 24px rgba(124,140,255,.35);
  }
  h1 { font-size:104px; line-height:1.02; font-weight:800; letter-spacing:-1.5px; }
  .feature h1 { font-size:92px; }
  .cap { font-size:44px; line-height:1.35; color:#b6b6c2; font-weight:400; margin-top:26px; max-width:900px; }
  .cap em { color:#fff; font-style:normal; }
  .eyebrow { font-size:26px; letter-spacing:4px; color:${ACCENT}; font-weight:700; margin-bottom:30px; }

  .feature .head { margin-top:56px; }
  .feature .num { font-size:34px; font-weight:800; color:${ACCENT}; letter-spacing:2px; margin-bottom:14px; }
  .feature .window { margin-top:auto; margin-bottom:26px; }

  .window {
    background:#101015; border:1px solid #ffffff1a; border-radius:22px; overflow:hidden;
    box-shadow:0 40px 90px rgba(0,0,0,.55); align-self:center; width:100%;
  }
  .window .bar { height:52px; display:flex; align-items:center; gap:12px; padding:0 22px; background:#17171e; border-bottom:1px solid #ffffff12; }
  .window .bar i { width:16px; height:16px; border-radius:50%; display:block; }
  .window .shot { display:grid; place-items:center; background:#0c0c11; }
  .window .shot img { max-width:100%; max-height:840px; display:block; }
  .window.tall .shot img { max-height:1160px; }

  .cap .dots { display:inline-flex; gap:10px; vertical-align:middle; margin:0 6px; }
  .cap .dots i { width:26px; height:26px; border-radius:50%; display:inline-block; }
  .cap .dots i.g { background:#3fb950; } .cap .dots i.y { background:#d29922; } .cap .dots i.r { background:#f85149; }

  .center { align-items:flex-start; }
  .center .mid { margin:auto 0; }
  .foot { margin-top:auto; font-size:30px; color:#7d7d8a; }
  .foot.big { font-size:34px; color:#9a9aa6; font-weight:600; }
`;

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 2 });

for (let i = 0; i < slides.length; i++) {
  const doc = `<!doctype html><html><head><meta charset="utf8"><style>${css}</style></head><body>${html(slides[i])}</body></html>`;
  await page.setContent(doc, { waitUntil: "networkidle" });
  await page.waitForTimeout(250);
  const file = `slide-${String(i + 1).padStart(2, "0")}.png`;
  await page.screenshot({ path: path.join(OUT, file) });
  console.log("✓", file);
}
await browser.close();
console.log("done —", slides.length, "slides in docs/social/");
