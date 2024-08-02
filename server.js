const express = require('express');
const bodyParser = require('body-parser');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const otpGenerator = require('otp-generator');
const nodemailer = require('nodemailer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const https = require('https');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection URI and database name
const mongoUrl = 'mongodb://93.127.195.134:27017'; // Replace with your MongoDB domain or IP
const databaseName = 'EmailAll';

// Nodemailer configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'g9425347@gmail.com', // Your Gmail email address
    pass: 'lrfllfqitxajjvjb', // Your Gmail password or App Password
  },
});

// Middleware
app.use(helmet()); // Add security headers
app.use(cors({
  origin: ['http://www.netsachglobal.com', 'https://93.127.195.134'], // Replace with your Angular application domain or IP
  optionsSuccessStatus: 200,
}));
app.use(bodyParser.json());
app.use(compression()); // Compress responses

// Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
});
app.use('/api/', apiLimiter);

// Serve TensorFlow.js models statically
app.use('/models', express.static(path.join(__dirname, 'models')));

// Connect to MongoDB
let client;

async function connectToMongoDB() {
  try {
    client = await MongoClient.connect(mongoUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1); // Exit the process if MongoDB connection fails
  }
}

connectToMongoDB();

// Route to handle email submission and OTP generation
app.post('/api/email', async (req, res) => {
  const { email } = req.body;

  try {
    const database = client.db(databaseName);
    const collection = database.collection('emails');

    const otp = otpGenerator.generate(6, {
      digits: true,
      lowerCaseAlphabets: false,
      upperCaseAlphabets: false,
      specialChars: false,
    });

    const emailDoc = await collection.findOne({ email });

    if (emailDoc) {
      await collection.updateOne({ email }, { $set: { otp } });
    } else {
      await collection.insertOne({ email, otp });
    }

    console.log('Email saved:', email);
    console.log('Generated OTP:', otp);

    const mailOptions = {
      from: 'g9425347@gmail.com', // Sender email address
      to: email, // Recipient email address
      subject: 'OTP for Email Verification',
      text: `Your OTP for email verification is: ${otp}`,
    };

    await transporter.sendMail(mailOptions);
    console.log('OTP sent to:', email);

    res.json({
      success: true,
      message: 'OTP sent to your email for verification',
    });
  } catch (error) {
    console.error('Error handling email submission:', error);
    res.status(500).json({ success: false, message: 'Error handling email submission' });
  }
});

// Route to verify OTP
app.post('/api/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  console.log('Verifying OTP:', email, otp);

  try {
    const database = client.db(databaseName);
    const collection = database.collection('emails');

    const emailDoc = await collection.findOne({ email });

    if (!emailDoc) {
      return res.status(404).json({ success: false, message: 'Email not found' });
    }

    if (emailDoc.otp === otp) {
      return res.json({ success: true, message: 'OTP verified successfully' });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ success: false, message: 'Error verifying OTP' });
  }
});

// Route to get the total number of emails
app.get('/api/email-count', async (req, res) => {
  console.log('Accessing /api/email-count endpoint');
  try {
    const database = client.db(databaseName);
    const collection = database.collection('emails');

    const emailCount = await collection.countDocuments();

    res.json({ success: true, count: emailCount });
  } catch (error) {
    console.error('Error fetching email count:', error);
    res.status(500).json({ success: false, message: 'Error fetching email count' });
  }
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({ success: false, message: 'Internal Server Error' });
});

// HTTPS server options
const options = {
  key: fs.readFileSync(path.join(__dirname, 'certs', 'key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'certs', 'cert.pem')),
};

// Start HTTPS server
https.createServer(options, app).listen(PORT, () => {
  console.log(`HTTPS Server running on https://netsachglobal.com:${PORT}`); // Replace with your domain or IP
});
