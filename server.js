const express = require('express');
const multer = require('multer');
const { randomUUID } = require('crypto');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
// Import exec to run ffmpeg and whisper-cli commands
const { exec } = require('child_process');

// Load language-to-model mapping configuration
const rawConfig = fs.readFileSync(path.join(__dirname, 'language-models.json'), 'utf-8');
const languageModels = JSON.parse(rawConfig);

const WHISPER_CLI_PATH = './whisper-cli';

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
const jobs = {}; // Map UUID -> { status, position, result, error, logs, process }
let isProcessing = false;
let currentProcessingJobId = null; // Track which job is currently processing

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

/**
 * Helper: Run FFmpeg command as a Promise
 */
function runFFmpeg(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        // Command: Fix volume (loudnorm), convert to 16kHz, Mono, WAV, strip video (-vn)
        const command = `ffmpeg -y -i "${inputPath}" -vn -af loudnorm=I=-14:TP=-1.0:LRA=7 -ar 16000 -ac 1 -c:a pcm_s16le "${outputPath}"`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`FFmpeg Error: ${stderr}`);
                reject(error);
            } else {
                resolve(outputPath);
            }
        });
    });
}

/**
 * Helper: Get model path based on language
 */
function getModelPath(language) {
    const langCode = (language || 'auto').toLowerCase();
    if (languageModels[langCode]) {
        return languageModels[langCode].model;
    }
    // Fallback to default if language not found
    return languageModels._default.model;
}

/**
 * Helper: Normalize transcription output by inserting newlines after sentence-ending punctuation.
 */
function formatTranscription(text) {
    if (!text || typeof text !== 'string') return text;

    // Normalize line endings first
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

    // Insert a line break after each sentence-ending punctuation.
    // This is intentionally simple (after '.', '!' or '?').
    return text.replace(/([.!?])\s*/g, '$1\n');
}

/**
 * Helper: Run whisper-cli command as a Promise and capture progress
 */
