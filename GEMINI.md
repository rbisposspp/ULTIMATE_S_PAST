# Project VoxDrill (Simple Past Drill)

## Overview
Project VoxDrill is a voice-driven English grammar and pronunciation drill system designed for Brazilian Portuguese speakers. It is a client-side web application leveraging browser-native APIs (`window.speechSynthesis`, `window.SpeechRecognition`) to provide interactive drills.

The current implementation focuses on the **Simple Past** tense and is in transition to **Phase Two**, which introduces voice-first interaction, speech recognition for answer validation, and a dedicated pronunciation practice module.

## Project Structure

*   **Root:**
    *   `index.html`: The main application entry point (Player interface).
    *   `script.js`: Core application logic (Drill state, TTS integration, Game loop).
    *   `style.css`: Styles for the drill interface.
*   **js/**:
    *   `mainRecorder.js`: Custom `Recorder` class for high-quality audio capture (WAV).
    *   `recorderWorker.js`: Web Worker for audio processing.
    *   `mp3Worker.js`: (Optional) For MP3 encoding.
*   **scopes/**:
    *   `guide.txt`: **CRITICAL**. Contains the detailed "Technical Report: Phase Two" specification. This is the roadmap for current development.

## Current Functionality (Phase 1)
*   **Drill Engine:** Generates Simple Past sentences (Affirmative, Negative, Interrogative) from `regularVerbs` and `irregularVerbs` arrays.
*   **TTS Integration:** Uses `window.speechSynthesis` to speak correct answers and model sentences.
*   **UI:** Settings for Level, Drill Mode, Voice selection, and Speed.
*   **Recent Fixes:** Corrected `getPastTense` logic to explicitly handle "visit" -> "visited" (preventing incorrect "visitted").

## Development Goals (Phase 2 - per `scopes/guide.txt`)
The immediate goal is to implement the "Phase Two" specifications:
1.  **Voice-First Interaction:** Remove typing/mental-only drills. The user *must* speak the answer.
2.  **Speech Recognition:** Integrate `window.SpeechRecognition` to validate student answers against the generated target sentence.
3.  **Auditory Cues:** Implement "Partial Cue" (TTS prompt parts) vs "Visual Prompts Only".
4.  **Pronunciation Practice Module:**
    *   Enable recording (using `mainRecorder.js`).
    *   Compare student recording with model TTS.
5.  **UX Enhancements:** "Next Round" button, Pause/Resume logic, and feedback specificities ("Excellent", "Good", "Maybe next time").

## Commands
*   **Run:** Open `index.html` in a modern browser (Chrome/Edge recommended for Speech API support).
*   **Test:** Manual testing of drill flows.

## Conventions
*   **Code Style:** Vanilla JavaScript (ES6+), CSS3.
*   **Architecture:** Modular functions within `script.js` (e.g., `buildSentence`, `speak`, `nextRound`).
*   **APIs:** Strict adherence to browser-native APIs (no external cloud dependencies for TTS/STT).
