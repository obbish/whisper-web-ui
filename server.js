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
const jobs = {}; // Map UUID -> { status, position, result, error, lastSeen }
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

    // --- TTL CHECK (Abandoned in Queue) ---
    // If client hasn't polled in > 20 seconds, skip this job.
    if (Date.now() - job.lastSeen > 20000) {
        console.log(`Job ${jobId} abandoned by client. Skipping.`);
        job.status = 'abandoned';
        job.error = 'Job abandoned by client';

        // Cleanup file immediately
        if (job.filePath && fs.existsSync(job.filePath)) {
            fs.unlink(job.filePath, (err) => {
                if (err) console.error(`Failed to delete abandoned file for ${jobId}:`, err);
            });
        }

        isProcessing = false;
        processQueue(); // Immediately pick up next job
        return;
    }

    // Update status to processing
    job.status = 'processing';
    job.position = null; // No longer in line

    // Update positions for remaining jobs
    jobQueue.forEach((id, index) => {
        if (jobs[id]) {
            jobs[id].position = index + 1;
        }
    });

    const controller = new AbortController();

    // --- ACTIVE MONITORING (Heartbeat Check) ---
    // Check every 5 seconds if the client is still there
    const heartbeatInterval = setInterval(() => {
        if (Date.now() - job.lastSeen > 20000) {
            console.log(`Client disconnected during processing job ${jobId}. Aborting.`);
            controller.abort(); // Cancel the fetch request
            job.status = 'abandoned';
            job.error = 'Client disconnected';
            // Interval will be cleared in finally block
        }
    }, 5000);

    try {
        console.log(`Processing job: ${jobId}`);

        // Prepare file for Whisper server
        const formData = new FormData();
        formData.append('file', fs.createReadStream(job.filePath));
        formData.append('language', job.language || 'auto');
        formData.append('response_format', 'text');

        // Send to Whisper server with AbortSignal
        const response = await fetch('http://127.0.0.1:8080/inference', {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders(),
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`Whisper server responded with ${response.status}`);
        }

        const text = await response.text();

        try {
            const json = JSON.parse(text);
            job.result = json.text || text;
        } catch (e) {
            job.result = text;
        }

        if (job.status !== 'abandoned') {
            job.status = 'done';
        }

    } catch (error) {
        if (error.name === 'AbortError') {
            console.log(`Job ${jobId} aborted successfully.`);
            // Status/Error already set in interval check, but ensure consistency
            job.status = 'abandoned';
            job.error = 'Client disconnected';
        } else {
            console.error(`Error processing job ${jobId}:`, error);
            job.error = error.message;
            job.status = 'error';
        }
    } finally {
        clearInterval(heartbeatInterval);

        // Cleanup: Delete the temp file
        if (job.filePath) {
            fs.unlink(job.filePath, (err) => {
                if (err && err.code !== 'ENOENT') console.error(`Failed to delete temp file for ${jobId}:`, err);
            });
        }

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
        submittedAt: new Date(),
        lastSeen: Date.now() // Initialize Heartbeat
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

    // --- UPDATE HEARTBEAT ---
    job.lastSeen = Date.now();

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
