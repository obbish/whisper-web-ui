---
description: Guide for developing and deploying the Whisper Web UI project
---

# Whisper Web UI Development Skills

This document defines the workflows, standards, and components for working on the Whisper Web UI project—a full-stack audio transcription application with a Node.js backend, vanilla JavaScript frontend, FFmpeg audio processing, and whisper.cpp integration.

---

## 1. Project Architecture

### Overall Structure
- **Type**: Full-stack web application with job queue system
- **Frontend**: Single-page application (SPA) - Vanilla HTML5, CSS3, ES6+ JavaScript
- **Backend**: Node.js + Express with in-memory job queue
- **Audio Processing**: FFmpeg for normalization
- **Transcription Engine**: whisper-cli (from whisper.cpp project)
- **Reverse Proxy**: Caddy with TLS support
- **Services**: macOS launchd plists for background services
- **Configuration**: Language-to-model mapping (language-models.json)

### Component Overview

| Component | File | Purpose |
|-----------|------|---------|
| **Frontend** | `public/index.html` | Web UI for uploading audio, selecting language, polling transcription status |
| **Backend** | `server.js` | Express server managing job queue, FFmpeg processing, whisper-cli invocation |
| **Config - Caddy** | `config/Caddyfile` | Reverse proxy with TLS termination |
| **Config - Services** | `config/com.whisper.*.plist` | launchd service definitions for macOS |
| **Language Config** | `language-models.json` | Maps language codes to whisper.cpp model paths |
| **Dependencies** | `package.json` | Node.js dependencies (Express, Multer, CORS) |
| **Documentation** | `README.md` | Setup, deployment, and troubleshooting guide |

---

## 2. Frontend Development

### Technology Stack
- **Language**: Vanilla ES6+ JavaScript (no frameworks)
- **Styling**: CSS3 with CSS custom properties (variables)
- **HTML**: Semantic HTML5
- **HTTP Client**: Fetch API

### Key Features
- **File Upload**: Drag-and-drop or click-to-select audio/video files
- **Language Selection**: Dropdown menu with language options (auto-detect available)
- **Job Queue Polling**: Real-time status updates with position tracking
- **Progress Monitoring**: Displays queue position and transcription progress percentage
- **Result Display**: Textarea with transcription output
- **Download**: Save transcription as `.txt` file
- **Cancellation**: Cancel queued or processing jobs

### Coding Standards

**CSS**:
- Use CSS custom properties (variables) for all colors and spacing
- Follow macOS design language (system fonts, rounded corners, clean spacing)
- Mobile-responsive design

**JavaScript**:
- No external dependencies or front-end frameworks
- Use `fetch` for all API calls with proper error handling
- Implement real-time polling for job status (1-second intervals)
- Handle job cancellation on page unload with `pagehide` event

**HTML**:
- Keep markup semantic and minimal
- All styles and scripts embedded in single file for portability
- Accessibility considerations (alt text, ARIA labels where appropriate)

### API Contract
The frontend communicates with the backend via JSON APIs:

```
// Upload
POST /upload
Body: FormData with file and language
Response: { id: UUID, message: "Job queued successfully" }

// Status polling
GET /status/:id
Response: { id, status, position, result, error, logs }

// Cancellation
POST /cancel/:id
Response: { message: "..." }
```

---

## 3. Backend Development

### Technology Stack
- **Runtime**: Node.js
- **Framework**: Express.js
- **File Handling**: Multer for multipart uploads
- **Process Management**: Node.js `child_process.exec()`
- **Queue System**: In-memory FIFO queue with UUID job tracking

### Core Functionality

#### Job Queue
- **In-memory FIFO queue**: `jobQueue` array stores job IDs
- **Job tracking**: `jobs` object maps UUID → job metadata (status, logs, result, error)
- **Status values**: `queued`, `processing`, `done`, `error`
- **Position tracking**: Real-time queue position sent to frontend