function runWhisper(audioPath, language, jobId) {
    return new Promise((resolve, reject) => {
        const modelPath = getModelPath(language);
        const langParam = language && language !== 'auto' ? language : 'auto';
        const command = `"${WHISPER_CLI_PATH}" -m "${modelPath}" -l ${langParam} -otxt -nt -pp "${audioPath}"`;

        console.log(`Running whisper-cli with model: ${modelPath}, language: ${langParam}`);

        const childProcess = exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Whisper Error: ${stderr}`);
                reject(error);
            } else {
                // whisper-cli outputs the transcription in stdout
                const text = stdout.trim();
                resolve(text);
            }
        });

        // Store reference to process in job so we can kill it if needed
        if (jobs[jobId]) {
            jobs[jobId].process = childProcess;
        }

        // Capture stderr for progress messages
        if (childProcess.stderr) {
            childProcess.stderr.on('data', (data) => {
                const lines = data.toString().split('\n').filter(l => l.trim());
                lines.forEach(line => {
                    // Store progress logs
                    if (jobs[jobId]) {
                        if (!jobs[jobId].logs) {
                            jobs[jobId].logs = [];
                        }
                        jobs[jobId].logs.push(line);
                    }
                    console.log(`[${jobId}] ${line}`);
                });
            });
        }
    });
}

/**
 * Worker function to process the queue.
 */
async function processQueue() {
    if (isProcessing || jobQueue.length === 0) {
        return; // Already busy or nothing to do
    }

    isProcessing = true;
    const jobId = jobQueue.shift(); // FIFO: Get first job
    const job = jobs[jobId];
    currentProcessingJobId = jobId;

    // Update status to processing
    job.status = 'processing';
    job.position = null; // No longer in line

    // Update positions for remaining jobs
    jobQueue.forEach((id, index) => {
        if (jobs[id]) {
            jobs[id].position = index + 1;
        }
    });

    // Define path for the temporary clean file
    // We stick to relative paths since that worked for you before
    const cleanFilePath = job.filePath + '_clean.wav';

    try {
        console.log(`Processing job: ${jobId}`);

        // 
        // STEP 1: Normalize Audio
        console.log(`Normalizing audio...`);
        await runFFmpeg(job.filePath, cleanFilePath);

        // STEP 2: Run Whisper CLI on CLEAN file
        console.log(`Transcribing with whisper-cli...`);
        const transcriptionText = await runWhisper(cleanFilePath, job.language, jobId);
        job.result = formatTranscription(transcriptionText);
        job.status = 'done';

    } catch (error) {
        console.error(`Error processing job ${jobId}:`, error);
        job.error = error.message;
        job.status = 'error';
    } finally {
        // Cleanup: Delete BOTH the original upload and the clean WAV
        try {
            if (fs.existsSync(job.filePath)) fs.unlinkSync(job.filePath);
            if (fs.existsSync(cleanFilePath)) fs.unlinkSync(cleanFilePath);
        } catch (err) {
            console.error(`Cleanup failed for ${jobId}:`, err);
        }

        isProcessing = false;
        currentProcessingJobId = null;
        // Trigger next job check immediately
        processQueue();
    }
}

// Route: Upload Audio
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const jobId = randomUUID();
    const position = jobQueue.length + 1;
    const language = req.body.language || 'auto';

    // Create unique job entry
    jobs[jobId] = {
        id: jobId,
        status: 'queued',
        position: position,
        filePath: req.file.path,
        language: language,
        logs: [],
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
        error: job.error,
        logs: job.logs || []
    };

    res.json(response);
});

// Route: Cancel Job
app.post('/cancel/:id', (req, res) => {
    const jobId = req.params.id;
    const job = jobs[jobId];

    // Job not found - already deleted or never existed
    if (!job) {
        console.log(`Cancel request for non-existent job: ${jobId}`);
        return res.json({ message: 'Job not found or already cancelled' });
    }

    console.log(`Cancel request for job: ${jobId}, status: ${job.status}`);

    // If job is queued, remove it from queue
    if (job.status === 'queued') {
        const queueIndex = jobQueue.indexOf(jobId);
        if (queueIndex !== -1) {
            jobQueue.splice(queueIndex, 1);
            console.log(`Removed job ${jobId} from queue`);
            // Update positions for remaining jobs
            jobQueue.forEach((id, index) => {
                if (jobs[id]) {
                    jobs[id].position = index + 1;
                }
            });
        }
        delete jobs[jobId];
        return res.json({ message: 'Queued job cancelled' });
    }

    // If job is currently processing, kill the process
    if (job.status === 'processing') {
        if (job.process) {
            try {
                job.process.kill('SIGTERM');
                console.log(`Killed process for job ${jobId}`);
            } catch (err) {
                console.error(`Failed to kill process for job ${jobId}:`, err);
            }
        }
        
        // Cleanup files immediately
        try {
            if (job.filePath && fs.existsSync(job.filePath)) {
                fs.unlinkSync(job.filePath);
                console.log(`Deleted file: ${job.filePath}`);
            }
            const cleanFilePath = job.filePath + '_clean.wav';
            if (fs.existsSync(cleanFilePath)) {
                fs.unlinkSync(cleanFilePath);
                console.log(`Deleted file: ${cleanFilePath}`);
            }
        } catch (err) {
            console.error(`Failed to cleanup files for job ${jobId}:`, err);
        }
        
        delete jobs[jobId];
        isProcessing = false;
        currentProcessingJobId = null;
        console.log(`Cancelled processing job: ${jobId}, moving to next job`);
        
        // Move to next job
        setImmediate(() => processQueue());
        
        return res.json({ message: 'Processing job cancelled and process terminated' });
    }

    // Job is done or error - just remove it
    delete jobs[jobId];
    return res.json({ message: 'Job removed (already completed)' });
});

app.listen(port, () => {
    console.log(`Middleware server running on http://localhost:${port}`);
    console.log(`Using whisper-cli at: ${WHISPER_CLI_PATH}`);
    console.log(`Language configuration loaded from language-models.json`);
});