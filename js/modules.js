/*
 * modules.js — the single source of truth for which modules exist.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * After phase 1 the module list still lived in three places: the nav links in
 * nav.js, the seven hand-written tiles on index.html, and the data files. So
 * adding a module was three edits, and the three could silently disagree —
 * a nav link pointing at a tile that doesn't exist, or vice versa.
 *
 * Now there is one array. nav.js builds the header from it, home.js builds the
 * home-page tiles from it, and the phase-2 dashboard will read it to know which
 * modules to summarise. Adding a module is:
 *
 *   1. add an entry here
 *   2. create js/data/<id>.js
 *   3. create modules/<id>.html
 *
 * Steps 2 and 3 are real content. Step 1 is the only wiring.
 *
 * ---------------------------------------------------------------------------
 * FIELD REFERENCE
 * ---------------------------------------------------------------------------
 *   id     Stable identifier. This is the key everything else joins on: it is
 *          the module's key in QUIZ_DATA, the moduleId written into saved
 *          progress, and the basename of both the page and the data file.
 *          CHANGING AN ID ORPHANS SAVED PROGRESS for that module — treat it as
 *          permanent, exactly like a question id.
 *   title  Display name, used in the nav and on the tile.
 *   badge  Two-to-four character label for the coloured square on the tile.
 *   blurb  One-line description for the tile.
 *
 * The `href` and the data file path are derived from `id` rather than stored,
 * so they cannot drift out of sync with it. Order here is display order.
 */

window.SITE_MODULES = [
  {
    id: "javascript",
    title: "JavaScript",
    badge: "JS",
    blurb: "The language of the web: syntax, the DOM, and asynchronous code.",
    /* This module is a gated three-stage progression rather than one flat quiz.
     * Listing the stage ids here is what tells the rest of the site to score it
     * per stage: mastery means ALL of these are passed, not just the first.
     * Omit `stages` and a module behaves as a single quiz, like the other six. */
    stages: ["trace", "parsons", "free"]
  },
  {
    id: "sql",
    title: "SQL",
    badge: "SQL",
    blurb: "Query and shape relational data with SELECT, JOIN, and friends."
  },
  {
    id: "python",
    title: "Python",
    badge: "PY",
    blurb: "Readable, general-purpose scripting for automation and data work."
  },
  {
    id: "fhir",
    title: "FHIR",
    badge: "FHIR",
    blurb: "The standard for exchanging healthcare data between systems."
  },
  {
    id: "soap",
    title: "SOAP",
    badge: "SOAP",
    blurb: "XML-based messaging protocol used by many enterprise APIs."
  },
  {
    id: "oauth",
    title: "OAuth",
    badge: "OA",
    blurb: "How apps get delegated access to a user's data without passwords."
  },
  {
    id: "rest-apis",
    title: "REST APIs",
    badge: "API",
    blurb: "Designing and consuming web services around resources and HTTP."
  }
];

/*
 * Small helpers so callers don't each reinvent the same path logic.
 * Paths are returned relative to the SITE ROOT; nav.js and home.js prefix them
 * with the resolved root so they work from any page depth.
 */
window.SiteModules = {
  /** @returns {Array<object>} every module, in display order */
  all: function () {
    return window.SITE_MODULES.slice();
  },

  /** @param {string} id @returns {object|undefined} */
  byId: function (id) {
    return window.SITE_MODULES.filter(function (m) {
      return m.id === id;
    })[0];
  },

  /**
   * @param {object|string} module or id
   * @returns {string[]|null} the module's stage ids, or null if it's a single
   *          flat quiz. Callers branch on this to decide whether to score the
   *          module as a whole or stage by stage.
   */
  stagesFor: function (module) {
    const entry = typeof module === "string" ? this.byId(module) : module;
    return entry && Array.isArray(entry.stages) && entry.stages.length ? entry.stages : null;
  },

  /** @returns {string[]} just the ids — handy for Progress.getAllSummaries() */
  ids: function () {
    return window.SITE_MODULES.map(function (m) {
      return m.id;
    });
  },

  /** @param {object|string} module or id @returns {string} e.g. "modules/sql.html" */
  pageFor: function (module) {
    return "modules/" + (typeof module === "string" ? module : module.id) + ".html";
  },

  /** @param {object|string} module or id @returns {string} e.g. "js/data/sql.js" */
  dataFileFor: function (module) {
    return "js/data/" + (typeof module === "string" ? module : module.id) + ".js";
  }
};
