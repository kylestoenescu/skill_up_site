/*
 * Quiz data — REST APIs module.
 * See js/data/javascript.js for the full explanation of this file's shape.
 *
 * Note the registry key is "restApis" (a valid JS identifier) while the
 * moduleId is "rest-apis" (matches the filename and the URL). The moduleId is
 * what gets written to storage, so it's the one that must never change.
 */

window.QUIZ_DATA = window.QUIZ_DATA || {};

window.QUIZ_DATA.restApis = {
  moduleId: "rest-apis",
  title: "REST APIs",
  questions: [
    {
      id: "rest-1",
      question: "Which HTTP method is conventionally used to retrieve a resource without modifying it?",
      options: ["POST", "GET", "DELETE", "PUT"],
      correctIndex: 1,
      explanation: "GET requests are meant to be safe and read-only, fetching a resource's current representation."
    },
    {
      id: "rest-2",
      question: "What does it mean for a REST API to be \"stateless\"?",
      options: [
        "The server never stores any data",
        "Each request must contain all the information needed to process it, since the server holds no client session state between requests",
        "The API has no error states",
        "Clients can only make one request per session"
      ],
      correctIndex: 1,
      explanation: "Statelessness means the server doesn't remember prior requests — every request is self-contained, which helps APIs scale."
    },
    {
      id: "rest-3",
      question: "Which HTTP status code indicates a request succeeded and a new resource was created?",
      options: ["200 OK", "201 Created", "404 Not Found", "500 Internal Server Error"],
      correctIndex: 1,
      explanation: "201 Created specifically signals that the request succeeded and resulted in a new resource, often returned from a POST."
    },
    {
      id: "rest-4",
      question: "Which HTTP method is typically used to completely replace an existing resource?",
      options: ["GET", "PATCH", "PUT", "OPTIONS"],
      correctIndex: 2,
      explanation: "PUT conventionally replaces a resource in full, while PATCH applies a partial update."
    },
    {
      id: "rest-5",
      question: "In REST, resources are typically identified by:",
      options: ["Function names", "URLs (URIs)", "Global variables", "Environment variables"],
      correctIndex: 1,
      explanation: "Every REST resource has its own URL, such as /users/42, which clients use to address it directly."
    }
  ]
};
