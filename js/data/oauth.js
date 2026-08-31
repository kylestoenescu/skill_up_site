/*
 * Quiz data — OAuth module.
 * See js/data/javascript.js for the full explanation of this file's shape.
 */

window.QUIZ_DATA = window.QUIZ_DATA || {};

window.QUIZ_DATA["oauth"] = {
  moduleId: "oauth",
  title: "OAuth",
  questions: [
    {
      id: "oauth-1",
      question: "What problem does OAuth primarily solve?",
      options: [
        "Encrypting data at rest",
        "Letting an app access a user's resources on another service without handling the user's password",
        "Compressing HTTP responses",
        "Translating between XML and JSON"
      ],
      correctIndex: 1,
      explanation: "OAuth is an authorization framework for delegated access — the client never sees the user's credentials."
    },
    {
      id: "oauth-2",
      question: "In OAuth terminology, who owns the data being accessed?",
      options: ["The client", "The authorization server", "The resource owner", "The resource server"],
      correctIndex: 2,
      explanation: "The resource owner is the user who owns the data and grants (or denies) access to it."
    },
    {
      id: "oauth-3",
      question: "What is issued to a client after successful authorization, and used to access protected resources?",
      options: ["A session cookie", "An access token", "A password hash", "A CSRF token"],
      correctIndex: 1,
      explanation: "The access token is the credential the client presents to the resource server on each request."
    },
    {
      id: "oauth-4",
      question: "Which OAuth grant type is recommended for a server-side web app exchanging a code for a token?",
      options: ["Implicit grant", "Authorization code grant", "Password grant", "OAuth doesn't use grant types"],
      correctIndex: 1,
      explanation: "The authorization code grant is the standard, secure flow for server-side apps: the app gets a short-lived code, then exchanges it server-to-server for a token."
    },
    {
      id: "oauth-5",
      question: "What is the purpose of \"scopes\" in an OAuth request?",
      options: [
        "To define the visual theme of the login page",
        "To limit exactly what access the client is requesting",
        "To specify the token's expiration date format",
        "To encrypt the access token"
      ],
      correctIndex: 1,
      explanation: "Scopes let the client request narrow, specific permissions (like read-only calendar access) rather than blanket account access."
    }
  ]
};
