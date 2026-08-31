/*
 * Quiz data — SQL module.
 * See js/data/javascript.js for the full explanation of this file's shape.
 */

window.QUIZ_DATA = window.QUIZ_DATA || {};

window.QUIZ_DATA.sql = {
  moduleId: "sql",
  title: "SQL",
  questions: [
    {
      id: "sql-1",
      question: "Which clause filters individual rows before any grouping or aggregation happens?",
      options: ["WHERE", "HAVING", "GROUP BY", "ORDER BY"],
      correctIndex: 0,
      explanation: "WHERE filters rows before aggregation; HAVING filters groups after aggregation has already happened."
    },
    {
      id: "sql-2",
      question: "Which JOIN returns every row from the left table, with NULLs where there's no matching row on the right?",
      options: ["INNER JOIN", "LEFT JOIN", "RIGHT JOIN", "CROSS JOIN"],
      correctIndex: 1,
      explanation: "A LEFT JOIN keeps all left-table rows regardless of a match; unmatched right-table columns come back as NULL."
    },
    {
      id: "sql-3",
      question: "What does a PRIMARY KEY constraint guarantee about a column?",
      options: [
        "Its values are unique and never NULL",
        "Its values are always sorted in ascending order",
        "It must reference another table",
        "It allows duplicate values"
      ],
      correctIndex: 0,
      explanation: "A primary key uniquely identifies each row, so its values must be unique and cannot be NULL."
    },
    {
      id: "sql-4",
      question: "Which statement removes rows from a table without dropping the table itself?",
      options: [
        "DELETE FROM table_name;",
        "DROP TABLE table_name;",
        "TRUNCATE DATABASE;",
        "REMOVE FROM table_name;"
      ],
      correctIndex: 0,
      explanation: "DELETE FROM removes rows (optionally filtered with WHERE) while leaving the table structure intact."
    },
    {
      id: "sql-5",
      question: "What does GROUP BY do in a query?",
      options: [
        "Groups rows that share a value so aggregate functions can be applied per group",
        "Sorts all rows in ascending order",
        "Removes every duplicate row from the result",
        "Joins two tables together"
      ],
      correctIndex: 0,
      explanation: "GROUP BY collapses rows sharing a value into groups, typically paired with aggregates like COUNT() or AVG()."
    }
  ]
};
