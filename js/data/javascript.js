/*
 * Quiz data — JavaScript module.
 *
 * ---------------------------------------------------------------------------
 * THIS FILE IS SHAPED DIFFERENTLY TO THE OTHER SIX
 * ---------------------------------------------------------------------------
 * Every other module is a flat list of multiple-choice questions. This one is a
 * three-stage progression, each stage gating the next:
 *
 *   1. trace    — read a snippet, predict what it prints. No writing.
 *   2. parsons  — the right lines of a working solution, scrambled; reorder them.
 *   3. free     — write the code yourself against a stated expected output.
 *
 * The order is deliberate: predicting behaviour is easier than assembling code,
 * which is easier than producing it from nothing. Each stage is a smaller step
 * than "read about closures, now write one".
 *
 * WHAT HAPPENED TO THE ORIGINAL FIVE QUESTIONS
 * They are all still here, with their original ids (js-1 … js-5) so their
 * answer history survives. What changed is their FORM: four of the five were
 * recognition questions ("What is a closure?"), and this stage is specifically
 * about predicting output, so each was rewritten as a snippet that tests the
 * same idea. js-2 (typeof null) was already a trace question and is untouched.
 *
 *   js-1  block scoping        was: which keyword declares…   now: trace let in a block
 *   js-2  typeof null          unchanged
 *   js-3  JSON round-trip      was: which method parses JSON  now: trace stringify
 *   js-4  closures             was: what is a closure         now: trace a counter
 *   js-5  promises             was: which creates a Promise   now: trace resolve order
 *
 * Keeping the id while rewording is the documented rule for this project: the
 * id is the question's identity, the text is allowed to change. The topic each
 * id stands for has not moved.
 *
 * ---------------------------------------------------------------------------
 * SHAPES
 * ---------------------------------------------------------------------------
 * trace question:   { id, code, question, options[], correctIndex, explanation }
 * parsons puzzle:   { id, prompt, lines[]  (IN CORRECT ORDER), explanation }
 * free-write task:  { id, prompt, expected, starter, solution, hints[] }
 *
 * `lines` is stored in the correct order and shuffled at render time — the same
 * discipline the quiz engine uses for options, so the answer key lives in the
 * data and never in the DOM.
 */

window.QUIZ_DATA = window.QUIZ_DATA || {};

