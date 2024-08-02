const express = require("express");
const bodyParser = require("body-parser");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const cors = require("cors");
const natural = require("natural");
const helmet = require("helmet");
const compression = require("compression");
require("dotenv").config(); // For environment variables

const app = express();
const PORT = process.env.PORT || 4000;

// CORS configuration
app.use(cors({
  origin: ['https://www.netsachglobal.com', 'https://93.127.195.134'],
  optionsSuccessStatus: 200,
}));

// Use Helmet to secure HTTP headers
app.use(helmet());

// Enable compression to improve performance
app.use(compression());

// Middleware
app.use(bodyParser.json());

// Multer setup for file uploads with in-memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Endpoint for uploading resume
app.post("/api/upload", upload.single("resume"), async (req, res) => {
  try {
    const buffer = req.file.buffer;
    const text = (await pdfParse(buffer)).text;

    // Extracted data using improved methods
    const extractedData = {
      fullName: extractFullName(text),
      email: extractEmail(text),
      phoneNumber: extractPhoneNumber(text),
      skills: extractSkills(text),
      address: extractAddress(text),
      education: extractEducation(text),
      experience: extractExperience(text),
      certifications: extractCertifications(text),
      languages: extractLanguages(text),
    };

    console.log("Extracted Data:", extractedData);

    res.json({ success: true, data: extractedData });
  } catch (error) {
    console.error("Error processing resume:", error);
    res.status(500).json({ success: false, message: "Error processing resume" });
  }
});

// Function to extract full name using NLP techniques
function extractFullName(text) {
  const nameRegex = /[A-Z][a-z]+(?: [A-Z][a-z]+)*/;
  const match = text.match(nameRegex);
  return match ? match[0].trim() : "";
}

// Function to extract email using regex
function extractEmail(text) {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
  const match = text.match(emailRegex);
  return match ? match[0].trim() : "";
}

// Function to extract phone number using regex
function extractPhoneNumber(text) {
  const phoneRegex = /\b(?:\d[-\s]?){9}\d\b/;
  const match = text.match(phoneRegex);
  return match ? match[0].trim() : "";
}

// Function to extract skills using NLP techniques
function extractSkills(text) {
  const tokenizer = new natural.WordTokenizer();
  const skillWords = ["Skills", "Core Competencies", "Technical Skills"];
  const skillsRegex = new RegExp(
    `(${skillWords.join("|")}):?\\s*([\\w\\s,]+)`,
    "i"
  );
  const match = text.match(skillsRegex);
  if (match) {
    const skillTokens = tokenizer.tokenize(match[2]);
    return skillTokens.map((skill) => skill.trim());
  }
  return [];
}

// Function to extract address using regex
function extractAddress(text) {
  const addressRegex = /\b(Address|Location)(?:\s*:\s*)?([\w\s,]+)/i;
  const match = text.match(addressRegex);
  return match ? match[2].trim() : "";
}

// Function to extract education using regex
function extractEducation(text) {
  const educationRegex = /(\d{4}\s*-\s*\d{4})\s*(.*?)\n/gs;
  const educationMatches = [...text.matchAll(educationRegex)];

  return educationMatches.map((match) => {
    const period = match[1].trim();
    const details = match[2].trim().split(/\n\s*\n/); // Split by double new lines

    const educationEntries = details.map((entry) => {
      const lines = entry.trim().split("\n");
      const title = lines[0].trim();
      const institution = lines[1] ? lines[1].trim() : ""; // Ensure institution exists
      return { title, institution };
    });

    return { period, educationEntries };
  });
}

// Function to extract experience using regex
function extractExperience(text) {
  const experienceRegex =
    /(\d{4}-\d{2}\s*-\s*\w*\s*\d*)\s*-\s*(.*?),\s*(.*?)(?=\n\d{4}-\d{2}\s*-\s*\w*\s*\d*|\n$)/gs;
  const experienceMatches = [...text.matchAll(experienceRegex)];

  return experienceMatches.map((match) => {
    const period = match[1].trim();
    const company = match[2].trim();
    const position = match[3].trim();

    return { period, company, position };
  });
}

// Function to extract certifications using regex
function extractCertifications(text) {
  const certificationsRegex =
    /(Certifications|Certificates|Certification|Certified):?\s*([\w\s,;]+)/gi;
  const certifications = [];
  let match;

  while ((match = certificationsRegex.exec(text)) !== null) {
    const certList = match[2].split(/[;,]/).map((cert) => cert.trim());
    certifications.push(...certList);
  }

  return certifications;
}

// Function to extract languages using regex
function extractLanguages(text) {
  const languagesRegex = /(Languages|Spoken Languages):?\s*([\w\s,;]+)/i;
  const match = text.match(languagesRegex);
  return match ? match[2].split(";").map((lang) => lang.trim()) : [];
}

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
