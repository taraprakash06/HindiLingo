"""
Example: Track multiple words for Polymarket betting
"""
import sys
from pathlib import Path

# Add project root so "speech_tracker" can be imported
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from speech_tracker import PolymarketMentionTracker

# Example: Presidential debate tracking
words = ["economy", "immigration", "climate", "healthcare"]
tracker = PolymarketMentionTracker(words, event_duration_minutes=90)

print("🗳️  PRESIDENTIAL DEBATE TRACKER")
print("🎥 Point microphone toward TV")
print("📊 Tracking: economy, immigration, climate, healthcare")

tracker.start_tracking()
