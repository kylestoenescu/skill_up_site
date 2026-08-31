/*
 * Checks the module manifest (js/modules.js) against reality.
 *
 * The manifest is now the single source of truth for what modules exist, which
 * means the failure mode has changed: instead of three lists silently
 * disagreeing, there is one list that can silently disagree with the FILES on
 * disk. That's what this suite is for — it fails loudly if the manifest names a
 * module whose page or data file is missing, or if a file exists that the
 * manifest never mentions.
 */
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const sb = { console };
sb.window = sb;
vm.createContext(sb);
vm.runInContext(fs.readFileSync(ROOT + "/js/modules.js", "utf8"), sb);
for (const f of fs.readdirSync(ROOT + "/js/data")) {
  vm.runInContext(fs.readFileSync(ROOT + "/js/data/" + f, "utf8"), sb);
}

let failures = 0;
function check(label, cond) {
  console.log((cond ? "PASS  " : "FAIL  ") + label);
  if (!cond) failures++;
}

/*
 * Position of a real <script src="..."> tag, not a passing mention in a comment.
 * (An earlier version of this file used a bare indexOf, which matched the HTML
 * comment above the grid instead of the script tag at the bottom of the page —
 * so it reported a load-order bug that didn't exist.)
 *
 * Paths are normalised because the home page says "js/nav.js" while a module
 * page one level down says "../js/nav.js" for the same file.
 *
 * @param {string} html
 * @param {string} file root-relative path, e.g. "js/nav.js"
 * @returns {number} index of the tag, or -1 if it isn't there
 */
function scriptPos(html, file) {
  const re = /src="([^"]*)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const normalised = m[1]
      .replace(/\?.*$/, "") // drop the ?v=N cache-busting query
      .replace(/^(\.\.\/)+/, "")
      .replace(/^\.\//, "");
    if (normalised === file) return m.index;
  }
  return -1;
}

const manifest = sb.SITE_MODULES;
const helpers = sb.SiteModules;

check("manifest loaded", Array.isArray(manifest) && manifest.length > 0);
check("SiteModules helpers exposed", !!helpers && typeof helpers.pageFor === "function");

// --- every entry is well formed ----------------------------------------
manifest.forEach(function (m) {
  check(m.id + ": has id, title, badge, blurb",
    typeof m.id === "string" && m.id.length > 0 &&
    typeof m.title === "string" && m.title.length > 0 &&
    typeof m.badge === "string" && m.badge.length > 0 &&
    typeof m.blurb === "string" && m.blurb.length > 0);
  check(m.id + ": id is url/filename safe", /^[a-z0-9-]+$/.test(m.id));
});

const ids = manifest.map(function (m) { return m.id; });
check("ids are unique", new Set(ids).size === ids.length);

// --- manifest <-> files on disk ----------------------------------------
manifest.forEach(function (m) {
  check(m.id + ": page exists", fs.existsSync(path.join(ROOT, helpers.pageFor(m))));
  check(m.id + ": data file exists", fs.existsSync(path.join(ROOT, helpers.dataFileFor(m))));
});

const pagesOnDisk = fs.readdirSync(ROOT + "/modules")
  .filter(function (f) { return f.endsWith(".html"); })
  .map(function (f) { return f.replace(/\.html$/, ""); })
  .sort();
check("no page on disk is missing from the manifest",
  pagesOnDisk.join(",") === ids.slice().sort().join(","));

const dataOnDisk = fs.readdirSync(ROOT + "/js/data")
  .filter(function (f) { return f.endsWith(".js"); })
  .map(function (f) { return f.replace(/\.js$/, ""); })
  .sort();
check("no data file on disk is missing from the manifest",
  dataOnDisk.join(",") === ids.slice().sort().join(","));

// --- manifest <-> quiz data --------------------------------------------
manifest.forEach(function (m) {
  const data = sb.QUIZ_DATA[m.id];
  check(m.id + ": registered in QUIZ_DATA under its id", !!data);
  if (data) {
    check(m.id + ": data.moduleId matches manifest id", data.moduleId === m.id);
    check(m.id + ": data.title matches manifest title", data.title === m.title);
  }
});

// --- each module page loads its own data file and calls initQuiz with its id
manifest.forEach(function (m) {
  const html = fs.readFileSync(path.join(ROOT, helpers.pageFor(m)), "utf8");
  check(m.id + ": page loads modules.js before nav.js",
    scriptPos(html, "js/modules.js") !== -1 &&
    scriptPos(html, "js/modules.js") < scriptPos(html, "js/nav.js"));
  check(m.id + ": page loads its own data file",
    scriptPos(html, "js/data/" + m.id + ".js") !== -1);
  check(m.id + ': page calls initQuiz("quiz", "' + m.id + '")',
    html.indexOf('initQuiz("quiz", "' + m.id + '")') !== -1);
});

/*
 * The multi-module pages (dashboard, flashcards) need question text for EVERY
 * module. They used to hard-code one <script> per data file, which was the last
 * place a list could drift from the manifest. They now load js/data-loader.js,
 * which asks the manifest instead — so what's worth checking is that they use
 * the loader and have NOT drifted back to hand-written tags.
 */
