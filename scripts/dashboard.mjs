// Renders a Health-app style "Summary" dashboard of GitHub activity as SVG.
// Usage: GH_TOKEN=... node scripts/dashboard.mjs  (writes assets/dashboard-{light,dark}.svg)
import { writeFileSync, mkdirSync } from "node:fs";

const USER = process.env.GH_USER || "Asta39";
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

const query = `query($login:String!){ user(login:$login){
  name createdAt followers{totalCount} pullRequests{totalCount}
  repositories(ownerAffiliations:OWNER,isFork:false,first:100){ totalCount nodes{ stargazerCount
    languages(first:6,orderBy:{field:SIZE,direction:DESC}){ edges{ size node{ name } } } } }
  contributionsCollection{ totalCommitContributions totalPullRequestContributions
    contributionCalendar{ totalContributions weeks{ contributionDays{ contributionCount date } } } } } }`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query, variables: { login: USER } }),
});
const { data, errors } = await res.json();
if (errors) throw new Error(JSON.stringify(errors));
const u = data.user;

// ---------- numbers ----------
const days = u.contributionsCollection.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
const last = (n) => days.slice(-n);
const sum = (a) => a.reduce((s, d) => s + d.contributionCount, 0);
const week = last(7);
const weekTotal = sum(week);
const prevWeekTotal = sum(days.slice(-14, -7));
const activeDays7 = week.filter((d) => d.contributionCount > 0).length;
const activeDays30 = last(30).filter((d) => d.contributionCount > 0).length;
let streak = 0;
for (let i = days.length - 1; i >= 0; i--) {
  if (days[i].contributionCount > 0) streak++;
  else if (i === days.length - 1) continue; // today not over yet
  else break;
}
let best = 0, run = 0;
for (const d of days) { run = d.contributionCount ? run + 1 : 0; best = Math.max(best, run); }
const yearTotal = u.contributionsCollection.contributionCalendar.totalContributions;
const stars = u.repositories.nodes.reduce((s, r) => s + r.stargazerCount, 0);
const langMap = {};
for (const r of u.repositories.nodes)
  for (const e of r.languages.edges) langMap[e.node.name] = (langMap[e.node.name] || 0) + e.size;
const langTotal = Object.values(langMap).reduce((a, b) => a + b, 0) || 1;
const langs = Object.entries(langMap).sort((a, b) => b[1] - a[1]).slice(0, 5)
  .map(([name, size]) => ({ name, pct: (size / langTotal) * 100 }));
const weekly = u.contributionsCollection.contributionCalendar.weeks.slice(-26)
  .map((w) => w.contributionDays.reduce((s, d) => s + d.contributionCount, 0));

// ---------- theme ----------
const themes = {
  light: { bg: "#F2F2F7", card: "#FFFFFF", ink: "#000000", sub: "#8E8E93", track: "#E5E5EA", grid: "#F2F2F7" },
  dark: { bg: "#000000", card: "#1C1C1E", ink: "#FFFFFF", sub: "#8E8E93", track: "#2C2C2E", grid: "#2C2C2E" },
};
const C = { red: "#FA114F", green: "#A6FF00", greenText: "#34C759", blue: "#00D8FE", orange: "#FF9500",
  purple: "#AF52DE", indigo: "#5856D6", teal: "#30B0C7", pink: "#FF2D55" };
const langColors = [C.indigo, C.teal, C.orange, C.pink, C.purple];
const FONT = `-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Inter','Helvetica Neue',Arial,sans-serif`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const fmt = (n) => n.toLocaleString("en-US");
const now = new Date();
const dateLabel = now.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Nairobi" }).toUpperCase();

