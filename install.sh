#!/bin/bash

# Installation script for Speech Tracker dependencies

echo "🎤 Speech Tracker Installation Script"
echo "======================================"
echo ""

# Check if Python 3 is installed
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1)
    echo "✅ Found: $PYTHON_VERSION"
else
    echo "❌ Python 3 not found. Please install Python 3 first."
    echo "   Visit: https://www.python.org/downloads/"
    exit 1
fi

# Check if pip3 is available
if command -v pip3 &> /dev/null; then
    echo "✅ Found: pip3"
    PIP_CMD="pip3"
elif python3 -m pip --version &> /dev/null; then
    echo "✅ Found: python3 -m pip"
    PIP_CMD="python3 -m pip"
else
    echo "❌ pip3 not found. Installing pip..."
    python3 -m ensurepip --upgrade
    PIP_CMD="python3 -m pip"
fi

# Check for Xcode Command Line Tools
if xcode-select -p &> /dev/null; then
    echo "✅ Xcode Command Line Tools installed"
else
    echo "⚠️  Xcode Command Line Tools not found"
    echo "   Please install them by running: xcode-select --install"
    echo "   Or download from: https://developer.apple.com/download/all/"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check for Homebrew
if command -v brew &> /dev/null; then
    echo "✅ Homebrew installed"
    HAS_BREW=true
else
    echo "⚠️  Homebrew not found (optional but recommended)"
    HAS_BREW=false
fi

# Install PortAudio if Homebrew is available
if [ "$HAS_BREW" = true ]; then
    echo ""
    echo "📦 Installing PortAudio via Homebrew..."
    brew install portaudio
else
    echo ""
    echo "⚠️  Skipping PortAudio installation (Homebrew not available)"
    echo "   You may need to install PortAudio manually"
    echo "   See SETUP.md for instructions"
fi

# Install Python packages
echo ""
echo "📦 Installing Python packages..."
$PIP_CMD install -r requirements.txt

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Installation complete!"
    echo ""
    echo "🧪 Testing installation..."
    python3 -c "import speech_recognition; print('✅ SpeechRecognition')" 2>/dev/null || echo "❌ SpeechRecognition"
    python3 -c "import pyaudio; print('✅ PyAudio')" 2>/dev/null || echo "❌ PyAudio"
    python3 -c "import webrtcvad; print('✅ WebRTC VAD')" 2>/dev/null || echo "❌ WebRTC VAD"
    python3 -c "import numpy; print('✅ NumPy')" 2>/dev/null || echo "❌ NumPy"
    echo ""
    echo "🚀 You can now run: python3 speech_tracker.py"
else
    echo ""
    echo "❌ Installation failed. Please check the errors above."
    exit 1
fi
