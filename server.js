const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.static('public')); // Serve client files
app.use(express.json());

// Configure multer for temp file storage
const upload = multer({ dest: 'uploads/' });

// In-memory Job Store and Queue
const jobQueue = [];
const jobs = {}; // Map UUID -> { status, position, result, error }
let isProcessing = false;

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

/**
 * Worker function to process the queue.
 * It recursively calls itself until the queue is empty.
 */
async function processQueue() {
    if (isProcessing || jobQueue.length === 0) {
        return; // Already busy or nothing to do
    }

    isProcessing = true;
    const jobId = jobQueue.shift(); // FIFO: Get first job
    const job = jobs[jobId];

    // Update status to processing
    job.status = 'processing';
    job.position = null; // No longer in line

    // Update positions for remaining jobs
    jobQueue.forEach((id, index) => {
        if (jobs[id]) {
            jobs[id].position = index + 1;
        }
    });

    try {
        console.log(`Processing job: ${jobId}`);

        // Prepare file for Whisper server
        const formData = new FormData();
        formData.append('file', fs.createReadStream(job.filePath));
        formData.append('language', job.language || 'auto');
        formData.append('response_format', 'text'); // Force text format for simpler handling

        // Send to Whisper server
        const response = await fetch('http://127.0.0.1:8080/inference', {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders()
        });

        if (!response.ok) {
            throw new Error(`Whisper server responded with ${response.status}`);
        }

        // Handle text response since we requested response_format='text'
        const text = await response.text();

        // If the server returns JSON despite 'text' format (some do), try to parse it
        try {
            const json = JSON.parse(text);
            job.result = json.text || text;
        } catch (e) {
            job.result = text;
        }

        job.status = 'done';

    } catch (error) {
        console.error(`Error processing job ${jobId}:`, error);
        job.error = error.message;
        job.status = 'error';
    } finally {
        // Cleanup: Delete the temp file
        fs.unlink(job.filePath, (err) => {
            if (err) console.error(`Failed to delete temp file for ${jobId}:`, err);
        });

        isProcessing = false;
        // Trigger next job check immediately
        processQueue();
    }
}

// Route: Upload Audio
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const jobId = uuidv4();
    const position = jobQueue.length + 1;
    const language = req.body.language || 'auto';

    // Create unique job entry
    jobs[jobId] = {
        id: jobId,
        status: 'queued',
        position: position,
        filePath: req.file.path,
        language: language,
        submittedAt: new Date()
    };

    // Add to queue
    jobQueue.push(jobId);

    // Trigger worker (if not already running)
    processQueue();

    // Return UUID immediately
    res.json({ id: jobId, message: 'Job queued successfully' });
});

// Route: Check Status
app.get('/status/:id', (req, res) => {
    const jobId = req.params.id;
    const job = jobs[jobId];

    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }

    // Return clean status object
    const response = {
        id: job.id,
        status: job.status,
        position: job.position, // Will be null if processing/done
        result: job.result,
        error: job.error
    };

    res.json(response);
});

app.listen(port, () => {
    console.log(`Middleware server running on http://localhost:${port}`);
    console.log(`Forwarding to Whisper server at http://127.0.0.1:8080/inference`);
});
