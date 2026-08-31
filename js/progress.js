/*
 * progress.js — the progress storage layer for SkillUp.
 *
 * ===========================================================================
 * THE ONE RULE
 * This is the ONLY file in the site that is allowed to touch localStorage.
 * Everything else (quiz.js today; a dashboard and flashcards later) goes
 * through the Progress API below. If you ever need to change how data is
 * stored — a new schema version, IndexedDB, a real backend — you change this
 * file and nothing else breaks.
 * ===========================================================================
 *
 * WHY IT'S SHAPED THIS WAY
 * Two different things are recorded, because two different features need them:
 *
 *   1. ATTEMPTS — an append-only log. "On this date I scored 4/5 on SQL, and
 *      here is exactly what I picked for each question." This is history: it
 *      answers "am I improving?" and powers a dashboard's charts.
 *
 *   2. QUESTION STATS — a rolled-up tally per question id. "I've seen sql-3
 *      six times, got it right 5 of those, my current correct-streak is 3, and
 *      I last saw it on the 14th." This is the thing spaced-repetition and
 *      flashcards need, and you can't cheaply recompute it by scanning the
 *      whole attempt log every page load — so it's maintained as it goes.
 *
 * The attempt log is capped (see MAX_ATTEMPTS_PER_MODULE) because localStorage
 * is small — usually ~5MB per origin — and an uncapped log grows forever. The
 * question stats are NOT capped: they're a fixed size per question, and they're
 * the part you actually want to keep for years.
 *
 * ===========================================================================
 * STORED SHAPE (under the single key "skillup:v1")
 * ===========================================================================
 * {
 *   version: 1,
 *   updatedAt: "2026-08-30T18:00:00.000Z",
 *   modules: {
 *     "sql": {
 *       attempts: [                       // newest LAST
 *         {
 *           id: "a-1756...-x9f",          // unique, so a UI can key off it
 *           completedAt: "2026-...Z",
 *           mode: "full" | "retry",       // see MODE note below
 *           score: 4,
 *           total: 5,
 *           answers: [
 *             {
 *               questionId: "sql-3",
 *               correct: false,
 *               chosenIndex: 2,           // index into the ORIGINAL options array
 *               chosenText: "It must reference another table",
 *               correctIndex: 0
 *             }
 *           ]
 *         }
 *       ],
 *       questions: {                      // keyed by question id
 *         "sql-3": {
 *           seen: 6,
 *           correct: 5,
 *           incorrect: 1,
 *           streak: 3,                    // consecutive correct; resets to 0 on a miss
 *           bestStreak: 3,
 *           lastResult: "correct" | "incorrect",
 *           lastSeenAt: "2026-...Z",
 *           lastCorrectAt: "2026-...Z" | null,
 *           lastIncorrectAt: "2026-...Z" | null
 *         }
 *       }
 *     }
 *   }
 * }
 *
 * MODE note: a "retry" attempt is the targeted redo of only the questions you
 * missed. It updates question stats (you did genuinely answer those questions
 * again) but is EXCLUDED from best-score and mastery, because scoring 2/2 on a
 * two-question retry is not the same achievement as scoring 5/5 on the full
 * quiz. Mastery has to be earned on a full run.
 *
 * `chosenIndex` is stored as the index into the options array AS AUTHORED in
 * the data file, never the on-screen position — the quiz shuffles options, so
 * on-screen positions are meaningless once the page is closed. `chosenText` is
 * stored alongside it so the record stays readable (and stays meaningful) even
 * if you later reorder the options in the data file.
 */