#### Audio Processing Pipeline
1. **Upload**: Multer stores file temporarily in `uploads/` directory
2. **Normalization**: FFmpeg processes audio with:
   - Volume normalization (`loudnorm=I=-14:TP=-1.0:LRA=7`)
   - Resampling to 16kHz (Whisper requirement)
   - Convert to mono
   - Output as PCM WAV format
3. **Transcription**: whisper-cli processes normalized audio
4. **Cleanup**: Remove temporary files (original upload + normalized WAV)

#### Error Handling
- Process errors captured and stored in job record
- FFmpeg and whisper-cli stderr logged for debugging
- Job cleanup on cancellation or failure

### Backend Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/upload` | Queue new transcription job |
| `GET` | `/status/:id` | Fetch job status and results |
| `POST` | `/cancel/:id` | Cancel queued or processing job |

### Coding Standards
- Use async/await or Promises for I/O operations
- Log all significant events (job submission, processing, errors)
- Store process references for graceful cancellation
- Use UUID for unique job identification
- Ensure proper cleanup even on error paths

---

## 4. Configuration Management

### language-models.json
Maps language codes to whisper.cpp model binary paths:
- Key: ISO 639-1 language code (e.g., `en`, `sv`, `auto`)
- Value: Object with `model` property pointing to `.bin` file path
- Uses placeholder paths (`/path/to/...`) for deployment flexibility
- Includes a `_default` fallback

**Development Pattern**:
- Use placeholder paths in repo
- Document actual paths in README
- Update paths per deployment environment

### Caddyfile
Caddy reverse proxy configuration:
- **Placeholder**: Domain name (`example.com`)
- **Placeholder**: TLS certificate paths
- **Disables buffering**: `flush_interval -1` for streaming capability
- **HTTP/1.1 forced**: Disables keep-alive for maximum compatibility

### launchd Plists
Three service definitions for macOS:

1. **com.caddy.proxy.plist**: Caddy reverse proxy service
2. **com.whisper.queue.plist**: Node.js backend (server.js)
3. **com.whisper.server.plist**: Alternative whisper-server (if used)

**Placeholders to customize**:
- `/path/to/your/bin`
- `/path/to/caddy`
- `/path/to/node`
- `/path/to/web_queue`
- User account (`UserName` field)

**Configuration approach**:
- Keep template files generic with `/path/to/...` placeholders
- Provide deployment instructions in README
- Allow users to customize before installing to `/Library/LaunchDaemons/`

---

## 5. Development Workflow

### Local Development
```bash
# Install dependencies
npm install

# Ensure whisper-cli is in project root or update WHISPER_CLI_PATH in server.js
curl -o whisper-cli https://...  # Download from whisper.cpp releases
chmod +x whisper-cli

# Place model files and update language-models.json with actual paths
# Ensure FFmpeg is installed: brew install ffmpeg (macOS)

# Start backend
node server.js

# Open frontend in browser (static file serving)
# Visit http://localhost:3000
```

### Frontend-Only Testing
```bash
# Open public/index.html directly in browser to verify UI/UX
# (API calls will fail without backend, but layout and interaction are testable)
```

### Full Stack Testing
1. Start backend: `node server.js`
2. Open browser: `http://localhost:3000`
3. Upload test audio file
4. Verify:
   - File appears in queue
   - Status updates in real-time
   - Progress percentage displays
   - Transcription appears in textarea
   - Download button works

---

## 6. Deployment

### System-Wide Installation (macOS)
```bash
# Create deployment directory
sudo mkdir -p /path/to/whisper/web_queue
sudo mkdir -p /path/to/whisper/models

# Copy application files
sudo cp -R public server.js package.json language-models.json config /path/to/whisper/web_queue/

# Copy whisper-cli
sudo cp /path/to/whisper.cpp/whisper-cli /path/to/whisper/web_queue/whisper-cli
sudo chmod +x /path/to/whisper/web_queue/whisper-cli

# Copy or download model files
sudo cp /path/to/ggml-large-v3-turbo.bin /path/to/whisper/models/

# Update ownership
sudo chown -R root:wheel /path/to/whisper
```

