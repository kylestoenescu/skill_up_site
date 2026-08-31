/*
 * Quiz data — JavaScript module.
 *
 * ---------------------------------------------------------------------------
 * HOW THESE DATA FILES WORK (read this one, the other six follow the same shape)
 * ---------------------------------------------------------------------------
 * There is no build step and no module bundler on this site, so these files are
 * plain <script> tags. A plain script can't "export" anything, so instead each
 * data file hangs its object off one shared global registry: window.QUIZ_DATA.
 *
 * The line below means "use the existing registry if some other data file
 * already created it, otherwise create an empty one". That way the seven files
 * are order-independent — none of them depends on being loaded first.
 *
 * A module page then does:
 *   <script src="../js/data/javascript.js"></script>
 *   <script>initQuiz("quiz", QUIZ_DATA.javascript);</script>
 *
 * Question shape:
 *   id           — STABLE identifier, unique across the whole site. This is what
 *                  progress.js uses to track "have I answered this question
 *                  before, and did I get it right". Never renumber or reuse an
 *                  id, or you'll silently merge two questions' histories.
 *                  Editing the question *text* is fine; the id is the identity.
 *   question     — the prompt shown to the learner
 *   options      — answer choices, in authoring order
 *   correctIndex — index into `options` AS WRITTEN HERE. The quiz engine shuffles
 *                  options at display time but always keeps the original index
 *                  attached to each radio button, so this number stays correct
 *                  no matter how the options get reordered on screen.
 *   explanation  — shown after grading. No leading space: the gap after the
 *                  "Correct." / "Not quite." label comes from CSS now.
 */

window.QUIZ_DATA = window.QUIZ_DATA || {};

window.QUIZ_DATA.javascript = {
  moduleId: "javascript",
  title: "JavaScript",
  questions: [
    {
      id: "js-1",
      question: "Which keyword declares a block-scoped variable that can be reassigned later?",
      options: ["var", "let", "const", "function"],
      correctIndex: 1,
      explanation: "let is block-scoped and reassignable; const is block-scoped but cannot be reassigned, and var is function-scoped."
    },
    {
      id: "js-2",
      question: "What does console.log(typeof null) print?",
      options: ["\"null\"", "\"undefined\"", "\"object\"", "\"boolean\""],
      correctIndex: 2,
      explanation: "This is a long-standing JavaScript quirk — typeof null returns \"object\", even though null is its own primitive type."
    },
    {
      id: "js-3",
      question: "Which method converts a JSON string into a JavaScript object?",
      options: ["JSON.stringify()", "JSON.parse()", "Object.assign()", "JSON.toObject()"],
      correctIndex: 1,
      explanation: "JSON.parse() turns a JSON string into a JS value; JSON.stringify() does the reverse."
    },
    {
      id: "js-4",
      question: "What is a closure?",
      options: [
        "A function that retains access to variables from its outer scope even after that outer function has returned",
        "A way to close a browser tab from JavaScript",
        "A loop that never terminates",
        "A method for closing a database connection"
      ],
      correctIndex: 0,
      explanation: "Closures let inner functions \"remember\" the variables from the scope they were created in."
    },
    {
      id: "js-5",
      question: "Which of these correctly creates a Promise that resolves after 1 second?",
      options: [
        "new Promise((resolve) => setTimeout(resolve, 1000))",
        "Promise.wait(1000)",
        "setTimeout(new Promise(), 1000)",
        "await Promise(1000)"
      ],
      correctIndex: 0,
      explanation: "A Promise executor receives resolve and reject callbacks; calling resolve inside setTimeout resolves it after the delay."
    }
  ]
};
