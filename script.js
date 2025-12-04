'use strict';

document.addEventListener('DOMContentLoaded', () => {

    // --- Initial Setup ---

    // DOM Element References
    const getElem = (id) => document.getElementById(id);
    const levelSelect = getElem('level-select');
    const drillModeSelect = getElem('drillModeSelect');
    const voiceSelect = getElem('voiceSelect');
    const speedControl = getElem('speedControl');
    const speedValue = getElem('speedValue');
    const roundIndicator = getElem('round-indicator');
    const scoreValue = getElem('score-value');
    const streakValue = getElem('streak-value');
    const promptSubject = getElem('prompt-subject');
    const promptVerb = getElem('prompt-verb');
    const promptComplement = getElem('prompt-complement');
    const promptType = getElem('prompt-type');
    const correctAnswerDisplay = getElem('correct-answer-display');
    const startButton = getElem('start-button');
    const nextRoundButton = getElem('next-round-button');
    const listenModelButton = getElem('listen-model-button');
    const errorMessage = getElem('error-message');

    // State Variables
    let isDrillRunning = false;
    let currentRound = 0;
    const totalRounds = 10;
    let currentCorrectAnswer = '';
    let currentDrillItem = {};
    let synth = window.speechSynthesis;
    let voices = [];
    let answerRevealTimeoutId = null;
    let score = 0;
    let streak = 0;
    let currentLevel = 1;

    // --- Vocabulary for Simple Past ---
    const regularVerbs = [
        { verb: 'play', objects: ['the guitar', 'soccer', 'video games'] },
        { verb: 'work' }, // Intransitive
        { verb: 'watch', objects: ['a movie', 'the game', 'TV'] },
        { verb: 'clean', objects: ['the kitchen', 'the car', 'the room'] },
        { verb: 'visit', objects: ['a museum', 'friends', 'the city'] },
        { verb: 'talk' }, // Intransitive
        { verb: 'study', objects: ['English', 'for the test', 'history'] },
        { verb: 'walk', destinations: ['to the park', 'home', 'to school'] },
        { verb: 'ask', objects: ['a question', 'for help', 'the teacher'] },
        { verb: 'start', objects: ['the race', 'the project', 'the car'] },
        { verb: 'travel', destinations: ['to France', 'by plane', 'with my family'] }
    ];
    const irregularVerbs = [
        { base: 'go', past: 'went', destinations: ['to the store', 'home', 'to the beach', 'on vacation'] },
        { base: 'eat', past: 'ate', objects: ['dinner', 'a sandwich', 'pizza'] },
        { base: 'see', past: 'saw', objects: ['a bird', 'the show', 'a friend'] },
        { base: 'have', past: 'had', objects: ['a party', 'a good time', 'a meeting'] },
        { base: 'do', past: 'did', objects: ['the homework', 'the dishes', 'laundry'] },
        { base: 'say', past: 'said', objects: ['hello', 'goodbye', 'something'] },
        { base: 'make', past: 'made', objects: ['a cake', 'a mistake', 'dinner'] },
        { base: 'take', past: 'took', objects: ['a bus', 'a photo', 'a break'] },
        { base: 'get', past: 'got', objects: ['a new car', 'a gift', 'a letter'] },
        { base: 'come', past: 'came', destinations: ['to the party', 'home late', 'from work'] }
    ];
    const pastTimeExpressions = [
        'yesterday', 'last night', 'two days ago', 'last week', 'last month',
        'this morning', 'on Sunday', 'in 2010', 'five hours ago', 'the day before yesterday'
    ];
    const subjects = ["I", "You", "He", "She", "We", "They"];

    // --- Web Speech API Integration ---

    function loadVoices() {
        voices = synth.getVoices().filter(voice => voice.lang.startsWith('en'));
        updateVoiceSelectOptions();
    }

    function updateVoiceSelectOptions() {
        voiceSelect.innerHTML = ''; // Clear existing options
        const voiceOptions = [
            { value: 'us_female', text: 'US Female' },
            { value: 'us_male', text: 'US Male' },
            { value: 'uk_female', text: 'UK Female' },
            { value: 'uk_male', text: 'UK Male' }
        ];

        voiceOptions.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.text;
            voiceSelect.appendChild(option);
        });
        
        if (voices.length === 0) {
             errorMessage.textContent = "No Text-to-Speech voices found in this browser.";
        }
    }

    function getSelectedVoice() {
        const selectedVoiceType = voiceSelect.value;
        const voicePreferences = {
            'us_female': name => name.includes('Google US English') || name.includes('Zira') || name.includes('Samantha'),
            'us_male': name => name.includes('Google US English') && !name.includes('Female'),
            'uk_female': name => name.includes('Google UK English Female'),
            'uk_male': name => name.includes('Google UK English Male'),
        };
        const voiceFilter = voicePreferences[selectedVoiceType] || (() => true);
        return voices.find(voice => voiceFilter(voice.name)) || voices.find(v => v.lang.startsWith('en')) || null;
    }

    function speak(text) {
        if (synth.speaking) {
            synth.cancel();
        }
        const utterance = new SpeechSynthesisUtterance(text);
        const speed = parseFloat(speedControl.value);
        
        utterance.voice = getSelectedVoice();
        utterance.rate = speed;
        utterance.onerror = (event) => {
            errorMessage.textContent = `TTS Error: ${event.error}`;
        };
        synth.speak(utterance);
    }

    // --- REFACTORED Sentence Generation Engine ---

    function getPastTense(verb) {
        // This function is for REGULAR verbs only. Irregular verbs are handled by looking up the .past property.
        if (verb === 'visit') return 'visited';
        
        const vowels = "aeiou";

        // Rule 4: CVC (Consonant-Vowel-Consonant) -> double final consonant + -ed
        if (verb.length > 2 &&
            !vowels.includes(verb.slice(-3, -2)) && // C
             vowels.includes(verb.slice(-2, -1)) && // V
            !vowels.includes(verb.slice(-1))) {     // C
            if (!['w', 'x', 'y'].includes(verb.slice(-1))) {
                return verb + verb.slice(-1) + 'ed';
            }
        }

        // Rule 3: consonant + 'y' -> change 'y' to 'i' and add -ed
        if (verb.endsWith('y') && !vowels.includes(verb.slice(-2, -1))) {
            return verb.slice(0, -1) + 'ied';
        }

        // Rule 2: ends in 'e' -> add -d
        if (verb.endsWith('e')) {
            return verb + 'd';
        }

        // Rule 1: General rule -> add -ed
        return verb + 'ed';
    }

    function buildSentence(item) {
        const { subject, verb, directObject, destination, timeExpression, type } = item;
        const baseVerb = verb.base || verb.verb;
        
        let complementPart = '';
        if (directObject) {
            complementPart = ` ${directObject}`;
        } else if (destination) {
            complementPart = ` ${destination}`;
        }

        const timePart = ` ${timeExpression}`;

        if (type === 'affirmative') {
            const pastVerb = verb.past || getPastTense(baseVerb);
            return `${subject} ${pastVerb}${complementPart}${timePart}.`;
        } else if (type === 'negative') {
            return `${subject} didn't ${baseVerb}${complementPart}${timePart}.`;
        } else if (type === 'interrogative') {
            const displaySubject = (subject.toLowerCase() === 'i') ? 'I' : subject.toLowerCase();
            return `Did ${displaySubject} ${baseVerb}${complementPart}${timePart}?`;
        }
        return '';
    }

    // --- Core Game Loop & Feedback ---
    
    function startGame() {
        isDrillRunning = true;
        currentRound = 0;
        score = 0;
        streak = 0;
        updateScoreDisplay();
        startButton.textContent = 'End Drill';
        nextRoundButton.style.display = 'inline-block';
        listenModelButton.disabled = false;
        drillModeSelect.disabled = true;
        levelSelect.disabled = true;
        errorMessage.textContent = '';
        nextRound();
    }

    function endGame() {
        isDrillRunning = false;
        startButton.textContent = 'Start Drill';
        nextRoundButton.style.display = 'none';
        listenModelButton.disabled = true;
        drillModeSelect.disabled = false;
        levelSelect.disabled = false;
        roundIndicator.textContent = 'Drill complete! Press "Start Drill" to go again.';
        
        clearTimeout(answerRevealTimeoutId);

        [promptSubject, promptVerb, promptComplement, promptType, correctAnswerDisplay].forEach(el => {
            el.textContent = '';
        });
        correctAnswerDisplay.classList.remove('visible');

        if (synth.speaking) {
            synth.cancel();
        }
    }
    
    function getRandomItem(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function nextRound() {
        if (!isDrillRunning) return;

        clearTimeout(answerRevealTimeoutId);

        if (currentRound >= totalRounds) {
            endGame();
            return;
        }
        currentRound++;
        
        correctAnswerDisplay.innerHTML = '';
        correctAnswerDisplay.classList.remove('visible');

        roundIndicator.textContent = `Round ${currentRound} of ${totalRounds}`;
        
        const subject = getRandomItem(subjects);
        const timeExpression = getRandomItem(pastTimeExpressions);
        
        const allVerbs = [...regularVerbs, ...irregularVerbs];
        const verb = getRandomItem(allVerbs);
        const baseVerb = verb.verb || verb.base;
        
        let directObject = null;
        let destination = null;
        let complementText = timeExpression;

        if (verb.objects && verb.objects.length > 0) {
            directObject = getRandomItem(verb.objects);
            complementText = `${directObject}, ${timeExpression}`;
        } else if (verb.destinations && verb.destinations.length > 0) {
            destination = getRandomItem(verb.destinations);
            complementText = `${destination}, ${timeExpression}`;
        }

        currentLevel = parseInt(levelSelect.value, 10);
        let type;

        switch (currentLevel) {
            case 1: type = 'affirmative'; break;
            case 2: type = 'negative'; break;
            case 3: type = 'interrogative'; break;
            case 4: type = getRandomItem(['affirmative', 'negative', 'interrogative']); break;
            default: type = 'affirmative';
        }

        currentDrillItem = { subject, verb, directObject, destination, timeExpression, type };
        currentCorrectAnswer = buildSentence(currentDrillItem);

        promptSubject.textContent = subject;
        promptVerb.textContent = `(${baseVerb})`;
        promptComplement.textContent = complementText;
        promptType.textContent = (type !== 'affirmative') ? `(${type.toUpperCase()})` : '';

        listenModelButton.disabled = false;

        answerRevealTimeoutId = setTimeout(() => {
            correctAnswerDisplay.textContent = currentCorrectAnswer;
            correctAnswerDisplay.classList.add('visible');
            speak(currentCorrectAnswer);
        }, 7000);
    }

    function updateScoreDisplay() {
        scoreValue.textContent = score;
        streakValue.textContent = streak;
    }
    
    // --- Event Listeners ---

    startButton.addEventListener('click', () => {
        if (isDrillRunning) {
            endGame();
        } else {
            startGame();
        }
    });

    nextRoundButton.addEventListener('click', nextRound);

    listenModelButton.addEventListener('click', () => {
        if (currentCorrectAnswer) {
            speak(currentCorrectAnswer);
        }
    });
    
    speedControl.addEventListener('input', () => {
        speedValue.textContent = `${parseFloat(speedControl.value).toFixed(1)}x`;
    });
    
    levelSelect.addEventListener('change', () => {
        currentLevel = parseInt(levelSelect.value, 10);
        if (isDrillRunning) {
            endGame();
            roundIndicator.textContent = `Level changed to ${levelSelect.options[levelSelect.selectedIndex].text}. Press 'Start Drill' to begin.`;
        } else {
            roundIndicator.textContent = `Ready for ${levelSelect.options[levelSelect.selectedIndex].text}. Press 'Start Drill' to begin.`;
        }
    });

    // Initial voice loading
    if (synth.onvoiceschanged !== undefined) {
        synth.onvoiceschanged = loadVoices;
    }
    loadVoices();

});