### Service Management
```bash
# Edit plist files with actual paths before copying
cd config/
# Update com.whisper.queue.plist, com.caddy.proxy.plist with real paths

# Install services
sudo cp config/com.whisper.queue.plist /Library/LaunchDaemons/
sudo cp config/com.caddy.proxy.plist /Library/LaunchDaemons/

# Load services
sudo launchctl load /Library/LaunchDaemons/com.whisper.queue.plist
sudo launchctl load /Library/LaunchDaemons/com.caddy.proxy.plist

# Check status
sudo launchctl list | grep com.whisper
sudo launchctl list | grep com.caddy

# View logs
tail -f /tmp/whisper_queue.log
tail -f /tmp/caddy.log
```

### TLS & Reverse Proxy
- Edit `Caddyfile` with your domain and certificate paths
- Caddy handles automated renewal if using Let's Encrypt
- Streaming disabled buffering ensures real-time progress updates reach frontend

---

## 7. Troubleshooting & Verification

### Common Issues

| Issue | Cause | Resolution |
|-------|-------|-----------|
| "No file uploaded" error | Multer not receiving file | Check frontend FormData construction |
| whisper-cli not found | Path mismatch | Update `WHISPER_CLI_PATH` in server.js |
| Model not found | Incorrect path in language-models.json | Verify model file exists, update config |
| FFmpeg errors | FFmpeg not installed | `brew install ffmpeg` |
| Transcription stalls | Process hung | Check logs, verify model file integrity |
| Frontend doesn't connect | Backend not running | Start `node server.js` |
| TLS certificate errors | Cert path invalid | Update Caddyfile with correct paths |
| Service won't start | Ownership or permissions | Check plist paths, user account permissions |

### Verification Checklist

**Backend**:
- [ ] `npm install` completes without errors
- [ ] `node server.js` starts and logs listening port
- [ ] `whisper-cli` binary exists and is executable
- [ ] Model files exist at paths in `language-models.json`
- [ ] `uploads/` directory created automatically
- [ ] FFmpeg available on PATH

**Frontend**:
- [ ] Page loads at `http://localhost:3000`
- [ ] File upload zone visible and interactive
- [ ] Language dropdown populated with options
- [ ] Default language is neutral (auto or English, not locale-specific)
- [ ] All UI text in English (no user-specific language strings)

**Integration**:
- [ ] Upload test audio file
- [ ] Job appears in queue with position
- [ ] Status updates every second
- [ ] Transcription completes and displays
- [ ] Download functionality works
- [ ] Cancel button removes job from queue

---

## 8. Key Files Reference

| File | Maintainer Task | Key Points |
|------|-----------------|-----------|
| `public/index.html` | Frontend development | Keep styles/scripts embedded; maintain CSS variables; no external dependencies |
| `server.js` | Backend development | Implement job queue logic; handle errors gracefully; clean up temp files |
| `language-models.json` | Configuration | Use placeholder paths; document for deployment |
| `config/Caddyfile` | Infrastructure | Template with example domain; users customize before deployment |
| `config/*.plist` | Infrastructure | Template with placeholder paths; users customize before system installation |
| `package.json` | Dependency management | Minimal dependencies; keep lightweight |
| `README.md` | Documentation | Installation, deployment, troubleshooting, model setup |

---

## 9. Code Review Checklist

Before committing changes:

- [ ] **Frontend**: Users cannot see local paths, system usernames, custom domains
- [ ] **Backend**: Error handling implemented; temp files cleaned up on failure
- [ ] **Config**: All system-specific paths use `/path/to/...` placeholders
- [ ] **Documentation**: README reflects current architecture and endpoints
- [ ] **Standards**: No hardcoded paths; CSS variables used; semantic HTML
- [ ] **Testing**: Tested locally with full upload→transcribe→download flow
- [ ] **Cleanup**: Removed personal customizations before pushing

---
