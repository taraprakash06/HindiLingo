# Setup Guide

## Python Installation

Python 3 is already installed on your macOS system. On macOS, use `python3` instead of `python`.

### Option 1: Use `python3` (Recommended)

All scripts have been updated to use `python3`. Simply run:

```bash
python3 speech_tracker.py
```

### Option 2: Create a `python` alias (Optional)

If you prefer to use `python` instead of `python3`, add this to your `~/.zshrc` file:

```bash
alias python=python3
alias pip=pip3
```

Then reload your shell:
```bash
source ~/.zshrc
```

## Installing Dependencies

### Step 1: Install Xcode Command Line Tools

First, you need to install Xcode Command Line Tools. You can do this in two ways:

**Method A: Via Terminal (requires GUI session)**
```bash
xcode-select --install
```

**Method B: Manual Download**
1. Visit: https://developer.apple.com/download/all/
2. Search for "Command Line Tools"
3. Download and install the latest version for your macOS version

### Step 2: Install Homebrew (Optional but Recommended)

Homebrew makes installing system dependencies easier:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### Step 3: Install PortAudio (Required for audio)

**If you have Homebrew:**
```bash
brew install portaudio
```

**If you don't have Homebrew:**
You'll need to compile PortAudio from source or use a package manager. See: https://www.portaudio.com/download.html

### Step 4: Install Python Packages

```bash
pip3 install -r requirements.txt
```

If `pip3` is not found, try:
```bash
python3 -m pip install -r requirements.txt
```

## Quick Test

After installation, test your setup:

```bash
python3 -c "import speech_recognition; print('SpeechRecognition OK')"
python3 -c "import pyaudio; print('PyAudio OK')"
python3 -c "import webrtcvad; print('WebRTC VAD OK')"
```

## Troubleshooting

### "command not found: python"
- Use `python3` instead, or create an alias (see Option 2 above)

### "xcode-select: error: No developer tools were found"
- Install Xcode Command Line Tools (see Step 1 above)
- This requires a GUI session or manual download

### "No module named 'pyaudio'"
- Make sure PortAudio is installed: `brew install portaudio`
- Then reinstall: `pip3 install pyaudio`

### "pip3: command not found"
- Use: `python3 -m pip install -r requirements.txt`
