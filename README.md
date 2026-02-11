# whisper-web-ui

This repository provides a simple web front-end for running local Whisper inference using the `whisper-cli` binary from the `whisper.cpp` project. It is designed to run on macOS (local laptop or server) and can be started manually or run as launchd services.

## Quick overview

- Web UI: serves static UI from the `public/` folder and a small Node process (`server.js`).
- Reverse proxy / TLS: configured with the repository `Caddyfile` ([Caddyfile](Caddyfile)).
- Background service: optional launchd plists are in `config/` and can be copied to `/Library/LaunchDaemons/`.
- Whisper engine: the native `whisper-cli` from `whisper.cpp` is expected in this project's working directory (we suggest `bin/whisper-cli`).

## Prerequisites (macOS)

1. Install Homebrew (if needed):

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

2. Install required packages:

```bash
brew install git node caddy gcc ffmpeg
# or, if you prefer running Caddy via Homebrew services:
brew services start caddy
```

3. Xcode Command Line Tools may be required for compilation:

```bash
xcode-select --install
```

## Clone the web UI

```bash
git clone https://github.com/obbish/whisper-web-ui.git
cd whisper-web-ui
```

Optionally, install Node dependencies now:

```bash
npm install
```

### Recommended directory layout for system deployment

This project expects the Node `server.js` and the `whisper-cli` binary to be colocated when run as a system service (see the `config/*.plist` files which point to `/path/to/whisper/web_queue`). The following commands create the layout used by the included plists and copy the web UI into place (replace `/path/to/whisper` with your chosen install location):

```bash
# create top-level folders (system-wide install)
sudo mkdir -p /path/to/whisper/web_queue
sudo mkdir -p /path/to/whisper/models

# from inside the cloned repo (replace $PWD with your path to the repo)
sudo cp -R public server.js package.json language-models.json config /path/to/whisper/web_queue/

# copy or build your whisper-cli into the same folder so server.js can find it at ./whisper-cli
sudo cp /path/to/whisper.cpp/whisper-cli /path/to/whisper/web_queue/whisper-cli
sudo chmod +x /path/to/whisper/web_queue/whisper-cli

# adjust ownership if you want services to run under a specific user
sudo chown -R root:wheel /path/to/whisper
```

If you prefer a local (non-system) development layout, keep the repository checkout as-is and place the compiled `whisper-cli` next to `server.js` in the repo root (or update `WHISPER_CLI_PATH` in `server.js` to point to the binary location).

## Optional: install the launchd plists

If you'd like `caddy` and the web/queue services to run as system services, copy the plists from `config/` into `/Library/LaunchDaemons/` and load them with `launchctl`:

```bash
sudo cp config/com.whisper.server.plist /Library/LaunchDaemons/
sudo cp config/com.whisper.queue.plist /Library/LaunchDaemons/
sudo launchctl load /Library/LaunchDaemons/com.whisper.server.plist
sudo launchctl load /Library/LaunchDaemons/com.whisper.queue.plist
```

Edit the plist files as needed before copying (paths, user, environment variables).

## Configure local settings

- Edit the repository [Caddyfile](Caddyfile) to set your local hostname, ports and TLS options.
- Edit the frontend at [public/index.html](public/index.html) to point to the correct API endpoint if you run the server on a non-default host/port.

## Build and install `whisper-cli` (whisper.cpp)

1. Clone `whisper.cpp` and build the CLI:

```bash
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp
brew install gcc   # ensures a recent compiler on macOS
make -j$(sysctl -n hw.ncpu)
```

2. Locate the compiled executable and copy it into this project's `bin/` directory. Example (safe, attempts to find an executable):

```bash
EXE=$(find . -type f -perm -111 -name "whisper*" -o -name "main" | head -n1)
mkdir -p ../whisper-web-ui/bin
cp "$EXE" ../whisper-web-ui/bin/whisper-cli
cd ../whisper-web-ui
chmod +x bin/whisper-cli
```

Note: the produced executable name may vary; adjust the `find` or `cp` command to match your build output. The web UI expects a local `whisper-cli` binary (we keep it in `bin/whisper-cli`).

### Place the binary next to `server.js` for system services

When running via the provided `launchd` plists the `WorkingDirectory` is `/path/to/whisper/web_queue` (see `config/com.whisper.queue.plist`) and `server.js` calls the local `./whisper-cli`. Make sure the binary is copied to the same folder where `server.js` lives (or update the plist and `language-models.json` paths to suit your environment).

## Running the system

Manual (developer) mode — good for debugging:

1. Start Caddy with the local `Caddyfile`:

```bash
caddy run --config Caddyfile
# or
brew services start caddy
```

2. Start the Node server (either `npm start` if configured, or directly):

```bash
npm install
npm start        # if package.json defines a start script
# or
node server.js
```

When running locally from the repo, ensure the `whisper-cli` binary is present in the same folder as `server.js` (or set `WHISPER_CLI_PATH` in `server.js` to a full path).

Daemon mode (system services):

After copying the plists to `/Library/LaunchDaemons/`, load them with `launchctl`:

```bash
sudo launchctl load /Library/LaunchDaemons/com.whisper.server.plist
sudo launchctl load /Library/LaunchDaemons/com.whisper.queue.plist
# check status
sudo launchctl list | grep whisper
```

## Troubleshooting

- If the web UI cannot reach the Whisper CLI, ensure `bin/whisper-cli` is present and executable.
- Check `server.js` logs (stdout/stderr) for runtime errors.
- Inspect Caddy logs for proxy/TLS issues.

If transcription fails with model-not-found errors, ensure the model files referenced in `language-models.json` exist. Place GGML model files in `/path/to/whisper/models` (or the location you prefer) and update `language-models.json` accordingly. Example:

```bash
sudo mkdir -p /path/to/whisper/models
# copy model file into models/ (name must match what language-models.json references)
sudo cp /path/to/ggml-large-v3-turbo.bin /path/to/whisper/models/
sudo chown root:wheel /path/to/whisper/models/ggml-*.bin
```

Some builds of `whisper-cli` include helper scripts or flags to fetch models automatically; consult the `whisper.cpp` repository documentation for download helpers. If you use an automated model downloader, place the downloaded `.bin` files in `/path/to/whisper/models` and confirm the paths in `language-models.json`.

## Files of interest

- Caddy configuration: [Caddyfile](Caddyfile)
- Frontend UI: [public/index.html](public/index.html)
- Node server: [server.js](server.js)
- Launchd plists: [config/](config/)

---

If you'd like, I can:
- Commit these README changes and remove the `docs/` folder entirely from git history (or just delete files),
- Update `package.json` to add a clear `start` script,
- Or wire an automated build step to fetch and build `whisper.cpp` into `bin/`.

Tell me which of the above you'd like next.
