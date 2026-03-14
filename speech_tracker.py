import pyaudio
import wave
import speech_recognition as sr
import threading
import time
import re
from collections import Counter
import webrtcvad
import numpy as np


class SpeechMentionDetector:
    def __init__(self, target_word, sensitivity=2, sample_rate=16000):
        self.target_word = target_word.lower()
        self.sensitivity = sensitivity  # VAD sensitivity (0-3)
        self.sample_rate = sample_rate
        self.chunk_size = 320  # 20ms frames for VAD
        self.mention_count = 0
        self.is_listening = False
        
        # Initialize components
        self.vad = webrtcvad.Vad(sensitivity)
        self.recognizer = sr.Recognizer()
        self.microphone = sr.Microphone(sample_rate=sample_rate)
        
        # Audio buffer for processing
        self.audio_buffer = []
        self.speech_buffer = []
        
    def setup_microphone(self):
        """Calibrate microphone for ambient noise"""
        print("Calibrating microphone for ambient noise...")
        with self.microphone as source:
            self.recognizer.adjust_for_ambient_noise(source, duration=2)
        print("Microphone calibrated!")
    
    def is_speech(self, audio_chunk):
        """Detect if audio chunk contains speech using WebRTC VAD"""
        try:
            # Convert to the format expected by WebRTC VAD
            return self.vad.is_speech(audio_chunk, self.sample_rate)
        except:
            return False
    
    def process_audio_stream(self):
        """Real-time audio processing with speech detection"""
        audio = pyaudio.PyAudio()
        
        stream = audio.open(
            format=pyaudio.paInt16,
            channels=1,
            rate=self.sample_rate,
            input=True,
            frames_per_buffer=self.chunk_size
        )
        
        print(f"🎧 Listening for mentions of '{self.target_word}'...")
        
        speech_frames = []
        silence_count = 0
        max_silence = 30  # ~600ms of silence to end speech segment
        
        try:
            while self.is_listening:
                audio_chunk = stream.read(self.chunk_size, exception_on_overflow=False)
                
                if self.is_speech(audio_chunk):
                    speech_frames.append(audio_chunk)
                    silence_count = 0
                else:
                    silence_count += 1
                    
                    # If we have speech data and hit silence threshold, process it
                    if speech_frames and silence_count >= max_silence:
                        self.process_speech_segment(b''.join(speech_frames))
                        speech_frames = []
                        silence_count = 0
                        
        except KeyboardInterrupt:
            print("\n🛑 Stopping listener...")
        finally:
            stream.stop_stream()
            stream.close()
            audio.terminate()
    
    def process_speech_segment(self, speech_data):
        """Convert speech to text and count target word mentions"""
        try:
            # Convert raw audio to AudioData object
            audio_data = sr.AudioData(speech_data, self.sample_rate, 2)
            
            # Perform speech recognition
            text = self.recognizer.recognize_google(audio_data, language='en-US')
            print(f"📝 Transcribed: {text}")
            
            # Count mentions (case-insensitive, word boundaries)
            pattern = r'\b' + re.escape(self.target_word) + r'\b'
            mentions = len(re.findall(pattern, text.lower()))
            
            if mentions > 0:
                self.mention_count += mentions
                print(f"🎯 Found {mentions} mention(s)! Total: {self.mention_count}")
                
        except sr.UnknownValueError:
            print("🤷 Could not understand audio")
        except sr.RequestError as e:
            print(f"❌ Error with recognition service: {e}")
    
    def start_monitoring(self):
        """Start the speech monitoring in a separate thread"""
        self.is_listening = True
        self.setup_microphone()
        
        monitor_thread = threading.Thread(target=self.process_audio_stream)
        monitor_thread.daemon = True
        monitor_thread.start()
        
        return monitor_thread
    
    def stop_monitoring(self):
        """Stop the speech monitoring"""
        self.is_listening = False
    
    def get_mention_count(self):
        """Get current mention count"""
        return self.mention_count
    
    def reset_count(self):
        """Reset mention counter"""
        self.mention_count = 0


