# whisper-web-ui

**A simple web UI for local speech-to-text using [Whisper](https://github.com/ggerganov/whisper.cpp).**

Upload an audio file → AI processes locally → get transcription. No cloud services, no API keys.

---

## Get Running in 5 Minutes (Should be good for local setups)

### 1. Install dependencies (macOS)

```bash
brew install node ffmpeg
```

### 2. Clone and setup

```bash
git clone https://github.com/obbish/whisper-web-ui.git
cd whisper-web-ui
npm install
```

### 3. Get the Whisper binary

Clone and build [whisper.cpp](https://github.com/ggerganov/whisper.cpp):

```bash
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp
make -j$(sysctl -n hw.ncpu)
```

Copy the compiled binary to this project:

```bash
cp whisper-cli ../whisper-web-ui/whisper-cli
chmod +x ../whisper-web-ui/whisper-cli
cd ../whisper-web-ui
```

### 4. Start the server

```bash
npm start
```

Open **http://localhost:3000** and upload an audio file.

---

## Architecture

- **Frontend**: Static HTML/CSS/JS in `public/`
- **Backend**: Node.js Express server (`server.js`) that queues jobs
- **Engine**: Local `whisper-cli` binary (from whisper.cpp)
- **Processing**: FFmpeg normalizes audio, Whisper transcribes

---

## Want remote users to access your web transcirption service? 

To run as macOS system services that start automatically:

### 1. Setup directory structure

```bash
# Create system directories (replace /opt/whisper with your preferred path)
sudo mkdir -p /opt/whisper/web_queue
sudo mkdir -p /opt/whisper/models
```

### 2. Copy files and binary

```bash
# From the cloned repo:
sudo cp -R public server.js package.json language-models.json config /opt/whisper/web_queue/

# Copy the whisper-cli binary:
sudo cp whisper-cli /opt/whisper/web_queue/whisper-cli
sudo chmod +x /opt/whisper/web_queue/whisper-cli

# Set ownership:
sudo chown -R root:wheel /opt/whisper
```

### 3. Update paths in plists

Edit the `.plist` files in `config/` to match your installation path:

```bash
# Open in editor and update <string>/opt/whisper/web_queue</string>
sudo nano config/com.whisper.server.plist
sudo nano config/com.whisper.queue.plist
```

### 4. Install and start launchd services

```bash
sudo cp config/com.whisper.server.plist /Library/LaunchDaemons/
sudo cp config/com.whisper.queue.plist /Library/LaunchDaemons/
sudo launchctl load /Library/LaunchDaemons/com.whisper.server.plist
sudo launchctl load /Library/LaunchDaemons/com.whisper.queue.plist
```

Check status:

```bash
sudo launchctl list | grep whisper
```

---

## HTTPS & Reverse Proxy (Recommended if users come from other computers)

Edit [Caddyfile](Caddyfile) to configure hostname, ports, and TLS:

```bash
caddy run --config Caddyfile
# or start via Homebrew:
brew install caddy
brew services start caddy
```

Update [public/index.html](public/index.html) if you change the server URL.

---

## Models & Configuration

### Download Whisper models

Place GGML model files in your models directory (e.g., `/opt/whisper/models)`):

```bash
# Download a model (example):
wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin
mv ggml-large-v3-turbo.bin /opt/whisper/models/
```

### Update language-models.json

Edit [language-models.json](language-models.json) to reference your downloaded models:

```json
{
  "en": {
    "name": "English",
    "modelPath": "/opt/whisper/models/ggml-large-v3-turbo.bin"
  }
}
```

---

## Troubleshooting

**"Cannot find whisper-cli"**
- Ensure the binary is in the same directory as `server.js`, or update `WHISPER_CLI_PATH` in [server.js](server.js#L13).

**"Model not found"**
- Check that model files exist and paths in [language-models.json](language-models.json) are correct.

**Transcription is slow**
- Large models take time. Try a smaller model (quantized versions are faster).
- Check system CPU/RAM usage: `top`

**Caddy won't start**
- Verify [Caddyfile](Caddyfile) syntax: `caddy validate --config Caddyfile`

**Logs and debugging**
- View server output: `tail -f /tmp/whisper-server.log` (if configured)
- Check launchd logs: `log stream --predicate 'process == "server.js"'`

---

## File Reference

| File | Purpose |
|------|---------|
| [server.js](server.js) | Express API, job queue, Whisper runner |
| [public/index.html](public/index.html) | Web UI for uploading/viewing transcriptions |
| [language-models.json](language-models.json) | Model paths and language settings |
| [Caddyfile](Caddyfile) | HTTPS proxy & reverse proxy config |
| [config/](config/) | launchd `.plist` files for system services |

---
