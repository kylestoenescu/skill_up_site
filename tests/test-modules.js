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
 * The dashboard resolves question TEXT from QUIZ_DATA, so it has to load every
 * module's data file. Those script tags are hand-written while the manifest is
 * generated from — a drift risk the manifest was meant to remove. If you add a
 * module and forget its <script> here, the "Questions to review" table silently
 * falls back to showing raw question ids. This check catches that.
 */
{
  const dash = fs.readFileSync(ROOT + "/dashboard.html", "utf8");

  check("dashboard: loads modules.js before nav.js",
    scriptPos(dash, "js/modules.js") !== -1 &&
    scriptPos(dash, "js/modules.js") < scriptPos(dash, "js/nav.js"));
  check("dashboard: loads progress.js before dashboard.js",
    scriptPos(dash, "js/progress.js") !== -1 &&
    scriptPos(dash, "js/progress.js") < scriptPos(dash, "js/dashboard.js"));

  let missing = [];
  manifest.forEach(function (m) {
    const dataFile = helpers.dataFileFor(m);
    if (scriptPos(dash, dataFile) === -1) {
      missing.push(dataFile);
    } else if (scriptPos(dash, dataFile) > scriptPos(dash, "js/dashboard.js")) {
      missing.push(dataFile + " (loaded AFTER dashboard.js)");
    }
  });
  check("dashboard loads a data file for every module in the manifest" +
    (missing.length ? "\n      missing: " + missing.join(", ") : ""),
    missing.length === 0);
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
