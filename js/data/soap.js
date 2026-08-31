/*
 * Quiz data — SOAP module.
 * See js/data/javascript.js for the full explanation of this file's shape.
 */

window.QUIZ_DATA = window.QUIZ_DATA || {};

window.QUIZ_DATA["soap"] = {
  moduleId: "soap",
  title: "SOAP",
  questions: [
    {
      id: "soap-1",
      question: "What format does SOAP use to structure its messages?",
      options: ["JSON", "XML", "YAML", "Plain text"],
      correctIndex: 1,
      explanation: "SOAP messages are always XML documents with a strict structure."
    },
    {
      id: "soap-2",
      question: "What document describes the operations, messages, and location of a SOAP web service?",
      options: ["A Swagger file", "WSDL", "A README", "manifest.json"],
      correctIndex: 1,
      explanation: "WSDL (Web Services Description Language) is the XML contract that describes a SOAP service's operations."
    },
    {
      id: "soap-3",
      question: "What is the outermost element of a SOAP message called?",
      options: ["Body", "Header", "Envelope", "Fault"],
      correctIndex: 2,
      explanation: "The Envelope wraps the entire message, containing an optional Header and a required Body."
    },
    {
      id: "soap-4",
      question: "Which element carries error information when a SOAP request fails?",
      options: ["SOAP:Error", "SOAP:Fault", "SOAP:Exception", "SOAP:Warning"],
      correctIndex: 1,
      explanation: "A Fault element inside the Body reports errors, including a fault code and message."
    },
    {
      id: "soap-5",
      question: "Compared to REST, SOAP is generally considered:",
      options: [
        "Lightweight and stateless by default",
        "More rigid, with a strict contract and built-in standards like WS-Security",
        "Only usable over FTP",
        "Impossible to use with HTTP"
      ],
      correctIndex: 1,
      explanation: "SOAP enforces a formal contract (WSDL) and supports built-in standards like WS-Security, making it stricter but more heavyweight than typical REST APIs."
    }
  ]
};
