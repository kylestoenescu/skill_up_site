/*
 * Quiz data — Python module.
 * See js/data/javascript.js for the full explanation of this file's shape.
 */

window.QUIZ_DATA = window.QUIZ_DATA || {};

window.QUIZ_DATA["python"] = {
  moduleId: "python",
  title: "Python",
  questions: [
    {
      id: "py-1",
      question: "How do you define a function named my_func in Python?",
      options: ["def my_func():", "function myFunc() {}", "func myFunc()", "void myFunc()"],
      correctIndex: 0,
      explanation: "Python functions start with the def keyword, followed by the name, parentheses, and a colon."
    },
    {
      id: "py-2",
      question: "What does range(5) return in Python 3?",
      options: ["A list of five numbers", "A range object that produces values lazily when iterated", "A tuple", "A string"],
      correctIndex: 1,
      explanation: "In Python 3, range() returns a lazy, iterable range object rather than building a full list in memory."
    },
    {
      id: "py-3",
      question: "Which line correctly creates a list of squares for 0 through 4 using a list comprehension?",
      options: [
        "[x**2 for x in range(5)]",
        "list x**2 for x in range(5)",
        "[x^2 for x in range(5)]",
        "squares(x**2, range(5))"
      ],
      correctIndex: 0,
      explanation: "List comprehensions use the form [expression for item in iterable]. Note ** is Python's exponent operator, not ^."
    },
    {
      id: "py-4",
      question: "What does the expression 5 / 0 raise in Python?",
      options: ["ZeroDivisionError", "SyntaxError", "TypeError", "It returns 0"],
      correctIndex: 0,
      explanation: "Dividing by zero raises a ZeroDivisionError at runtime."
    },
    {
      id: "py-5",
      question: "Which keyword is used to catch exceptions in Python?",
      options: ["catch", "except", "rescue", "handle"],
      correctIndex: 1,
      explanation: "Python uses try/except (optionally with else and finally) rather than try/catch."
    }
  ]
};
