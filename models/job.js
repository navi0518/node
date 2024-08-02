// models/job.js
const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    // Add other fields as necessary
});

module.exports = mongoose.model('Job', jobSchema);
