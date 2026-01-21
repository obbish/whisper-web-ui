# Whisper Turbo Transcription

A lightweight, local web interface for converting audio to text using the [whisper.cpp](https://github.com/ggerganov/whisper.cpp) engine on macOS.

## Features
- 🚀 **Fast**: Runs locally on Apple Silicon (M1/M2/M3).
- 🔒 **Private**: No data leaves your network.
- 📄 **Simple**: Drag-and-drop web interface.
- 🇸🇪 **Multilingual**: optimized for Swedish, English, Norwegian, Danish, and German.

## Quick Start

1.  **Install**: Follow the [Setup Manual](docs/MANUAL.md) to compile and configure the server.
2.  **Run**: Start the service via `launchd` or manually.
3.  **Use**: Open your browser and navigate to `http://<your-mac-ip>:8080`.

## Requirements
- macOS with Apple Silicon
- `git`, `make`
- `whisper.cpp` (setup covered in manual)

## License
GPLv3