(function (global) {
  "use strict";

  // --- constants -----------------------------------------------------------

  const STORAGE_KEY = "skillup:v1";
  const CORRUPT_BACKUP_KEY = "skillup:v1:corrupt-backup";
  const SCHEMA_VERSION = 1;

  /** A module is "mastered" at 80% or better on a full attempt. */
  const MASTERY_THRESHOLD = 0.8;

  /** Keep the most recent N attempts per module; older ones are dropped. */
  const MAX_ATTEMPTS_PER_MODULE = 50;

  // --- storage backend -----------------------------------------------------

  /*
   * localStorage can fail in more ways than people expect: Safari private mode
   * historically threw on write, browsers can be configured to block site data,
   * a file:// page may have an opaque origin, and a full quota throws on set.
   * So every access is wrapped, and if the real thing is unusable we fall back
   * to an in-memory object. That fallback means the quiz still works and still
   * shows you a score — it just forgets everything when the tab closes, which
   * is exactly the "fail gracefully" behaviour we want.
   */

  let memoryFallback = null; // holds the raw JSON string when localStorage is out
  let usingFallback = false;

  /**
   * Probes localStorage by actually writing and removing a value. Feature-
   * detecting `"localStorage" in window` is not enough — the object can exist
   * and still throw on use.
   * @returns {boolean}
   */
  function probeStorage() {
    try {
      const probeKey = "skillup:probe";
      global.localStorage.setItem(probeKey, "1");
      global.localStorage.removeItem(probeKey);
      return true;
    } catch (err) {
      return false;
    }
  }

  usingFallback = !probeStorage();

  /** @returns {string|null} the raw stored JSON, or null if nothing is stored */
  function readRaw() {
    if (usingFallback) return memoryFallback;
    try {
      return global.localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      usingFallback = true;
      return memoryFallback;
    }
  }

  /**
   * @param {string} raw JSON string to persist
   * @returns {boolean} true if it actually reached durable storage
   */
  function writeRaw(raw) {
    if (usingFallback) {
      memoryFallback = raw;
      return false;
    }
    try {
      global.localStorage.setItem(STORAGE_KEY, raw);
      return true;
    } catch (err) {
      // Most likely a quota error. Degrade to memory rather than throwing into
      // the caller's submit handler and breaking the quiz.
      console.warn("SkillUp: could not save progress, continuing in memory.", err);
      usingFallback = true;
      memoryFallback = raw;
      return false;
    }
  }

  // --- schema helpers ------------------------------------------------------

  /** @returns {object} a valid, empty store */
  function emptyStore() {
    return { version: SCHEMA_VERSION, updatedAt: null, modules: {} };
  }

  function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /**
   * Takes whatever came out of storage and forces it into a valid shape,
   * discarding anything malformed rather than trusting it. Returns null when
   * the input is too broken to salvage, which tells the caller to start fresh.
   *
   * This is deliberately defensive: stored data is *input*, it can be hand-
   * edited, half-written, or produced by an older version of this file.
   *
   * @param {unknown} raw parsed JSON
   * @returns {object|null}
   */
  function normaliseStore(raw) {
    if (!isPlainObject(raw)) return null;
    if (!isPlainObject(raw.modules)) return null;

    const store = emptyStore();
    store.updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : null;

    Object.keys(raw.modules).forEach((moduleId) => {
      const src = raw.modules[moduleId];
      if (!isPlainObject(src)) return; // skip this module, keep the rest

      const bucket = { attempts: [], questions: {} };

      if (Array.isArray(src.attempts)) {
        src.attempts.forEach((attempt) => {
          if (!isPlainObject(attempt)) return;
          if (typeof attempt.score !== "number" || typeof attempt.total !== "number") return;
          bucket.attempts.push({
            id: typeof attempt.id === "string" ? attempt.id : makeId(),
            completedAt: typeof attempt.completedAt === "string" ? attempt.completedAt : null,
            mode: attempt.mode === "retry" ? "retry" : "full",
            score: attempt.score,
            total: attempt.total,
            answers: Array.isArray(attempt.answers) ? attempt.answers.filter(isPlainObject) : []
          });
        });
        // Guard against an oversized imported file.
        bucket.attempts = bucket.attempts.slice(-MAX_ATTEMPTS_PER_MODULE);
      }

      if (isPlainObject(src.questions)) {
        Object.keys(src.questions).forEach((questionId) => {
          const q = src.questions[questionId];
          if (!isPlainObject(q)) return;
          bucket.questions[questionId] = {
            seen: numberOr(q.seen, 0),
            correct: numberOr(q.correct, 0),
            incorrect: numberOr(q.incorrect, 0),
            streak: numberOr(q.streak, 0),
            bestStreak: numberOr(q.bestStreak, 0),
            lastResult: q.lastResult === "correct" || q.lastResult === "incorrect" ? q.lastResult : null,
            lastSeenAt: typeof q.lastSeenAt === "string" ? q.lastSeenAt : null,
            lastCorrectAt: typeof q.lastCorrectAt === "string" ? q.lastCorrectAt : null,
            lastIncorrectAt: typeof q.lastIncorrectAt === "string" ? q.lastIncorrectAt : null
          };
        });
      }

      store.modules[moduleId] = bucket;
    });

    return store;
  }

  function numberOr(value, fallback) {
    return typeof value === "number" && isFinite(value) ? value : fallback;
  }

  /** Short unique-enough id: timestamp in base36 + random suffix. */
  function makeId() {
    return "a-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  }

  function nowISO() {
    return new Date().toISOString();
  }

  /**
   * Loads and validates the store. Never throws, never returns null — the
   * worst case is an empty store, so callers can always just use the result.
   * @returns {object}
   */
  function readStore() {
    const raw = readRaw();
    if (!raw) return emptyStore();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return recoverFromCorruption(raw);
    }

    const store = normaliseStore(parsed);
    if (!store) return recoverFromCorruption(raw);
    return store;
  }

  /**
   * Stashes unreadable data under a separate key before starting fresh, so a
   * bad write never silently destroys months of history — you can still dig
   * the old string out of the console if it matters.
   * @param {string} raw
   * @returns {object} a fresh empty store
   */
  function recoverFromCorruption(raw) {
    console.warn("SkillUp: stored progress was unreadable; starting fresh. A copy is kept under " + CORRUPT_BACKUP_KEY);
    if (!usingFallback) {
      try {
        global.localStorage.setItem(CORRUPT_BACKUP_KEY, raw);
      } catch (err) {
        /* best effort only — if this fails we still return a usable store */
      }
    }
    return emptyStore();
  }

  /**
   * @param {object} store
   * @returns {boolean} whether it persisted durably
   */
  function writeStore(store) {
    store.version = SCHEMA_VERSION;
    store.updatedAt = nowISO();
    return writeRaw(JSON.stringify(store));
  }

  /** Gets (creating if needed) the per-module bucket inside a store object. */
  function moduleBucket(store, moduleId) {
    if (!store.modules[moduleId]) {
      store.modules[moduleId] = { attempts: [], questions: {} };
    }
    return store.modules[moduleId];
  }

  /** A question stat record with everything zeroed. */
  function emptyQuestionStat() {
    return {
      seen: 0,
      correct: 0,
      incorrect: 0,
      streak: 0,
      bestStreak: 0,
      lastResult: null,
      lastSeenAt: null,
      lastCorrectAt: null,
      lastIncorrectAt: null
    };
  }

  // --- public API ----------------------------------------------------------

  const Progress = {
    MASTERY_THRESHOLD: MASTERY_THRESHOLD,
    STORAGE_KEY: STORAGE_KEY,

    /**
     * Is progress actually being saved to disk? False means localStorage is
     * unavailable and everything is running in memory for this page view only.
     * Use it to show an honest "progress isn't being saved" note in a UI.
     * @returns {boolean}
     */
    isAvailable: function () {
      return !usingFallback;
    },

    /**
     * Records one completed quiz attempt. This is the single write path —
     * it appends to the attempt log AND folds the results into the per-question
     * stats in one go, so the two can never drift apart.
     *
     * @param {string} moduleId e.g. "sql"
     * @param {object} attempt
     * @param {number} attempt.score number answered correctly
     * @param {number} attempt.total number of questions in this attempt
     * @param {"full"|"retry"} [attempt.mode="full"] "retry" attempts don't count
     *        toward best score or mastery (see the MODE note at the top).
     * @param {Array<{questionId:string, correct:boolean, chosenIndex:number,
     *                chosenText:string, correctIndex:number}>} attempt.answers
     * @returns {object} the stored attempt record (with its generated id and
     *          timestamp), even when storage is unavailable
     */
    recordAttempt: function (moduleId, attempt) {
      const record = {
        id: makeId(),
        completedAt: nowISO(),
        mode: attempt && attempt.mode === "retry" ? "retry" : "full",
        score: numberOr(attempt && attempt.score, 0),
        total: numberOr(attempt && attempt.total, 0),
        answers: Array.isArray(attempt && attempt.answers) ? attempt.answers : []
      };

      const store = readStore();
      const bucket = moduleBucket(store, moduleId);

      bucket.attempts.push(record);
      // Trim from the front so the newest attempts always survive.
      if (bucket.attempts.length > MAX_ATTEMPTS_PER_MODULE) {
        bucket.attempts = bucket.attempts.slice(-MAX_ATTEMPTS_PER_MODULE);
      }

      record.answers.forEach(function (answer) {
        if (!answer || typeof answer.questionId !== "string") return;

        const stat = bucket.questions[answer.questionId] || emptyQuestionStat();

        stat.seen += 1;
        stat.lastSeenAt = record.completedAt;

        if (answer.correct) {
          stat.correct += 1;
          stat.streak += 1;
          stat.bestStreak = Math.max(stat.bestStreak, stat.streak);
          stat.lastResult = "correct";
          stat.lastCorrectAt = record.completedAt;
        } else {
          stat.incorrect += 1;
          stat.streak = 0; // one miss resets the streak — that's the point of it
          stat.lastResult = "incorrect";
          stat.lastIncorrectAt = record.completedAt;
        }

        bucket.questions[answer.questionId] = stat;
      });

      writeStore(store);
      return record;
    },

    /**
     * Everything a UI normally wants about one module, in one read.
     *
     * @param {string} moduleId
     * @returns {{moduleId:string, attemptCount:number, fullAttemptCount:number,
     *   bestScore:number|null, bestTotal:number|null, bestPercent:number|null,
     *   mastered:boolean, lastAttempt:object|null}}
     */
    getModuleSummary: function (moduleId) {
      const bucket = readStore().modules[moduleId];
      const attempts = bucket ? bucket.attempts : [];

      // Only full attempts are eligible for "best" and mastery.
      const fullAttempts = attempts.filter(function (a) {
        return a.mode === "full" && a.total > 0;
      });

      let best = null;
      fullAttempts.forEach(function (a) {
        const pct = a.score / a.total;
        if (best === null || pct > best.score / best.total) best = a;
      });

      return {
        moduleId: moduleId,
        attemptCount: attempts.length,
        fullAttemptCount: fullAttempts.length,
        bestScore: best ? best.score : null,
        bestTotal: best ? best.total : null,
        bestPercent: best ? best.score / best.total : null,
        mastered: best ? best.score / best.total >= MASTERY_THRESHOLD : false,
        lastAttempt: attempts.length ? attempts[attempts.length - 1] : null
      };
    },

    /** @returns {number|null} best score on a full attempt, or null if never taken */
    getBestScore: function (moduleId) {
      return this.getModuleSummary(moduleId).bestScore;
    },

    /** @returns {number} total attempts recorded, including retries */
    getAttemptCount: function (moduleId) {
      return this.getModuleSummary(moduleId).attemptCount;
    },

    /** @returns {object|null} the most recent attempt record */
    getLastAttempt: function (moduleId) {
      return this.getModuleSummary(moduleId).lastAttempt;
    },

    /** @returns {boolean} true once a full attempt has hit the 80% threshold */
    isMastered: function (moduleId) {
      return this.getModuleSummary(moduleId).mastered;
    },

    /**
     * Full attempt history for a module, oldest first. For a dashboard chart.
     * @returns {Array<object>}
     */
    getAttempts: function (moduleId) {
      const bucket = readStore().modules[moduleId];
      return bucket ? bucket.attempts.slice() : [];
    },

    /**
     * Summaries for several modules at once — the dashboard's main read.
     * @param {string[]} [moduleIds] defaults to every module found in storage
     * @returns {Array<object>}
     */
    getAllSummaries: function (moduleIds) {
      const ids = moduleIds || Object.keys(readStore().modules);
      const self = this;
      return ids.map(function (id) {
        return self.getModuleSummary(id);
      });
    },

    // --- per-question history (this is what phase 2 will lean on) ----------

    /**
     * @param {string} moduleId
     * @returns {Object<string, object>} map of questionId -> stat record
     */
    getQuestionStats: function (moduleId) {
      const bucket = readStore().modules[moduleId];
      return bucket ? bucket.questions : {};
    },

    /**
     * @param {string} moduleId
     * @param {string} questionId
     * @returns {object} the stat record, or a zeroed one if never answered
     */
    getQuestionStat: function (moduleId, questionId) {
      const stats = this.getQuestionStats(moduleId);
      return stats[questionId] || emptyQuestionStat();
    },

    /**
     * Questions you keep getting wrong — the seed list for flashcards.
     * Sorted worst-first: most misses, then least recently correct.
     *
     * @param {string} moduleId
     * @param {object} [options]
     * @param {number} [options.minIncorrect=1] only include questions missed at least this often
     * @returns {Array<{questionId:string, stat:object}>}
     */
    getStrugglingQuestions: function (moduleId, options) {
      const minIncorrect = (options && options.minIncorrect) || 1;
      const stats = this.getQuestionStats(moduleId);

      return Object.keys(stats)
        .filter(function (id) {
          return stats[id].incorrect >= minIncorrect;
        })
        .map(function (id) {
          return { questionId: id, stat: stats[id] };
        })
        .sort(function (a, b) {
          if (b.stat.incorrect !== a.stat.incorrect) return b.stat.incorrect - a.stat.incorrect;
          return (a.stat.lastCorrectAt || "") < (b.stat.lastCorrectAt || "") ? -1 : 1;
        });
    },

    /**
     * Questions you've reliably nailed — the candidates to retire from rotation.
     *
     * @param {string} moduleId
     * @param {object} [options]
     * @param {number} [options.minStreak=3] consecutive correct answers required
     * @returns {Array<{questionId:string, stat:object}>}
     */
    getMasteredQuestions: function (moduleId, options) {
      const minStreak = (options && options.minStreak) || 3;
      const stats = this.getQuestionStats(moduleId);

      return Object.keys(stats)
        .filter(function (id) {
          return stats[id].streak >= minStreak;
        })
        .map(function (id) {
          return { questionId: id, stat: stats[id] };
        });
    },

    // --- export / import (the no-backend escape hatch) ---------------------

    /**
     * @returns {string} the whole store as pretty-printed JSON
     */
    exportJSON: function () {
      return JSON.stringify(readStore(), null, 2);
    },

    /**
     * Triggers a browser download of the whole store.
     *
     * How it works: wrap the JSON string in a Blob (an in-memory file), ask the
     * browser for a temporary URL pointing at it, click an invisible link with
     * the `download` attribute, then release the URL. No server involved.
     *
     * @param {string} [filename] defaults to skillup-progress-YYYY-MM-DD.json
     * @returns {string} the filename used
     */
    downloadExport: function (filename) {
      const name = filename || "skillup-progress-" + nowISO().slice(0, 10) + ".json";
      const blob = new Blob([this.exportJSON()], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Release the object URL, otherwise the Blob is pinned in memory for the
      // life of the document.
      URL.revokeObjectURL(url);
      return name;
    },

    /**
     * Restores a previously exported file.
     *
     * @param {string} text the JSON text of an export
     * @param {object} [options]
     * @param {boolean} [options.merge=false] when true, keep existing data and
     *        only add modules the import has that storage doesn't. When false
     *        (the default) the import REPLACES everything.
     * @returns {{ok:boolean, error?:string, persisted?:boolean}}
     */
    importJSON: function (text, options) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        return { ok: false, error: "That file isn't valid JSON." };
      }

      const incoming = normaliseStore(parsed);
      if (!incoming) {
        return { ok: false, error: "That file doesn't look like a SkillUp progress export." };
      }

      let next = incoming;

      if (options && options.merge) {
        next = readStore();
        Object.keys(incoming.modules).forEach(function (moduleId) {
          if (!next.modules[moduleId]) {
            next.modules[moduleId] = incoming.modules[moduleId];
          }
        });
      }

      const persisted = writeStore(next);
      return { ok: true, persisted: persisted };
    },

    /**
     * Reads a File object (from an <input type="file">) and imports it.
     * @param {File} file
     * @param {object} [options] same options as importJSON
     * @returns {Promise<{ok:boolean, error?:string, persisted?:boolean}>}
     */
    importFile: function (file, options) {
      const self = this;
      return new Promise(function (resolve) {
        const reader = new FileReader();
        reader.onload = function () {
          resolve(self.importJSON(String(reader.result), options));
        };
        reader.onerror = function () {
          resolve({ ok: false, error: "Couldn't read that file." });
        };
        reader.readAsText(file);
      });
    },

    /**
     * Wipes progress. With no argument it clears everything; with a moduleId it
     * clears just that module.
     * @param {string} [moduleId]
     */
    reset: function (moduleId) {
      if (!moduleId) {
        writeStore(emptyStore());
        return;
      }
      const store = readStore();
      delete store.modules[moduleId];
      writeStore(store);
    },

    /**
     * Escape hatch for debugging in the console: the raw validated store.
     * Treat the return value as read-only — mutating it does not save anything.
     * @returns {object}
     */
    dump: function () {
      return readStore();
    }
  };

  global.Progress = Progress;
})(window);
