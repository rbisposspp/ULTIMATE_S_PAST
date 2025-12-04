# Project VoxDrill (Simple Past Drill) 🎙️

**VoxDrill** is a voice-driven English grammar and pronunciation drill system designed specifically for Brazilian Portuguese speakers. It is a client-side web application leveraging browser-native APIs to provide interactive drills focused on the **Simple Past** tense.

## 📋 Overview

The project is currently transitioning from **Phase One** (Basic Drills) to **Phase Two** (Voice-First Interaction). The goal is to remove typing/mental-only drills and force the user to speak the answers, validating them via Speech Recognition.

### Key Features
*   **Drill Engine:** Generates sentences (Affirmative, Negative, Interrogative) using Regular and Irregular verbs.
*   **TTS Integration:** Uses `window.speechSynthesis` to provide auditory models and correct answers.
*   **Voice-First (Phase 2):** Integration with `window.SpeechRecognition` to validate student answers.
*   **Client-Side Only:** Runs entirely in the browser without external cloud dependencies.

## 🛠️ Tech Stack

*   **Core:** Vanilla JavaScript (ES6+), HTML5, CSS3.
*   **APIs:**
    *   `window.speechSynthesis` (Text-to-Speech)
    *   `window.SpeechRecognition` (Speech-to-Text)
    *   Web Audio API (for recording)

## 📂 Project Structure

```text
root/
├── index.html          # Main application entry point (Player interface)
├── script.js           # Core logic (Drill state, TTS, Game loop)
├── style.css           # Interface styles
├── js/
│   ├── mainRecorder.js    # Custom Recorder class (WAV capture)
│   ├── recorderWorker.js  # Audio processing worker
│   └── mp3Worker.js       # (Optional) MP3 encoding
└── scopes/
    └── guide.txt          # CRITICAL: Technical Report & Roadmap for Phase 2