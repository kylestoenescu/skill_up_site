/*
 * Quiz data — FHIR module.
 * See js/data/javascript.js for the full explanation of this file's shape.
 */

window.QUIZ_DATA = window.QUIZ_DATA || {};

window.QUIZ_DATA.fhir = {
  moduleId: "fhir",
  title: "FHIR",
  questions: [
    {
      id: "fhir-1",
      question: "What does FHIR stand for?",
      options: [
        "Fast Healthcare Interoperability Resources",
        "Federal Health Information Records",
        "Flexible Hospital Information Repository",
        "Format for Health Information Reporting"
      ],
      correctIndex: 0,
      explanation: "FHIR is short for Fast Healthcare Interoperability Resources, an HL7 standard."
    },
    {
      id: "fhir-2",
      question: "What is the basic building block of FHIR data called?",
      options: ["A Resource", "A Table", "An Endpoint", "A Schema"],
      correctIndex: 0,
      explanation: "FHIR data is organized into Resources such as Patient, Observation, and Encounter."
    },
    {
      id: "fhir-3",
      question: "Which architectural style does FHIR primarily use for its API?",
      options: ["SOAP", "RESTful HTTP", "FTP", "gRPC"],
      correctIndex: 1,
      explanation: "FHIR is built around standard RESTful HTTP conventions like GET, POST, and PUT on resource URLs."
    },
    {
      id: "fhir-4",
      question: "Which FHIR resource represents an individual receiving care?",
      options: ["Practitioner", "Patient", "Encounter", "Observation"],
      correctIndex: 1,
      explanation: "The Patient resource represents the person receiving care; Practitioner represents the caregiver."
    },
    {
      id: "fhir-5",
      question: "In which formats can FHIR resources typically be represented?",
      options: ["Only CSV", "JSON and XML", "Only plain text", "Only PDF"],
      correctIndex: 1,
      explanation: "FHIR resources are most commonly exchanged as JSON, with XML also fully supported."
    }
  ]
};
