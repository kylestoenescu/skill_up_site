/* Runs the real js/nav.js for each page and checks the links it builds. */
const fs = require("fs");
const vm = require("vm");
const { El, makeDocument } = require("./dom-shim.js");

const ROOT = require("path").resolve(__dirname, "..") + "/";
const navSrc = fs.readFileSync(ROOT + "js/nav.js", "utf8");

// Anchors need href -> pathname resolution, like a real browser gives you.
Object.defineProperty(El.prototype, "href", {
  get() { return this._href; },
  set(v) {
    this._href = v;
    try { this.pathname = new URL(v).pathname; } catch (e) { this.pathname = v; }
  }
});

let failures = 0;
function check(label, cond) {
  console.log((cond ? "PASS  " : "FAIL  ") + label);
  if (!cond) failures++;
}

/**
 * @param {string} scriptSrc the resolved src the browser would report for nav.js
 * @param {string} pagePath  window.location.pathname for the page under test
 */
function runNav(scriptSrc, pagePath) {
  const document = makeDocument();
  const header = new El("header");
  header.dataset.siteHeader = "";
  header.setAttribute("data-site-header", "");
  document.body.appendChild(header);
  document.querySelector = (sel) => document.body.querySelectorAll(sel)[0] || null;

  const scriptEl = new El("script");
  scriptEl.src = scriptSrc;
  document.currentScript = scriptEl;

  const sb = {
    console, Date, Math, JSON, Object, Array, String, Number, URL,
    document,
    location: { pathname: pagePath }
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(navSrc, sb);

  const links = header.querySelectorAll("nav a");
  return {
    header,
    brandHref: header.querySelectorAll(".brand")[0].href,
    links: links.map((a) => ({
      label: a.textContent,
      href: a.href,
      current: a.getAttribute("aria-current")
    }))
  };
}

// --- home page, custom domain at the site root -------------------------
{
  const r = runNav("https://train.example.com/js/nav.js", "/index.html");
  check("home: 8 links built from one definition", r.links.length === 8);
  check("home: brand points at root index", r.brandHref === "https://train.example.com/index.html");
  check("home: module link is root-relative", r.links[1].href === "https://train.example.com/modules/javascript.html");
  check("home: Home marked current", r.links[0].current === "page");
  check("home: exactly one aria-current", r.links.filter((l) => l.current).length === 1);
}

// --- module page, one directory deep -----------------------------------
{
  const r = runNav("https://train.example.com/js/nav.js", "/modules/sql.html");
  check("module: brand climbs back to root", r.brandHref === "https://train.example.com/index.html");
  check("module: sibling link resolves correctly", r.links[2].href === "https://train.example.com/modules/sql.html");
  check("module: SQL marked current", r.links[2].current === "page");
  check("module: Home NOT marked current", r.links[0].current === null);
  check("module: exactly one aria-current", r.links.filter((l) => l.current).length === 1);
}

// --- bare directory URL (server serves index.html) ---------------------
{
  const r = runNav("https://train.example.com/js/nav.js", "/");
  check('"/" is treated as /index.html', r.links[0].current === "page");
}

// --- GitHub Pages project subpath (username.github.io/skill_up_site/) --
{
  const r = runNav("https://user.github.io/skill_up_site/js/nav.js", "/skill_up_site/modules/oauth.html");
  check("project subpath: links keep the repo prefix", r.links[1].href === "https://user.github.io/skill_up_site/modules/javascript.html");
  check("project subpath: OAuth marked current", r.links[6].current === "page");
}

// --- local file:// double-click ----------------------------------------
{
  const r = runNav("file:///C:/Users/kyles/site/js/nav.js", "/C:/Users/kyles/site/modules/fhir.html");
  check("file://: links resolve against the folder", r.links[4].href === "file:///C:/Users/kyles/site/modules/fhir.html");
  check("file://: FHIR marked current", r.links[4].current === "page");
}

// --- the nav list matches the pages that actually exist ----------------
{
  const r = runNav("https://train.example.com/js/nav.js", "/index.html");
  const onDisk = fs.readdirSync(ROOT + "modules").filter((f) => f.endsWith(".html")).sort();
  const inNav = r.links.slice(1).map((l) => l.href.split("/modules/")[1]).sort();
  check("nav lists exactly the module pages on disk", inNav.join(",") === onDisk.join(","));
}

// --- every page ships the placeholder + noscript fallback --------------
{
  const pages = ["index.html"].concat(
    fs.readdirSync(ROOT + "modules").filter((f) => f.endsWith(".html")).map((f) => "modules/" + f)
  );
  let ok = true;
  let noOldNav = true;
  pages.forEach((p) => {
    const html = fs.readFileSync(ROOT + p, "utf8");
    if (!/<header class="site-header" data-site-header>/.test(html)) { ok = false; console.log("   missing placeholder: " + p); }
    if (!/<noscript>/.test(html)) { ok = false; console.log("   missing noscript: " + p); }
    if (!/src="[^"]*js\/nav\.js" defer/.test(html)) { ok = false; console.log("   missing nav.js: " + p); }
    // the old hard-coded 8-link nav should be gone from the live markup
    const outsideNoscript = html.replace(/<noscript>[\s\S]*?<\/noscript>/g, "");
    if (/modules\/rest-apis\.html|rest-apis\.html">REST APIs/.test(outsideNoscript) && p !== "index.html") {
      noOldNav = false; console.log("   stale hard-coded nav in: " + p);
    }
  });
  check("all 8 pages use the shared header placeholder", ok);
  check("no leftover hard-coded nav in module pages", noOldNav);
}

// --- no page still carries inline quiz data ----------------------------
{
  const pages = fs.readdirSync(ROOT + "modules").filter((f) => f.endsWith(".html"));
  let clean = true;
  pages.forEach((p) => {
    const html = fs.readFileSync(ROOT + "modules/" + p, "utf8");
    if (/correctIndex/.test(html)) { clean = false; console.log("   inline quiz data still in: " + p); }
    if (!/src="\.\.\/js\/data\//.test(html)) { clean = false; console.log("   no data file loaded in: " + p); }
    if (!/src="\.\.\/js\/progress\.js"/.test(html)) { clean = false; console.log("   progress.js not loaded in: " + p); }
  });
  check("quiz data fully extracted out of every module page", clean);
}

console.log(failures === 0 ? "\nALL NAV TESTS PASSED" : "\n" + failures + " FAILURE(S)");
process.exit(failures === 0 ? 0 : 1);
