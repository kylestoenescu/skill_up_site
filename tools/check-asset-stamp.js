#!/usr/bin/env node
/*
 * check-asset-stamp.js — refuse a push that ships changed JS/CSS without
 * bumping the ?v= stamp in the HTML.
 *
 *   node tools/check-asset-stamp.js <baseRef> <headRef>
 *
 * Exit 0 = fine to push. Exit 1 = a bump is missing.
 *
 * ===========================================================================
 * THE FAILURE THIS CATCHES
 * ===========================================================================
 * The site is behind Cloudflare, which caches HTML for 10 minutes and JS/CSS
 * for 4 hours. Every asset URL therefore carries ?v=N so a page and its scripts
 * always update together (see tools/bump-assets.js for the full story — a
 * stale quiz.js once took every quiz off the live site).
 *
 * The stamp only works if it is actually bumped. Edit js/quiz.js, forget to run
 * bump-assets, and the HTML still asks for js/quiz.js?v=8 — the exact URL
 * browsers already have cached. Your change deploys and nobody sees it, for up
 * to four hours, with no error anywhere.
 *
 * The test suite cannot catch this. tests/test-cache-busting.js verifies every
 * asset HAS a stamp and that pages agree on it — both of which stay true when
 * the stamp is stale. Staleness is only visible by comparing two commits, which
 * is a job for a pre-push hook rather than a test.
 *
 * ===========================================================================
 * WHAT COUNTS AS AN ASSET
 * ===========================================================================
 * Only files under js/ and css/ that the browser actually downloads. Changes to
 * tests/ and tools/ are never served, so they don't need a bump — being strict
 * here is what stops the hook crying wolf and getting bypassed out of habit.
 */

const { execFileSync } = require("child_process");

/** @returns {string} stdout, or "" if the git command fails */
function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" });
  } catch (err) {
    return "";
  }
}

/** Files the browser downloads: js/**\/*.js and css/**\/*.css. */
function changedAssets(base, head) {
  const out = git(["diff", "--name-only", base, head, "--", "js", "css"]);
  return out
    .split("\n")
    .map(function (line) { return line.trim(); })
    .filter(function (line) { return /^(js|css)\/.*\.(js|css)$/.test(line); });
}

/**
 * The highest ?v= stamp across every HTML file at a given commit.
 * Highest rather than first, so a half-applied bump still reads as bumped and
 * the real problem (pages disagreeing) is left to test-cache-busting.js.
 *
 * @param {string} ref
 * @returns {number} 0 when nothing is stamped
 */
function stampAt(ref) {
  const listing = git(["ls-tree", "-r", "--name-only", ref]);
  const pages = listing.split("\n").filter(function (f) { return /\.html$/.test(f.trim()); });

  let max = 0;
  pages.forEach(function (page) {
    const html = git(["show", ref + ":" + page.trim()]);
    const matches = html.match(/\?v=(\d+)/g) || [];
    matches.forEach(function (m) {
      max = Math.max(max, Number(m.slice(3)));
    });
  });
  return max;
}

function main() {
  const base = process.argv[2];
  const head = process.argv[3];

  if (!base || !head) {
    console.error("usage: node tools/check-asset-stamp.js <baseRef> <headRef>");
    process.exit(2);
  }

  const assets = changedAssets(base, head);
  if (assets.length === 0) {
    console.log("  asset stamp: no js/ or css/ changes in this push — nothing to bump.");
    return;
  }

  const before = stampAt(base);
  const after = stampAt(head);

  if (after > before) {
    console.log(
      "  asset stamp: " + assets.length + " asset(s) changed, stamp bumped v=" +
      before + " -> v=" + after + ". Good."
    );
    return;
  }

  console.error("");
  console.error("  BLOCKED: assets changed but the ?v= stamp was not bumped.");
  console.error("");
  console.error("  Changed files the browser downloads:");
  assets.slice(0, 12).forEach(function (f) { console.error("    " + f); });
  if (assets.length > 12) console.error("    ...and " + (assets.length - 12) + " more");
  console.error("");
  console.error("  Stamp is still v=" + after + " (was v=" + before + ").");
  console.error("");
  console.error("  Browsers cache js/ and css/ for 4 hours by URL. Pushing this");
  console.error("  would deploy your changes to a URL nobody requests, so the old");
  console.error("  files keep being served and the change appears to do nothing.");
  console.error("");
  console.error("  Fix:");
  console.error("    node tools/bump-assets.js");
  console.error("    git add -A && git commit --amend --no-edit   # or a new commit");
  console.error("");
  process.exit(1);
}

main();
