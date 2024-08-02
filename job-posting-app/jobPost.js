require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const { MongoClient, ObjectId } = require("mongodb");
const cors = require("cors");
const nodemailer = require("nodemailer");
const axios = require("axios");
const helmet = require("helmet");
const compression = require("compression");

const app = express();
const PORT = process.env.PORT || 5002;

app.use(cors({
  origin: ['https://www.netsachglobal.com', 'https://93.127.195.134'],
  optionsSuccessStatus: 200,
}));
app.use(bodyParser.json());
app.use(helmet()); // Adds security headers
app.use(compression()); // Compresses responses to improve performance

const uri = process.env.MONGO_URI || "mongodb://93.127.195.134:27017";
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

let db;

(async () => {
  try {
    await client.connect();
    db = client.db("EmailAll");
    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1);
  }
})();

// Configure Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// POST endpoint for sending emails
app.post("/api/send-email", async (req, res) => {
  const { to, subject, body } = req.body;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: to,
    subject: subject,
    text: body,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully");
    res.status(200).json({ message: "Email sent successfully", info: info.response });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ error: "Failed to send email" });
  }
});

// Handle POST request to create a job
app.post("/api/jobs", async (req, res) => {
  const jobData = req.body;
  const collection = db.collection("jobs");

  try {
    const result = await collection.insertOne(jobData);
    res.status(201).json({
      message: "Job posted successfully!",
      job: { _id: result.insertedId, ...jobData },
    });
  } catch (error) {
    console.error("Error posting job:", error);
    res.status(500).json({ error: "Failed to post job" });
  }
});

// Handle GET request to fetch all jobs
app.get("/api/jobs", async (req, res) => {
  try {
    const collection = db.collection("jobs");
    const jobs = await collection.find().toArray();
    res.json(jobs);
  } catch (error) {
    console.error("Error fetching jobs:", error);
    res.status(500).json({ message: "Error fetching jobs", error });
  }
});

// Handle GET request to fetch job by ID
app.get("/api/jobs/:id", async (req, res) => {
  try {
    const jobId = req.params.id;
    const collection = db.collection("jobs");
    const job = await collection.findOne({ _id: new ObjectId(jobId) });
    if (!job) {
      return res.status(404).send({ message: "Job not found" });
    }
    res.send(job);
  } catch (error) {
    console.error("Error fetching job details:", error);
    res.status(500).send({ message: "Error fetching job details", error });
  }
});

// Generate job description using Hugging Face
app.post("/api/generate-description", async (req, res) => {
  const { jobTitle, skills } = req.body;
  const prompt = `Create a job description for a ${jobTitle} with skills: ${skills}`;

  try {
    const response = await axios.post(
      "https://api-inference.huggingface.co/models/EleutherAI/gpt-neo-2.7B",
      { inputs: prompt, options: { wait_for_model: true } },
      {
        headers: {
          Authorization: `Bearer ${process.env.HUGGING_FACE_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const description = response.data.generated_text.trim();
    res.json({ description });
  } catch (error) {
    console.error("Error generating job description:", error.response ? error.response.data : error.message);
    res.status(500).json({ error: "Error generating job description" });
  }
});

// Match resumes based on job description
app.post("/api/match-resumes", async (req, res) => {
  const { jobDescription } = req.body;

  try {
    const resumes = await getResumesFromDatabase();
    const matchedResumes = resumes.filter((resume) => {
      return resume.skills.some((skill) => jobDescription.includes(skill));
    });
    res.json({ resumes: matchedResumes });
  } catch (error) {
    console.error("Error matching resumes:", error);
    res.status(500).json({ error: "Error matching resumes" });
  }
});

async function getResumesFromDatabase() {
  const collection = db.collection("resumes");
  return await collection.find().toArray();
}

// Handle POST request to apply for a job
app.post("/api/apply", async (req, res) => {
  const { userId, jobId } = req.body;

  try {
    const jobsCollection = db.collection("jobs");
    const job = await jobsCollection.findOne({ _id: new ObjectId(jobId) });

    if (!job) {
      return res.status(404).json({ message: "Job not found. Unable to apply." });
    }

    const applicationsCollection = db.collection("applications");
    const application = {
      userId,
      jobId,
      appliedAt: new Date(),
    };

    await applicationsCollection.insertOne(application);
    res.status(200).json({ message: "Application submitted successfully." });
  } catch (error) {
    console.error("Error applying for job:", error);
    res.status(500).json({ error: "Failed to apply for job" });
  }
});

// Delete a job
app.delete('/api/jobs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const collection = db.collection('jobs');

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid job ID format' });
    }

    const result = await collection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Job not found' });
    }

    res.status(200).json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Error deleting job:', error.message);
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
});

// Update a job by ID
app.put('/api/jobs/:id', async (req, res) => {
  const jobId = req.params.id;
  const updatedJob = req.body;

  try {
    const collection = db.collection('jobs');

    const result = await collection.updateOne(
      { _id: new ObjectId(jobId) },
      { $set: updatedJob }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Job not found' });
    }

    res.json(result);
  } catch (error) {
    console.error('Error updating job:', error);
    res.status(500).send('Error updating job');
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
