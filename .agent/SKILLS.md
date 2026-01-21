---
description: Guide for developing and deploying the Whisper Turbo frontend
---

# Whisper Turbo Development Skills

This document defines the workflows and standards for working on the Whisper Turbo frontend.

## 1. Project Architecture
- **Type**: Single-page application (SPA).
- **Core**: Vanilla HTML5, CSS3, ES6+ JavaScript.
- **Backend**: Expects a `whisper-server` running on the same host.
- **Endpoints**: POST `/inference` (multipart/form-data).

## 2. Coding Standards
- **CSS**: Use variables (e.g., `--primary: #007AFF`) for theming. Imitate macOS design language (system fonts, rounded corners, clean layouts).
- **JS**: No external dependencies. Use `fetch` for API calls.
- **HTML**: Keep it semantic. All styles and scripts are currently embedded in `index.html` for single-file portability.

## 3. Workflow

### Development
- Edit `index.html` directly.
- Test by opening in browser (UI only) or running against a local server instance.

### Deployment
To deploy changes to the system-wide service:
```bash
sudo cp index.html /Library/Whisper/index.html
```

## 4. Verification
- **UI Check**: Ensure layout is responsive and "Apple-like".
- **Functionality**:
    1. Upload a known `.wav` file.
    2. Verify status spinner appears.
    3. Verify text output is rendered in the textarea.
