const express = require("express");
const bodyParser = require("body-parser");
const { MongoClient, ObjectId } = require("mongodb");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const compression = require("compression");
const https = require("https");

// Application setup
const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors({
  origin: ['http://www.netsachglobal.com', 'https://93.127.195.134'], // Replace with your Angular application domain or IP
  optionsSuccessStatus: 200,
}));
app.use(helmet()); // Security headers
app.use(bodyParser.json());
app.use(compression()); // Compress responses

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
});
app.use('/api/', apiLimiter);

// Ensure uploads directory exists
const uploadDir = "uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Configure Multer for file storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// MongoDB connection
const uri = "mongodb://93.127.195.134:27017"; // Replace with your MongoDB domain or IP
const client = new MongoClient(uri);
const databaseName = "EmailAll";
const collectionName = "resumes";
const fileMetadataCollectionName = "fileMetadata";

let db;

(async () => {
  try {
    await client.connect();
    db = client.db(databaseName);
    console.log("Connected to MongoDB");

    // Verify collection existence
    const collections = await db.listCollections().toArray();
    console.log("Existing collections:", collections.map(col => col.name));
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1);
  }
})();

async function extractTextFromPDF(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdfParse(dataBuffer);
  return data.text;
}

function parseResumeText(text) {
  const lines = text.split("\n");
  const resumeData = {};

  lines.forEach((line) => {
    if (line.includes("Name:")) {
      resumeData.name = line.split("Name:")[1].trim();
    } else if (line.includes("Email:")) {
      resumeData.email = line.split("Email:")[1].trim();
    } else if (line.includes("Phone:")) {
      resumeData.phone = line.split("Phone:")[1].trim();
    } else if (line.includes("Skills:")) {
      resumeData.skills = line.split("Skills:")[1].trim().split(", ");
    }
  });

  return resumeData;
}

// Routes
app.post("/api/resume", async (req, res) => {
  const resumeData = req.body;
  const collection = db.collection(collectionName);

  try {
    await collection.insertOne(resumeData);
    const analysisResult = await analyzeResume(resumeData);

    res.json({
      message: "Resume saved successfully!",
      analysisResult: analysisResult,
    });
  } catch (error) {
    console.error("Error analyzing resume:", error);
    res.status(500).json({ error: "Failed to analyze resume" });
  }
});

app.get('/api/resumes', async (req, res) => {
  const searchTerm = req.query.search || '';

  try {
    const searchRegex = new RegExp(searchTerm, 'i');
    const resumes = await db.collection(collectionName).find({
      $or: [
        { name: searchRegex },
        { skills: searchRegex }
      ]
    }).toArray();

    res.status(200).json(resumes);
  } catch (error) {
    console.error('Error fetching resumes:', error);
    res.status(500).send({ message: 'Error fetching resumes. Please try again.' });
  }
});

app.delete("/api/resumes/:id", async (req, res) => {
  console.log('Deleting resume with ID:', req.params.id);
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).send({ message: "Invalid resume ID format" });
    }

    const result = await db.collection(collectionName).deleteOne({ _id: new ObjectId(req.params.id) });

    if (result.deletedCount > 0) {
      res.status(200).send({ message: "Resume deleted successfully" });
    } else {
      res.status(404).send({ message: "Resume not found" });
    }
  } catch (error) {
    console.error("Error deleting resume:", error);
    res.status(500).send({ message: "Error deleting resume", error });
  }
});

app.post("/api/upload", upload.single("resume"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const fileData = {
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    path: req.file.path,
    size: req.file.size,
    uploadDate: new Date(),
  };

  try {
    // Save file metadata to MongoDB
    const fileCollection = db.collection(fileMetadataCollectionName);
    const fileInsertResult = await fileCollection.insertOne(fileData);

    if (fileInsertResult.insertedCount === 0) {
      throw new Error("Failed to save file metadata to MongoDB");
    }

    // Extract text from the uploaded PDF
    const extractedText = await extractTextFromPDF(req.file.path);
    const resumeData = parseResumeText(extractedText);
    resumeData.fileId = fileInsertResult.insertedId;

    // Save resume data to MongoDB
    const resumeCollection = db.collection(collectionName);
    const resumeInsertResult = await resumeCollection.insertOne(resumeData);

    if (resumeInsertResult.insertedCount === 0) {
      throw new Error("Failed to save resume data to MongoDB");
    }

    res.json({
      message: "File uploaded and saved successfully!",
      fileData: fileData,
      resumeData: resumeData,
    });
  } catch (error) {
    console.error("Error processing file upload:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/resumes/count", async (req, res) => {
  try {
    const count = await db.collection(collectionName).countDocuments();
    res.json({ success: true, count });
  } catch (error) {
    console.error("Error fetching resume count:", error);
    res.status(500).json({ success: false, message: "Error fetching resume count" });
  }
});

// Function to analyze resume
async function analyzeResume(resumeData) {
  const skills = resumeData.skills || [];
  const recommendedJobs = await fetchRecommendedJobs(skills);

  return {
    skills: skills,
    recommendedJobs: recommendedJobs,
  };
}

// Function to fetch recommended jobs based on skills
async function fetchRecommendedJobs(skills) {
  const jobProfiles = [
    // Your job profiles
  ];

  const matchedJobs = jobProfiles.filter((job) =>
    job.requiredSkills.some((skill) => skills.includes(skill))
  );

  return matchedJobs.map((job) => job.title);
}

// HTTPS server setup
const httpsOptions = {
  key: fs.readFileSync(path.join(__dirname, 'certs', 'key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'certs', 'cert.pem')),
};

https.createServer(httpsOptions, app).listen(PORT, () => {
  console.log(`Server is running on https://www.netsachglobal.com:${PORT}`); // Replace with your domain or IP
});
