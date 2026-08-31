#!/usr/bin/env node
/*
 * bump-assets.js — stamp a version onto every local <script src> and
 * <link href> in the site's HTML, e.g. js/quiz.js -> js/quiz.js?v=3
 *
 *   node tools/bump-assets.js         # auto-increment to the next version
 *   node tools/bump-assets.js 7       # set an explicit version
 *
 * ===========================================================================
 * WHY THIS EXISTS — read this before deleting it
 * ===========================================================================
 * The site is served through Cloudflare, which caches by URL with very
 * different lifetimes depending on file type:
 *
 *     modules/*.html    max-age=600      (10 minutes)
 *     js/*.js, *.css    max-age=14400    (4 hours)
 *
 * That difference silently broke the site once. Phase 2 changed the contract
 * between a page and the engine it calls:
 *
 *     old:  initQuiz("quiz", QUIZ_DATA.soap)   // expects an object
 *     new:  initQuiz("quiz", "soap")           // expects an id string
 *
 * The HTML refreshed in 10 minutes. quiz.js stayed cached for hours. For that
 * whole window, browsers ran NEW html against OLD quiz.js, which received a
 * string where it wanted an object, failed its guard clause, and returned
 * without rendering anything. The quizzes vanished with no console error.
 *
 * A version query string fixes this at the root: `js/quiz.js?v=3` is a
 * DIFFERENT URL from `js/quiz.js?v=2`, so a cached copy of the old one can
 * never be substituted. The HTML — which has the short TTL and therefore
 * arrives quickly — is what names the version, so the page and its scripts
 * always update as one atomic unit.
 *
 * ---------------------------------------------------------------------------
 * IS THIS A BUILD STEP?
 * ---------------------------------------------------------------------------
 * Not in the sense the project rules out. Nothing is compiled, bundled, or
 * transformed; the deployed files stay exactly the hand-written HTML/CSS/JS
 * that GitHub Pages serves. This only rewrites a query string in place, and
 * the site works perfectly if you never run it. It is optional dev tooling —
 * the cost of skipping it is the stale-cache bug above.
 *
 * WHEN TO RUN IT: any time you change a file in js/ or css/, before pushing.
 * If you only edited HTML or quiz content, you don't need to.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

/** Every HTML file that loads assets. */
function htmlFiles() {
  const files = fs
    .readdirSync(ROOT)
    .filter(function (f) { return f.endsWith(".html"); })
    .map(function (f) { return path.join(ROOT, f); });
  const modulesDir = path.join(ROOT, "modules");
  fs.readdirSync(modulesDir)
    .filter((f) => f.endsWith(".html"))
    .forEach((f) => files.push(path.join(modulesDir, f)));
  return files;
}

/*
 * Matches the src/href of a LOCAL .js or .css asset, capturing:
 *   1: the attribute and opening quote   e.g.  src="
 *   2: the path                          e.g.  ../js/quiz.js
 *   3: any existing ?v=... query         e.g.  ?v=2
 *
 * The negative lookahead skips absolute URLs, so an external stylesheet or a
 * CDN script (should one ever be added) is left alone.
 */
const ASSET_RE = /\b(src="|href=")(?!https?:|\/\/)([^"?]+\.(?:js|css))(\?v=\d+)?"/g;

function currentMaxVersion(contents) {
  let max = 1;
  contents.forEach((text) => {
    let m;
    const re = /\?v=(\d+)"/g;
    while ((m = re.exec(text)) !== null) {
      max = Math.max(max, Number(m[1]));
    }
  });
  return max;
}

function main() {
  const files = htmlFiles();
  const originals = files.map((f) => fs.readFileSync(f, "utf8"));

  const explicit = process.argv[2];
  const version = explicit ? Number(explicit) : currentMaxVersion(originals) + 1;

  if (!Number.isInteger(version) || version < 1) {
    console.error("Version must be a positive integer. Got: " + explicit);
    process.exit(1);
  }

  let totalStamped = 0;

  files.forEach((file, i) => {
    let stamped = 0;
    const updated = originals[i].replace(ASSET_RE, function (_match, attr, assetPath) {
      stamped++;
      return attr + assetPath + "?v=" + version + '"';
    });

    if (updated !== originals[i]) {
      fs.writeFileSync(file, updated);
    }
    totalStamped += stamped;
    console.log("  " + path.relative(ROOT, file).replace(/\\/g, "/") + "  (" + stamped + " assets)");
  });

  console.log("\nStamped " + totalStamped + " asset references at ?v=" + version);
  console.log("Commit the HTML changes along with your js/ or css/ edits.");
}

main();