["dashboard", "flashcards"].forEach(function (page) {
  const file = page + ".html";
  const html = fs.readFileSync(path.join(ROOT, file), "utf8");
  const pageScript = "js/" + page + ".js";

  check(file + ": loads modules.js before nav.js",
    scriptPos(html, "js/modules.js") !== -1 &&
    scriptPos(html, "js/modules.js") < scriptPos(html, "js/nav.js"));

  check(file + ": loads progress.js before " + pageScript,
    scriptPos(html, "js/progress.js") !== -1 &&
    scriptPos(html, "js/progress.js") < scriptPos(html, pageScript));

  check(file + ": loads data-loader.js before " + pageScript,
    scriptPos(html, "js/data-loader.js") !== -1 &&
    scriptPos(html, "js/data-loader.js") < scriptPos(html, pageScript));

  check(file + ": modules.js loads before data-loader.js (loader reads the manifest)",
    scriptPos(html, "js/modules.js") < scriptPos(html, "js/data-loader.js"));

  /* No hand-written data tags. If one creeps back in, the page stops being
   * manifest-driven and the drift risk returns silently. */
  const hardCoded = (html.match(/src="[^"]*js\/data\/[^"]+"/g) || []);
  check(file + ": no hard-coded js/data/ script tags" +
    (hardCoded.length ? " — found " + hardCoded.length : ""),
    hardCoded.length === 0);

  /* Every script on these pages must be deferred. Mixing a plain <script> in
   * <body> with deferred ones in <head> silently inverts the order — the body
   * script runs FIRST — which would break the dependency chain above. */
  const tags = html.match(/<script src="js\/[^"]+"[^>]*>/g) || [];
  const notDeferred = tags.filter(function (t) { return t.indexOf("defer") === -1; });
  check(file + ": every script tag is deferred" +
    (notDeferred.length ? " — " + notDeferred.join(" ") : ""),
    notDeferred.length === 0);
});

/*
 * Run js/data-loader.js for real and assert on the URLs it builds.
 *
 * The load-bearing detail is the ?v= stamp. Injected <script> tags aren't in
 * the HTML, so tools/bump-assets.js can't stamp them; the loader has to copy
 * the version off its own src. Without that, the data files would cache
 * independently of the page and could go stale — the exact failure that once
 * took the quizzes off the live site.
 */
{
  const vm = require("vm");

  function runLoader(loaderSrcUrl) {
    const appended = [];
    const sb = {
      console: { warn: function () {}, log: function () {} },
      Promise: Promise,
      document: {
        currentScript: { src: loaderSrcUrl },
        querySelector: function () { return null; },
        createElement: function () { return {}; },
        head: { appendChild: function (node) { appended.push(node.src); } }
      }
    };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(fs.readFileSync(ROOT + "/js/modules.js", "utf8"), sb);
    vm.runInContext(fs.readFileSync(ROOT + "/js/data-loader.js", "utf8"), sb);
    return { sb: sb, appended: appended };
  }

  // Stamped, on a custom domain.
  const stamped = runLoader("https://train.example.com/js/data-loader.js?v=6");
  const urls = stamped.sb.SiteData.urls();

  check("loader derives the site root from its own URL",
    stamped.sb.SiteData.SITE_ROOT === "https://train.example.com/");
  check("loader picks up the ?v= stamp from its own URL",
    stamped.sb.SiteData.VERSION_QUERY === "?v=6");
  check("loader builds one URL per manifest module", urls.length === manifest.length);
  check("every built URL carries the version stamp",
    urls.every(function (u) { return u.indexOf("?v=6") !== -1; }));
  check("built URLs match the manifest's data files",
    urls.join(",") === manifest
      .map(function (m) { return "https://train.example.com/" + helpers.dataFileFor(m) + "?v=6"; })
      .join(","));

  // A GitHub Pages project subpath must keep its repo prefix.
  const sub = runLoader("https://user.github.io/skill_up_site/js/data-loader.js?v=6");
  check("loader keeps a project subpath",
    sub.sb.SiteData.urls()[0].indexOf("https://user.github.io/skill_up_site/js/data/") === 0);

  // Unstamped src must not invent a version.
  const bare = runLoader("https://train.example.com/js/data-loader.js");
  check("an unstamped loader produces unstamped URLs",
    bare.sb.SiteData.VERSION_QUERY === "" &&
    bare.sb.SiteData.urls()[0].indexOf("?") === -1);

  // Actually injecting: one script per module, and idempotent.
  const injected = runLoader("https://train.example.com/js/data-loader.js?v=6");
  injected.sb.SiteData.loadAll();
  check("loadAll injects one script per module",
    injected.appended.length === manifest.length);
  injected.sb.SiteData.loadAll();
  check("loadAll is idempotent — a second call injects nothing more",
    injected.appended.length === manifest.length);

  // Anything already present is skipped rather than re-requested.
  const partial = runLoader("https://train.example.com/js/data-loader.js?v=6");
  partial.sb.QUIZ_DATA = {};
  partial.sb.QUIZ_DATA[manifest[0].id] = { questions: [] };
  partial.sb.SiteData.loadAll();
  check("already-loaded module data is not re-requested",
    partial.appended.length === manifest.length - 1);
}

// --- the home page no longer hard-codes tiles --------------------------
{
  const home = fs.readFileSync(ROOT + "/index.html", "utf8");
  check("home page has the generated grid placeholder", /data-module-grid/.test(home));
  check("home page loads modules.js before home.js",
    scriptPos(home, "js/modules.js") !== -1 &&
    scriptPos(home, "js/modules.js") < scriptPos(home, "js/home.js"));
  check("home page loads progress.js before home.js (tiles show best scores)",
    scriptPos(home, "js/progress.js") !== -1 &&
    scriptPos(home, "js/progress.js") < scriptPos(home, "js/home.js"));
  const tileCount = (home.match(/class="module-card"/g) || []).length;
  check("no hand-written module tiles remain", tileCount === 0);
}

console.log(failures === 0 ? "\nALL MANIFEST TESTS PASSED" : "\n" + failures + " FAILURE(S)");
process.exit(failures === 0 ? 0 : 1);
