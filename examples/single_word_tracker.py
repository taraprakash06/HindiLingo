"""
Example: Track a single word during a live event
"""
import sys
from pathlib import Path

# Add project root so "speech_tracker" can be imported
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import time
from speech_tracker import SpeechMentionDetector

# Example: Track "inflation" during a Fed meeting
detector = SpeechMentionDetector("inflation")
thread = detector.start_monitoring()

print("🔴 LIVE: Tracking 'inflation' mentions...")
print("🎥 Point microphone toward TV/speakers")

try:
    time.sleep(3600)  # Track for 1 hour
except KeyboardInterrupt:
    pass

detector.stop_monitoring()
print(f"Final count: {detector.get_mention_count()}")
