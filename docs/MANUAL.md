### **1. Prepare a Macbook with Apple Silicon**

   1. Restore Macbook using DFU mode (optional, for clean install).
   2. Connect Ethernet cable and power.
   3. Register device with your MDM system (if applicable).
   4. Enable **Remote Login (SSH)** in System Settings -> General -> Sharing.
   5. Disable Wi-Fi and connect via SSH to the wired IP address.

### **2. Build & Installation**

Objective: Clone the source code, download the AI model, and compile the server binary.

* Source Repository: `ggerganov/whisper.cpp`  
* Install Location: `/Library/Whisper/`

Steps:

1. Clone & Compile:

```shell
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp
make server   # Compiles the specific server example
```

2. Download Model:

```shell
sh ./models/download-ggml-model.sh large-v3-turbo
```

3. Deploy Files:  
   Create a dedicated folder for the system-wide service:

```shell
sudo mkdir -p /Library/Whisper/models
sudo cp server /Library/Whisper/whisper-server
sudo cp models/ggml-large-v3-turbo.bin /Library/Whisper/models/
# Copy the frontend files from this repository to the deploy folder
sudo cp /path/to/your/repo/index.html /Library/Whisper/index.html
```

### **3. System Daemon Configuration**

Objective: Configure macOS to run the server automatically in the background on Port 8080.

* Service Name: `com.whisper.server`  
* Plist Location: `/Library/LaunchDaemons/com.whisper.server.plist`

Configuration Logic:

The service runs the whisper-server binary with specific arguments:

* `-m [path]`: Points to the Turbo model.  
* `--host 0.0.0.0`: Listens on all network interfaces (LAN access).  
* `--port 8080`: The specific port allowed by the firewall.  
* `--public /Library/Whisper`: Crucial Flag. Tells the server to serve static files (`index.html`) from this directory when the root URL is accessed.

Maintenance Commands:

* Start/Update Service:

```shell
sudo launchctl load /Library/LaunchDaemons/com.whisper.server.plist
```

* Stop Service:

```shell
sudo launchctl unload /Library/LaunchDaemons/com.whisper.server.plist
```

* Check Logs:

```shell
tail -f /tmp/whisper_server.log
```

### **4. The Frontend (HTML/JS)**

Objective: Provide a user-friendly interface for non-technical users.

* File Location: `/Library/Whisper/index.html`  
* Access URL: `http://<server-ip>:8080`

How it works:

1. Serving: When a user visits the URL, the C++ server serves `index.html` from the `--public` path.  
2. Interaction: The user selects a file and language.  
3. Submission: JavaScript uses `fetch` to POST to `/inference`.  
4. Processing: Server processes audio and returns text.  
5. Browser Compatibility:  
   * Firefox/Safari: Works natively.  
   * Chrome: May require allowing insecure content for IP-based access if SSL is not configured.

### **Current System Status**

* ✅ Backend: Running stable on Port 8080.  
* ✅ Firewall: Traffic is flowing.  
* ✅ Frontend: Basic UI is live.  
* ⚠️ **Note**: The server expects compliant audio files (16kHz WAV is safest). Future improvements may include server-side FFmpeg conversion.