function render(t) {
  const W = 880, P = 24, G = 16;
  const card = (x, y, w, h, tint, label, extra = "") => `
  <g transform="translate(${x} ${y})">
    <rect width="${w}" height="${h}" rx="20" fill="${t.card}"/>
    <circle cx="26" cy="28" r="6" fill="${tint}"/>
    <text x="40" y="33" font-size="15" font-weight="600" fill="${tint}">${label}</text>
    <text x="${w - 36}" y="33" text-anchor="end" font-size="13" fill="${t.sub}">${extra}</text>
    <path d="M${w - 26} 23 l5 5 -5 5" stroke="${t.sub}" stroke-opacity=".6" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  const big = (x, y, value, unit, color = t.ink, size = 34) =>
    `<text x="${x}" y="${y}" font-size="${size}" font-weight="700" fill="${color}" letter-spacing="-0.5">${value}<tspan font-size="16" font-weight="600" fill="${t.sub}" dx="4">${unit}</tspan></text>`;

  // Rings
  const ring = (r, frac, color, delay) => {
    const c = 2 * Math.PI * r, f = Math.min(frac, 1);
    return `<circle r="${r}" fill="none" stroke="${color}" stroke-opacity=".22" stroke-width="14"/>
    <circle r="${r}" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round" transform="rotate(-90)"
      stroke-dasharray="${c * f} ${c}" stroke-dashoffset="0"/>`;
  };
  const GOAL = 40;
  const rings = [
    { label: "Contribute", v: weekTotal, goal: GOAL, unit: `/${GOAL}`, color: C.red },
    { label: "Active days", v: activeDays7, goal: 7, unit: "/7 DAYS", color: C.green, text: C.greenText },
    { label: "Streak", v: streak, goal: 30, unit: "/30 DAYS", color: C.blue },
  ];

  // 7-day bars
  const maxDay = Math.max(1, ...week.map((d) => d.contributionCount));
  const bars = week.map((d, i) => {
    const h = Math.max(4, (d.contributionCount / maxDay) * 90);
    const wd = new Date(d.date + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "narrow", timeZone: "UTC" });
    return `<rect x="${i * 46}" y="${100 - h}" width="28" height="${h}" rx="6" fill="${C.orange}" fill-opacity="${i === 6 ? 1 : 0.55}">
      <animate attributeName="height" from="0" to="${h}" dur=".8s" begin="${0.1 * i}s" fill="freeze"/>
      <animate attributeName="y" from="100" to="${100 - h}" dur=".8s" begin="${0.1 * i}s" fill="freeze"/></rect>
      <text x="${i * 46 + 14}" y="120" text-anchor="middle" font-size="12" fill="${t.sub}">${wd}</text>`;
  }).join("");

  // trend line (26 weeks)
  const maxW = Math.max(1, ...weekly);
  const tw = W - 2 * P - 48, th = 70;
  const pts = weekly.map((v, i) => [ (i / (weekly.length - 1)) * tw, th - (v / maxW) * th ]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${tw} ${th} L0 ${th} Z`;
  const delta = weekTotal - prevWeekTotal;
  const trendWord = delta >= 0 ? "up" : "down";

  // languages stacked bar
  let lx = 0;
  const lbW = 380;
  const langBar = langs.map((l, i) => {
    const w = (l.pct / langs.reduce((s, x) => s + x.pct, 0)) * lbW;
    const r = `<rect x="${lx}" y="0" width="${Math.max(w - 3, 2)}" height="14" rx="4" fill="${langColors[i]}"/>`;
    lx += w; return r;
  }).join("");
  const langList = langs.map((l, i) => `
    <g transform="translate(${(i % 2) * 200} ${Math.floor(i / 2) * 26})">
      <circle cx="5" cy="-4" r="5" fill="${langColors[i]}"/>
      <text x="16" y="1" font-size="14" fill="${t.ink}">${esc(l.name)}</text>
      <text x="180" y="1" text-anchor="end" font-size="14" fill="${t.sub}">${l.pct.toFixed(0)}%</text></g>`).join("");

  const colW = (W - 2 * P - G) / 2;
  const y1 = 128, h1 = 230, y2 = y1 + h1 + G, h2 = 240, y3 = y2 + h2 + G, h3 = 150, y4 = y3 + h3 + G, h4 = 96;
  const H = y4 + h4 + P;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
  <rect width="${W}" height="${H}" rx="32" fill="${t.bg}"/>
  <text x="${P}" y="48" font-size="13" font-weight="600" fill="${t.sub}" letter-spacing=".4">${dateLabel}</text>
  <text x="${P}" y="90" font-size="38" font-weight="800" fill="${t.ink}" letter-spacing="-1">Summary</text>
  <text x="${P + 178}" y="90" font-size="17" fill="${t.sub}">Ian Love · Evoq Studio, Nairobi</text>
  <g transform="translate(${W - P - 22} 72)">
    <circle r="22" fill="url(#av)"/><text y="6" text-anchor="middle" font-size="16" font-weight="700" fill="#fff">IL</text></g>
  <defs><linearGradient id="av" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8E8E93"/><stop offset="1" stop-color="#48484A"/></linearGradient>
    <linearGradient id="tr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.indigo}" stop-opacity=".35"/><stop offset="1" stop-color="${C.indigo}" stop-opacity="0"/></linearGradient></defs>

  ${card(P, y1, W - 2 * P, h1, C.red, "Activity", "This week")}
    <g transform="translate(116 130)">${ring(66, rings[0].v / rings[0].goal, C.red, 0)}${ring(48, rings[1].v / rings[1].goal, C.green, 0.15)}${ring(30, rings[2].v / rings[2].goal, C.blue, 0.3)}</g>
    ${rings.map((r, i) => `<g transform="translate(${250 + i * 196} 10)">
      <text x="0" y="90" font-size="15" font-weight="600" fill="${t.ink}">${r.label}</text>
      ${big(0, 132, r.v, r.unit, r.text || r.color, 36)}
      <text x="0" y="160" font-size="13" fill="${t.sub}">${i === 0 ? `${delta >= 0 ? "+" : ""}${delta} vs last week` : i === 1 ? `${activeDays30} of last 30 days` : `Best run ${best} days`}</text></g>`).join("")}
  </g>

  ${card(P, y2, colW, h2, C.orange, "Contributions", "Last 7 days")}
    ${big(24, 82, weekTotal, "this week")}
    <g transform="translate(24 106)"><g transform="translate(0 0)">${bars}</g></g>
  </g>

  ${card(P + colW + G, y2, colW, h2, C.indigo, "Languages", `${u.repositories.totalCount} repos`)}
    ${big(24, 82, esc(langs[0]?.name || "—"), `${(langs[0]?.pct || 0).toFixed(0)}%`)}
    <g transform="translate(24 104)">${langBar}</g>
    <g transform="translate(24 150)">${langList}</g>
  </g>

  ${card(P, y3, W - 2 * P, h3, C.purple, "Trends", "26 weeks")}
    <text x="24" y="66" font-size="15" fill="${t.ink}">Your contributions are trending <tspan font-weight="700" fill="${C.purple}">${trendWord}</tspan> — ${fmt(yearTotal)} in the last year.</text>
    <g transform="translate(24 72)"><path d="${area}" fill="url(#tr)"/><path d="${line}" fill="none" stroke="${C.indigo}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${pts.at(-1)[0]}" cy="${pts.at(-1)[1]}" r="5" fill="${C.indigo}" stroke="${t.card}" stroke-width="2"/></g>
  </g>

  ${[["Stars earned", stars, "★", C.orange], ["Pull requests", u.pullRequests.totalCount, "PRs", C.teal], ["Public repos", u.repositories.totalCount, "repos", C.pink], ["Since", new Date(u.createdAt).getFullYear(), "on GitHub", C.greenText]]
    .map(([label, v, unit, tint], i) => {
      const w = (W - 2 * P - 3 * G) / 4;
      return `<g transform="translate(${P + i * (w + G)} ${y4})"><rect width="${w}" height="${h4}" rx="20" fill="${t.card}"/>
        <text x="20" y="32" font-size="13" font-weight="600" fill="${tint}">${label}</text>${big(20, 74, fmt(v).replace(/,/g, i === 3 ? "" : ","), unit, t.ink, 28)}</g>`;
    }).join("")}
</svg>`;
}

mkdirSync("assets", { recursive: true });
for (const name of ["light", "dark"]) writeFileSync(`assets/dashboard-${name}.svg`, render(themes[name]));
console.log({ weekTotal, activeDays7, streak, best, yearTotal, stars, langs: langs.map((l) => l.name) });