window.QUIZ_DATA["javascript"] = {
  moduleId: "javascript",
  title: "JavaScript",

  stages: [
    // =====================================================================
    {
      id: "trace",
      type: "trace",
      title: "Trace",
      blurb:
        "Read each snippet and predict what it prints. Nothing to write yet — " +
        "this is about whether you can follow what the code actually does.",
      questions: [
        {
          id: "js-1",
          question: "What does this print?",
          code:
            "let total = 1;\n" +
            "{\n" +
            "  let total = 2;\n" +
            "  total = 3;\n" +
            "}\n" +
            "console.log(total);",
          options: ["1", "2", "3", "ReferenceError"],
          correctIndex: 0,
          explanation:
            "The inner `let total` is a separate, block-scoped variable. Reassigning it " +
            "to 3 never touches the outer one, so the outer total is still 1. Had the " +
            "inner declaration been left out, the assignment would have hit the outer " +
            "variable and printed 3."
        },
        {
          id: "js-2",
          question: "What does this print?",
          code: "console.log(typeof null);",
          options: ["\"null\"", "\"undefined\"", "\"object\"", "\"boolean\""],
          correctIndex: 2,
          explanation:
            "A long-standing JavaScript quirk — typeof null returns \"object\", even " +
            "though null is its own primitive type. It is kept for backwards " +
            "compatibility and is not going to be fixed."
        },
        {
          id: "js-3",
          question: "What does this print?",
          code:
            "const user = { name: \"Ada\", age: undefined };\n" +
            "console.log(JSON.stringify(user));",
          options: [
            "{\"name\":\"Ada\"}",
            "{\"name\":\"Ada\",\"age\":undefined}",
            "{\"name\":\"Ada\",\"age\":null}",
            "{\"name\":\"Ada\",\"age\":\"\"}"
          ],
          correctIndex: 0,
          explanation:
            "JSON has no undefined, so JSON.stringify drops object properties whose " +
            "value is undefined. (Inside an array it can't drop them, so it writes null " +
            "instead.) JSON.parse does the reverse trip, turning JSON text back into a " +
            "JavaScript value."
        },
        {
          id: "js-4",
          question: "What does this print?",
          code:
            "function makeCounter() {\n" +
            "  let count = 0;\n" +
            "  return function () {\n" +
            "    count = count + 1;\n" +
            "    return count;\n" +
            "  };\n" +
            "}\n" +
            "const next = makeCounter();\n" +
            "next();\n" +
            "next();\n" +
            "console.log(next());",
          options: ["1", "3", "0", "undefined"],
          correctIndex: 1,
          explanation:
            "This is a closure. The returned function keeps access to `count` from the " +
            "scope it was created in, even though makeCounter has already returned. The " +
            "same `count` is incremented on each call, so the third call returns 3."
        },
        {
          id: "js-5",
          question: "What does this print, and in what order?",
          code:
            "console.log(\"A\");\n" +
            "Promise.resolve().then(function () {\n" +
            "  console.log(\"B\");\n" +
            "});\n" +
            "console.log(\"C\");",
          options: ["A C B", "A B C", "B A C", "C A B"],
          correctIndex: 0,
          explanation:
            "A .then() callback never runs immediately, even on an already-resolved " +
            "promise. It is queued and runs once the current synchronous code finishes — " +
            "so both console.log calls in the main body run first, then B."
        },
        {
          id: "js-t6",
          question: "What does this print, and in what order?",
          code:
            "setTimeout(function () {\n" +
            "  console.log(\"timeout\");\n" +
            "}, 0);\n" +
            "Promise.resolve().then(function () {\n" +
            "  console.log(\"promise\");\n" +
            "});\n" +
            "console.log(\"sync\");",
          options: [
            "sync promise timeout",
            "sync timeout promise",
            "timeout promise sync",
            "promise sync timeout"
          ],
          correctIndex: 0,
          explanation:
            "Synchronous code first, always. Then promise callbacks (the microtask " +
            "queue), which are drained before timers. setTimeout with 0ms does not mean " +
            "\"now\" — it means \"after the current work and any pending microtasks\"."
        }
      ]
    },

    // =====================================================================
    {
      id: "parsons",
      type: "parsons",
      title: "Build",
      blurb:
        "Each of these is a working solution with its lines shuffled. Put them " +
        "back in order. You are not writing anything — just deciding what has to " +
        "happen before what.",
      puzzles: [
        {
          id: "js-p1",
          prompt:
            "Assemble makeCounter: a function that returns a function, where each " +
            "call to the returned function gives the next number starting at 1.",
          lines: [
            "function makeCounter() {",
            "  let count = 0;",
            "  return function () {",
            "    count = count + 1;",
            "    return count;",
            "  };",
            "}"
          ],
          explanation:
            "`count` has to be declared inside makeCounter but outside the returned " +
            "function — that is what makes it survive between calls. Declaring it " +
            "inside the inner function would reset it to 0 every time."
        },
        {
          id: "js-p2",
          prompt:
            "Assemble a `delay` function that returns a Promise resolving after a " +
            "given number of milliseconds.",
          lines: [
            "function delay(ms) {",
            "  return new Promise(function (resolve) {",
            "    setTimeout(resolve, ms);",
            "  });",
            "}"
          ],
          explanation:
            "The Promise constructor takes a function that receives `resolve`. Handing " +
            "`resolve` straight to setTimeout means the promise settles when the timer " +
            "fires. Note the `return` — without it the function hands back undefined and " +
            "nothing can await it."
        },
        {
          id: "js-p3",
          prompt:
            "Assemble a `safeParse` function that returns the parsed object, or null " +
            "if the text is not valid JSON.",
          lines: [
            "function safeParse(text) {",
            "  try {",
            "    return JSON.parse(text);",
            "  } catch (err) {",
            "    return null;",
            "  }",
            "}"
          ],
          explanation:
            "JSON.parse throws on malformed input rather than returning undefined, so " +
            "the try/catch is the whole point. The `return` inside try exits before the " +
            "catch is ever reached when parsing succeeds."
        }
      ]
    },

    // =====================================================================
    {
      id: "free",
      type: "free",
      title: "Write",
      blurb:
        "Now write it yourself. Type your answer, then reveal the expected output " +
        "and a worked solution and mark honestly whether yours does the same thing.",
      tasks: [
        {
          id: "js-f1",
          prompt:
            "Write a function `double` that takes an array of numbers and returns a " +
            "new array with every number doubled. Do not modify the original array.",
          starter: "function double(nums) {\n  \n}\n\nconsole.log(double([1, 2, 3]));",
          expected: "[2, 4, 6]",
          solution:
            "function double(nums) {\n" +
            "  return nums.map(function (n) {\n" +
            "    return n * 2;\n" +
            "  });\n" +
            "}\n\n" +
            "console.log(double([1, 2, 3]));",
          hints: [
            "map() returns a new array and leaves the original alone.",
            "A for loop pushing into a new array is equally correct."
          ]
        },
        {
          id: "js-f2",
          prompt:
            "Write `makeGreeter(greeting)`, which returns a function. Calling that " +
            "returned function with a name should produce \"<greeting>, <name>!\". " +
            "This is the closure idea from stage 1, built from scratch.",
          starter:
            "function makeGreeter(greeting) {\n  \n}\n\n" +
            "const hi = makeGreeter(\"Hello\");\nconsole.log(hi(\"Ada\"));",
          expected: "Hello, Ada!",
          solution:
            "function makeGreeter(greeting) {\n" +
            "  return function (name) {\n" +
            "    return greeting + \", \" + name + \"!\";\n" +
            "  };\n" +
            "}\n\n" +
            "const hi = makeGreeter(\"Hello\");\n" +
            "console.log(hi(\"Ada\"));",
          hints: [
            "The inner function has to be returned, not called.",
            "`greeting` stays available to the inner function — that is the closure."
          ]
        },
        {
          id: "js-f3",
          prompt:
            "Write an async function `loadName` that awaits a promise resolving to " +
            "{ name: \"Ada\" } and logs just the name. Use the `fetchUser` function " +
            "given in the starter.",
          starter:
            "function fetchUser() {\n" +
            "  return Promise.resolve({ name: \"Ada\" });\n" +
            "}\n\n" +
            "async function loadName() {\n  \n}\n\nloadName();",
          expected: "Ada",
          solution:
            "function fetchUser() {\n" +
            "  return Promise.resolve({ name: \"Ada\" });\n" +
            "}\n\n" +
            "async function loadName() {\n" +
            "  const user = await fetchUser();\n" +
            "  console.log(user.name);\n" +
            "}\n\n" +
            "loadName();",
          hints: [
            "`await` only works inside a function marked `async`.",
            "await gives you the resolved value directly — no .then needed."
          ]
        }
      ]
    }
  ]
};

/*
 * Flat list of the multiple-choice questions, for the parts of the site that
 * expect every module to expose `questions`: the flashcard deck and the
 * dashboard's "questions to review" table, which look questions up by id.
 *
 * Only the trace stage appears here. Parsons puzzles and free-write tasks have
 * no single correct option to grade, so they can't be flashcards — they're
 * excluded on purpose rather than by oversight.
 */
window.QUIZ_DATA["javascript"].questions =
  window.QUIZ_DATA["javascript"].stages[0].questions;
