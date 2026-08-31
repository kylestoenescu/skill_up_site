/*
 * Executes every runnable lesson example and checks it behaves.
 *
 * WHY THIS EXISTS
 * The examples live as text inside <code> blocks in modules/javascript.html, and
 * lesson.js runs whatever that text says. That is a nice property — what you
 * read is exactly what executes — but it means an HTML escaping mistake becomes
 * a broken example rather than a broken page. `i < 3` written raw in HTML, or a
 * stray &amp;, silently changes the code the reader runs.
 *
 * So this suite extracts each example the same way lesson.js does (unescape the
 * HTML entities, take the text) and actually runs it, asserting that it compiles,
 * doesn't throw, and prints something. Several examples are deliberately about
 * errors, so "doesn't throw" means the example handles its own error — which is
 * also what makes them safe to press Run on.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const PAGE = path.join(ROOT, "modules", "javascript.html");

let failures = 0;
function check(label, cond) {
  console.log((cond ? "PASS  " : "FAIL  ") + label);
  if (!cond) failures++;
}

/** The same entities lesson.js relies on the browser having already decoded. */
function unescapeHtml(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&"); // last, so &amp;lt; survives correctly
}

const html = fs.readFileSync(PAGE, "utf8");

/* Each example is a [data-runnable] wrapper containing one <pre><code>. */
const blocks = html.match(
  /<div class="lesson-example"[^>]*>\s*<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g
) || [];

const examples = blocks.map(function (block, i) {
  const inner = block.match(/<code>([\s\S]*?)<\/code>/)[1];
  const settle = block.match(/data-settle="(\d+)"/);
  return {
    index: i + 1,
    source: unescapeHtml(inner),
    settleMs: settle ? Number(settle[1]) : 250
  };
});

check("found runnable examples on the page", examples.length > 0);
check("every [data-runnable] block has a code block",
  examples.length === (html.match(/data-runnable/g) || []).length);

/* No raw, unescaped "<" should survive inside a code block — that is the exact
 * mistake this suite is guarding against. */
{
  const codeBlocks = html.match(/<pre class="stage-code"><code>[\s\S]*?<\/code><\/pre>/g) || [];
  const raw = codeBlocks.filter(function (b) {
    const inner = b.replace(/<\/?(pre|code)[^>]*>/g, "");
    return /<(?![/a-zA-Z!])/.test(inner);
  });
  check("no unescaped '<' inside any code block" + (raw.length ? " — " + raw.length + " found" : ""),
    raw.length === 0);
}

/**
 * Runs one example the way lesson.js does: a private `console` passed in as a
 * parameter, so the example's console.log calls resolve to ours.
 */
function runExample(example) {
  const lines = [];
  const sandboxConsole = {
    log: function () { lines.push(Array.prototype.slice.call(arguments).join(" ")); },
    error: function () { lines.push(Array.prototype.slice.call(arguments).join(" ")); },
    warn: function () { lines.push(Array.prototype.slice.call(arguments).join(" ")); }
  };

  const context = {
    console: sandboxConsole,
    setTimeout: setTimeout,
    Promise: Promise,
    JSON: JSON,
    Date: Date,
    Array: Array,
    Object: Object,
    Error: Error,
    String: String,
    Number: Number
  };
  vm.createContext(context);

  let threw = null;
  try {
    vm.runInContext("(function (console) {\n" + example.source + "\n})(console);", context, {
      timeout: 3000
    });
  } catch (err) {
    threw = err;
  }

  return { lines: lines, threw: threw };
}

/* Run them all, then wait long enough for the async ones to finish before
 * asserting on output — the same settle problem lesson.js has in the browser. */
const results = examples.map(function (example) {
  return { example: example, run: runExample(example) };
});

const longestSettle = examples.reduce(function (max, e) { return Math.max(max, e.settleMs); }, 250);

setTimeout(function () {
  results.forEach(function (r) {
    const label = "example " + r.example.index;

    check(label + ": compiles and runs without throwing" +
      (r.run.threw ? " — " + r.run.threw.message : ""),
      r.run.threw === null);

    check(label + ": produces output", r.run.lines.length > 0);
  });

  /* Spot-check a few outputs, so a silently-wrong example (right shape, wrong
   * result) is caught too — these are the exact facts the prose claims. */
  function outputOf(i) {
    return results[i - 1].run.lines.join("\n");
  }

  check("block scoping example shows inner and outer are separate",
    /inside the block: inner/.test(outputOf(1)) && /outside the block: outer/.test(outputOf(1)));

  check("const example shows push works but reassignment throws",
    /\[10,20,30\]|10,20,30/.test(outputOf(2).replace(/\s/g, "")) && /Error:/.test(outputOf(2)));

  check("typeof example reports null as object",
    /object/.test(outputOf(4)) && outputOf(4).split("\n").length === 7);

  // 11 = the working makeCounter; 10 = the broken one that resets to 1
  check("the broken counter is stuck on 1 (that's the teaching point)",
    outputOf(10).split("\n").every(function (l) { return l.trim() === "1"; }));

  check("the closure counter actually reaches 3",
    outputOf(11).split("\n").join(",") === "1,2,3");

  check("two counters from the same factory are independent",
    /b: 1/.test(outputOf(12)) && /a: 4/.test(outputOf(12)));

  check("var-vs-let loop shows 4,4,4 then 1,2,3",
    /i = 4/.test(outputOf(14)) && /j = 1/.test(outputOf(14)) && /j = 3/.test(outputOf(14)));

  check("sync runs before setTimeout(0)",
    outputOf(15).indexOf("1. first line") < outputOf(15).indexOf("3. inside setTimeout"));

  check("Promise.all is faster than sequential awaits", (function () {
    const seq = /sequential:.*?(\d+) ms/.exec(outputOf(20));
    const all = /Promise.all:.*?(\d+) ms/.exec(outputOf(20));
    return seq && all && Number(all[1]) < Number(seq[1]);
  })());

  console.log(failures === 0 ? "\nALL LESSON TESTS PASSED" : "\n" + failures + " FAILURE(S)");
  process.exit(failures === 0 ? 0 : 1);
}, longestSettle + 400);
