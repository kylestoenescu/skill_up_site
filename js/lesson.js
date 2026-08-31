/*
 * lesson.js — makes the worked examples in a lesson runnable.
 *
 * Finds every element marked [data-runnable], puts a Run button under it, and
 * shows what the code actually prints. The code that runs is read straight out
 * of the <code> block on the page, so what you see is exactly what executes —
 * there is no second copy to drift out of sync.
 *
 * ===========================================================================
 * THE TWO PROBLEMS THIS SOLVES
 * ===========================================================================
 *
 * 1. CAPTURING console.log WITHOUT TOUCHING THE REAL CONSOLE
 *
 * The obvious approach is to overwrite window.console.log, run the code, then
 * put it back. That works until two examples overlap — an async example is
 * still logging when you hit Run on another, and its output lands in the wrong
 * box, or the restore puts back an already-patched version.
 *
 * Instead, each run gets its OWN console, handed in as a function parameter:
 *
 *     new Function("console", code)
 *
 * Inside that function body, the name `console` resolves to the parameter, not
 * the global — a parameter shadows an outer binding. The real console is never
 * touched, two examples can run at once without interfering, and there is no
 * "restore" step that can fail. Callbacks defined inside the code close over
 * that parameter too, so a console.log inside a setTimeout is still captured.
 *
 * 2. OUTPUT THAT ARRIVES AFTER THE CODE FINISHES
 *
 * This is the part a naive runner gets wrong. For a promise or timer example:
 *
 *     console.log("A");
 *     setTimeout(function () { console.log("B"); }, 0);
 *
 * new Function(...)() returns as soon as it hits the end of the body — with "B"
 * not printed yet. Reading the captured output at that moment shows only "A",
 * which is exactly the misunderstanding these examples exist to correct.
 *
 * So the sink stays open for a settle window after the code returns, appending
 * lines as they arrive. Each example can ask for a longer window with
 * data-settle="900" when it uses real delays. Output renders as it appears, so
 * a synchronous example still feels instant.
 *
 * ===========================================================================
 * WHAT THIS IS NOT
 * ===========================================================================
 * It is not a sandbox. The code runs on this page with full access to the page,
 * and there is no timeout — an infinite loop freezes the tab and the only way
 * out is to close it. That is acceptable today because every example is one I
 * wrote and none of them loop. It stops being acceptable the moment these
 * become editable, which needs a Web Worker that can be terminated.
 */

(function () {
  "use strict";

  /** How long to keep listening for async output after the code returns. */
  const DEFAULT_SETTLE_MS = 250;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  /**
   * Renders a value the way a console would: strings bare, everything else as
   * JSON so objects and arrays are readable rather than "[object Object]".
   *
   * @param {*} value
   * @returns {string}
   */
  function format(value) {
    if (typeof value === "string") return value;
    if (value === undefined) return "undefined";
    if (typeof value === "function") return "[function]";
    try {
      // JSON.stringify returns undefined for things it can't represent.
      const json = JSON.stringify(value);
      return json === undefined ? String(value) : json;
    } catch (err) {
      return String(value); // circular structures, mostly
    }
  }

  /**
   * Wires one example: builds the Run button and the output panel.
   * @param {HTMLElement} block an element carrying [data-runnable]
   */
  function setupExample(block) {
    const codeEl = block.querySelector("code");
    if (!codeEl) return;

    const controls = el("div", "lesson-run");
    const button = el("button", "btn btn-secondary lesson-run-btn", "Run");
    button.type = "button";

    const output = el("div", "lesson-output");
    output.setAttribute("role", "status");
    output.hidden = true;

    controls.appendChild(button);
    block.appendChild(controls);
    block.appendChild(output);

    const settleMs = Number(block.dataset.settle) || DEFAULT_SETTLE_MS;

    button.addEventListener("click", function () {
      run(codeEl.textContent, output, button, settleMs);
    });
  }

  /**
   * Executes one example and streams its output into the panel.
   *
   * @param {string} source the code, read from the page
   * @param {HTMLElement} output where to render
   * @param {HTMLButtonElement} button re-enabled once the settle window closes
   * @param {number} settleMs how long to keep listening after the code returns
   */
  function run(source, output, button, settleMs) {
    output.hidden = false;
    output.textContent = "";
    output.classList.remove("has-error");
    button.disabled = true;
    button.textContent = "Running…";

    let lineCount = 0;
    let open = true; // false once the settle window closes

    function write(text, className) {
      /* Ignore anything that arrives after the window closed, rather than
       * appending to a panel the reader has moved on from. A long-running
       * timer in an example would otherwise write into it minutes later. */
      if (!open) return;
      lineCount++;
      output.appendChild(el("div", "lesson-output-line" + (className ? " " + className : ""), text));
    }

    /* The private console handed to the code. Only the methods worth having
     * are provided; anything else would be undefined inside the example, which
     * is fine because the examples only use these. */
    const sandboxConsole = {
      log: function () {
        write(Array.prototype.map.call(arguments, format).join(" "));
      },
      error: function () {
        write(Array.prototype.map.call(arguments, format).join(" "), "is-error");
      },
      warn: function () {
        write(Array.prototype.map.call(arguments, format).join(" "), "is-warn");
      }
    };

    try {
      /* new Function compiles the string into a real function whose only
       * parameter is `console`. It is compiled in the GLOBAL scope, not here,
       * so an example can't accidentally see this file's variables. */
      const fn = new Function("console", source);
      fn(sandboxConsole);
    } catch (err) {
      /* A synchronous throw — a syntax error, or something like JSON.parse on
       * bad input. Shown as output rather than swallowed, because several
       * examples are specifically about what throws and when. */
      write(err.name + ": " + err.message, "is-error");
      output.classList.add("has-error");
    }

    /* An async example is still running. Keep the sink open, then close it and
     * hand the button back.
     *
     * Note what this does NOT do: it cannot catch a rejected promise or an
     * error thrown inside a setTimeout callback, because by then the try/catch
     * above has already exited. See the note in the lesson about unhandled
     * rejections. */
    window.setTimeout(function () {
      open = false;
      if (lineCount === 0) {
        output.appendChild(el("div", "lesson-output-line is-muted", "(no output)"));
      }
      button.disabled = false;
      button.textContent = "Run again";
    }, settleMs);
  }

  function init() {
    const blocks = document.querySelectorAll("[data-runnable]");
    Array.prototype.forEach.call(blocks, setupExample);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
