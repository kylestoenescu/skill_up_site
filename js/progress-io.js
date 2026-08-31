/*
 * progress-io.js — the small "Export / Import progress" UI on the home page.
 *
 * Kept separate from progress.js on purpose: progress.js is the data layer and
 * knows nothing about the DOM, this file is the UI and knows nothing about
 * localStorage. That separation is what lets the storage layer be reused by a
 * dashboard, flashcards, or anything else later without dragging buttons along
 * with it.
 *
 * The markup it drives lives in index.html and starts out `hidden`, so if
 * JavaScript is off or progress.js failed to load, you never see buttons that
 * wouldn't do anything.
 */

(function () {
  "use strict";

  function init() {
    const root = document.querySelector("[data-progress-tools]");
    if (!root) return;
    if (typeof window.Progress === "undefined") return;

    const exportBtn = root.querySelector("[data-progress-export]");
    const importInput = root.querySelector("[data-progress-import]");
    const statusEl = root.querySelector("[data-progress-status]");

    // Only reveal the controls once we know they'll work.
    root.hidden = false;

    /** @param {string} message @param {"ok"|"error"} [tone] */
    function setStatus(message, tone) {
      if (!statusEl) return;
      statusEl.textContent = message;
      statusEl.classList.remove("is-ok", "is-error");
      if (tone) statusEl.classList.add(tone === "error" ? "is-error" : "is-ok");
    }

    if (!window.Progress.isAvailable()) {
      setStatus(
        "This browser isn't allowing local storage, so nothing is being saved between visits.",
        "error"
      );
    }

    if (exportBtn) {
      exportBtn.addEventListener("click", function () {
        const filename = window.Progress.downloadExport();
        setStatus("Downloaded " + filename, "ok");
      });
    }

    if (importInput) {
      importInput.addEventListener("change", function () {
        const file = importInput.files && importInput.files[0];
        if (!file) return;

        /* Import replaces everything, so confirm first — this is the one action
         * here that can destroy data. */
        const proceed = window.confirm(
          "Importing replaces all progress currently stored in this browser. Continue?"
        );
        if (!proceed) {
          importInput.value = "";
          return;
        }

        window.Progress.importFile(file).then(function (result) {
          if (result.ok) {
            setStatus("Progress imported from " + file.name + ".", "ok");
          } else {
            setStatus(result.error || "Import failed.", "error");
          }
          // Reset the input so picking the same file again still fires `change`.
          importInput.value = "";
        });
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