class PolymarketMentionTracker:
    def __init__(self, target_words, event_duration_minutes=60):
        self.target_words = [word.lower() for word in target_words]
        self.event_duration = event_duration_minutes * 60  # Convert to seconds
        self.start_time = None
        self.detectors = {}
        
        # Initialize detectors for each word
        for word in self.target_words:
            self.detectors[word] = SpeechMentionDetector(word)
    
    def start_tracking(self):
        """Start tracking all target words"""
        self.start_time = time.time()
        threads = []
        
        print(f"🏁 Starting {self.event_duration/60:.1f} minute tracking session...")
        print(f"🎯 Target words: {', '.join(self.target_words)}")
        
        for word, detector in self.detectors.items():
            thread = detector.start_monitoring()
            threads.append(thread)
        
        # Monitor for duration
        try:
            while time.time() - self.start_time < self.event_duration:
                time.sleep(1)
                self.print_status()
                
        except KeyboardInterrupt:
            print("\n🛑 Manual stop requested...")
        
        # Stop all detectors
        for detector in self.detectors.values():
            detector.stop_monitoring()
        
        self.print_final_results()
    
    def print_status(self):
        """Print current status every 10 seconds"""
        elapsed = time.time() - self.start_time
        if int(elapsed) % 10 == 0:  # Every 10 seconds
            remaining = max(0, self.event_duration - elapsed)
            print(f"\n⏱️  Time remaining: {remaining/60:.1f} minutes")
            for word, detector in self.detectors.items():
                count = detector.get_mention_count()
                print(f"   📊 '{word}': {count} mentions")
    
    def print_final_results(self):
        """Print final results"""
        print("\n" + "="*50)
        print("🏆 FINAL RESULTS")
        print("="*50)
        
        for word, detector in self.detectors.items():
            count = detector.get_mention_count()
            print(f"'{word}': {count} total mentions")
        
        print("="*50)


class AdvancedMentionTracker(SpeechMentionDetector):
    def __init__(self, target_word, confidence_threshold=0.8):
        super().__init__(target_word)
        self.confidence_threshold = confidence_threshold
        self.mention_timestamps = []
        self.context_phrases = []
        self.start_time = time.time()
    
    def process_speech_with_confidence(self, speech_data):
        """Enhanced processing with confidence scores and context"""
        try:
            # Use multiple recognition engines for higher accuracy
            engines = [
                ('google', lambda x: self.recognizer.recognize_google(x)),
                ('sphinx', lambda x: self.recognizer.recognize_sphinx(x))
            ]
            
            results = []
            for engine_name, engine_func in engines:
                try:
                    audio_data = sr.AudioData(speech_data, self.sample_rate, 2)
                    text = engine_func(audio_data)
                    results.append((engine_name, text))
                except:
                    continue
            
            # Process results from all engines
            for engine, text in results:
                self.analyze_text_for_mentions(text, engine)
                
        except Exception as e:
            print(f"❌ Processing error: {e}")
    
    def analyze_text_for_mentions(self, text, source_engine):
        """Analyze text for mentions with context"""
        sentences = text.split('.')
        
        for sentence in sentences:
            if self.target_word.lower() in sentence.lower():
                timestamp = time.time()
                self.mention_timestamps.append(timestamp)
                self.context_phrases.append({
                    'timestamp': timestamp,
                    'context': sentence.strip(),
                    'source': source_engine
                })
                
                print(f"🎯 [{source_engine}] Mention found: {sentence.strip()}")
    
    def get_detailed_report(self):
        """Generate detailed mention report"""
        elapsed_time = time.time() - self.start_time
        return {
            'total_mentions': len(self.mention_timestamps),
            'mentions_with_context': self.context_phrases,
            'mention_rate': len(self.mention_timestamps) / max(1, elapsed_time / 60),
            'timestamps': self.mention_timestamps
        }


# Main entry point
if __name__ == "__main__":
    print("🎤 Speech Mention Tracker")
    print("=" * 40)
    
    # Get user input
    target_word = input("What word do you want to track? ").strip()
    duration = int(input("How many minutes to track? "))
    
    print(f"\n🎯 Starting to track '{target_word}' for {duration} minutes...")
    print("📢 Start speaking near your microphone!")
    print("Press Ctrl+C to stop early\n")
    
    # Create and start tracker
    detector = SpeechMentionDetector(target_word)
    
    try:
        thread = detector.start_monitoring()
        start_time = time.time()
        
        while time.time() - start_time < duration * 60:
            time.sleep(5)  # Update every 5 seconds
            elapsed = (time.time() - start_time) / 60
            remaining = duration - elapsed
            count = detector.get_mention_count()
            
            print(f"⏰ {remaining:.1f} min left | 📊 Count: {count}")
        
        detector.stop_monitoring()
        final_count = detector.get_mention_count()
        print(f"\n🏁 FINAL RESULT: '{target_word}' was mentioned {final_count} times!")
        
    except KeyboardInterrupt:
        detector.stop_monitoring()
        final_count = detector.get_mention_count()
        print(f"\n⏹️  Stopped early. Final count: {final_count}")
