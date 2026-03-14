"""
Example: Custom tracking with user input
"""
import sys
from pathlib import Path

# Add project root so "speech_tracker" can be imported
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import time
from speech_tracker import SpeechMentionDetector

word_to_track = input("Enter word to track: ")
duration = int(input("Duration in minutes: "))

detector = SpeechMentionDetector(word_to_track)

print(f"\n🎯 Tracking '{word_to_track}' for {duration} minutes...")

thread = detector.start_monitoring()
start_time = time.time()

try:
    while time.time() - start_time < duration * 60:
        time.sleep(5)
        current_count = detector.get_mention_count()
        remaining = duration - (time.time() - start_time) / 60
        print(f"Current: {current_count} | Time left: {remaining:.1f}m")

except KeyboardInterrupt:
    pass

detector.stop_monitoring()
print(f"\n🏁 Final result: {detector.get_mention_count()} mentions")
