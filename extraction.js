// server.js

const https = require('https');
const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const { MongoClient, ObjectId } = require('mongodb');
const GridFsStorage = require('multer-gridfs-storage');
const cors = require('cors');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const pdfParse = require('pdf-parse');

const app = express();
const PORT = 5001; // Port configuration
const MONGO_URL = 'mongodb://93.127.195.134:27017'; // MongoDB URL
const DATABASE_NAME = 'EmailAll'; // Database name
const COLLECTION_NAME = 'resumes'; // Collection name
const FILE_METADATA_COLLECTION_NAME = 'fileMetadata'; // File metadata collection name

app.use(cors({
  origin: ['https://www.netsachglobal.com', 'https://93.127.195.134'],
  optionsSuccessStatus: 200,
}));
app.use(bodyParser.json());

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

const client = new MongoClient(MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

let db;

(async () => {
  try {
    await client.connect();
    db = client.db(DATABASE_NAME);
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

app.post("/api/resume", async (req, res) => {
  const resumeData = req.body;
  const collection = db.collection(COLLECTION_NAME);

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

    const resumes = await db.collection('resumes').find({
      $or: [
        { fullName: searchRegex },
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

    const result = await db.collection(COLLECTION_NAME).deleteOne({ _id: new ObjectId(req.params.id) });

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
    const fileCollection = db.collection(FILE_METADATA_COLLECTION_NAME);
    const fileInsertResult = await fileCollection.insertOne(fileData);

    if (fileInsertResult.insertedCount === 0) {
      throw new Error("Failed to save file metadata to MongoDB");
    }

    const extractedText = await extractTextFromPDF(req.file.path);
    const resumeData = parseResumeText(extractedText);

    resumeData.fileId = fileInsertResult.insertedId;

    const resumeCollection = db.collection(COLLECTION_NAME);
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
    const count = await db.collection(COLLECTION_NAME).countDocuments();
    res.json({ success: true, count });
  } catch (error) {
    console.error("Error fetching resume count:", error);
    res
      .status(500)
      .json({ success: false, message: "Error fetching resume count" });
  }
});

async function analyzeResume(resumeData) {
  const skills = resumeData.skills || [];
  const recommendedJobs = await fetchRecommendedJobs(skills);

  return {
    skills: skills,
    recommendedJobs: recommendedJobs,
  };
}

// HTTPS Server
const options = {
  key: fs.readFileSync('server.key'),
  cert: fs.readFileSync('server.cert'),
};

https.createServer(options, app).listen(PORT, () => {
  console.log(`HTTPS Server is running on https://www.netsachglobal.com:${PORT}`);
});
