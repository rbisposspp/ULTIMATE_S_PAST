(function(window) {
    // Default paths, can be overridden by config if mainRecorder.js is in a different location relative to its workers
    const RECORDER_WORKER_PATH = 'js/recorderWorker.js'; // Assuming recorderWorker.js is in js/ relative to HTML
    const ENCODER_WORKER_PATH = 'js/mp3Worker.js';     // Assuming mp3Worker.js is in js/ relative to HTML

    const Recorder = function(sourceNode, cfg) {
        const config = cfg || {};
        const bufferLen = config.bufferLen || 4096;
        const numChannels = config.numChannels || 1; // Default to 1 for TTS recording consistency
        this.context = sourceNode.context;
        const sampleRate = this.context.sampleRate;

        // Handle deprecated audio nodes and prefer createScriptProcessor
        if (this.context.createScriptProcessor) { // Standard
            // console.warn('Using deprecated createScriptProcessor. Consider migrating to AudioWorklet for future compatibility.');
            this.node = this.context.createScriptProcessor(bufferLen, numChannels, numChannels);
        } else if (this.context.createJavaScriptNode) { // Highly deprecated fallback
            console.warn('Using very deprecated createJavaScriptNode. Audio processing might not work in some browsers.');
            this.node = this.context.createJavaScriptNode(bufferLen, numChannels, numChannels);
        } else {
            throw new Error("Audio script processing node (createScriptProcessor or createJavaScriptNode) not supported by this browser.");
        }

        let recordingWorker;
        try {
            const workerPath = config.recorderWorkerPath || RECORDER_WORKER_PATH;
            // console.log("Attempting to load Recorder Worker from:", workerPath);
            recordingWorker = new Worker(workerPath);
        } catch (e) {
            console.error(`Failed to load recorderWorker.js from path: ${config.recorderWorkerPath || RECORDER_WORKER_PATH}. Error: ${e.message}`);
            throw new Error(`Failed to initialize Recorder Worker: ${e.message}. Check worker path and script availability.`);
        }

        recordingWorker.postMessage({
            command: 'init',
            config: {
                sampleRate: sampleRate,
                numChannels: numChannels
            }
        });

        let mp3EncoderWorker = null; // Initialize to null, only create if needed for MP3 export
        
        let recording = false;
        let currentMP3Callback; // This will now serve for both WAV and MP3 callbacks
        let mp3DataChunks = []; // Array of ArrayBuffers, used specifically for MP3 encoding

        this.node.onaudioprocess = (e) => {
            if (!recording) return;
            const inputData = [];
            for (let channel = 0; channel < numChannels; channel++) {
                inputData.push(e.inputBuffer.getChannelData(channel).slice(0)); // .slice(0) to clone
            }
            recordingWorker.postMessage({
                command: 'record',
                buffer: inputData
            });
        };

        this.isRecording = function() {
            return recording;
        };

        this.record = function() {
            recording = true;
        };

        this.stop = function() {
            recording = false;
        };

        this.clear = function() {
            recordingWorker.postMessage({ command: 'clear' });
            if (mp3EncoderWorker) { 
                mp3DataChunks = [];
            }
        };

        function parseWav(wavUint8Array) { // Helper to extract PCM data from a WAV Blob
            function readInt(offset, numBytes) {
                let val = 0;
                for (let i = 0; i < numBytes; i++) {
                    if (offset + i >= wavUint8Array.length) {
                        console.error("WAV parsing error: Attempted to read past end of buffer at offset", offset + i);
                        throw new Error("Invalid WAV data: Read past end of buffer.");
                    }
                    val |= wavUint8Array[offset + i] << (i * 8);
                }
                return val;
            }

            if (wavUint8Array.length < 44) {
                console.error("Invalid WAV file: File too short (less than 44 bytes). Length:", wavUint8Array.length);
                return null;
            }

            if (readInt(0, 4) !== 0x46464952 || readInt(8, 4) !== 0x45564157) { // "RIFF" "WAVE"
                console.error("Invalid WAV file: RIFF/WAVE header not found");
                return null;
            }
            if (readInt(12, 4) !== 0x20746d66) { // "fmt "
                console.error("Invalid WAV file: 'fmt ' chunk not found");
                return null;
            }

            const fmtChunkSize = readInt(16, 4);
            // const audioFormat = readInt(20, 2); // Usually 1 for PCM
            const channels = readInt(22, 2);
            const parsedSampleRate = readInt(24, 4);
            const bitsPerSample = readInt(34, 2);
            let dataChunkOffset = 12 + 4 + fmtChunkSize + 4; // Start after 'fmt ' ID, size, and actual fmt_ chunk content

            // Search for 'data' chunk robustly
            while(dataChunkOffset < wavUint8Array.length - 8) {
                if (readInt(dataChunkOffset, 4) === 0x61746164) { // "data"
                    dataChunkOffset += 8; // Skip chunk ID ("data") and data chunk size field
                    break;
                }
                const chunkSize = readInt(dataChunkOffset + 4, 4);
                dataChunkOffset += (8 + chunkSize);
                 if (chunkSize === 0 && dataChunkOffset < wavUint8Array.length - 8) {
                     console.warn("Zero-size chunk encountered in WAV at offset", dataChunkOffset - (8+chunkSize), "attempting to skip.");
                 }
            }

            if (dataChunkOffset >= wavUint8Array.length) {
                console.error("Invalid WAV file: 'data' chunk not found or malformed header. Final offset:", dataChunkOffset, "File length:", wavUint8Array.length);
                return null;
            }
            return {
                sampleRate: parsedSampleRate,
                bitsPerSample: bitsPerSample,
                channels: channels,
                samples: wavUint8Array.subarray(dataChunkOffset)
            };
        }

        function uint8ArrayToFloat32Array(u8a, bitsPerSample) { // Converts PCM data (from WAV) to Float32Array
            if (bitsPerSample === 16) {
                if (u8a.length % 2 !== 0) {
                    // console.warn("16-bit PCM data has odd length, last byte will be ignored. Original length:", u8a.length);
                    u8a = u8a.subarray(0, u8a.length - (u8a.length % 2));
                }
                const f32Buffer = new Float32Array(u8a.length / 2);
                for (let i = 0, j = 0; i < u8a.length; i += 2, j++) {
                    let value = (u8a[i + 1] << 8) | u8a[i]; // Little-endian
                    if (value >= 0x8000) value |= ~0xFFFF; // Sign extend if negative
                    f32Buffer[j] = value / 0x8000; // Normalize to -1.0 to 1.0
                }
                return f32Buffer;
            } else if (bitsPerSample === 8) {
                const f32Buffer = new Float32Array(u8a.length);
                for (let i = 0; i < u8a.length; i++) {
                    f32Buffer[i] = (u8a[i] - 128) / 128.0; // Normalize 8-bit unsigned PCM (0-255)
                }
                return f32Buffer;
            } else {
                console.error("Unsupported bitsPerSample for PCM to Float32 conversion: " + bitsPerSample);
                return new Float32Array(0);
            }
        }
        
        // Generic export function, can be called by exportWAV or exportMP3
        this.exportAudio = function(callback, exportAsMp3 = false) {
            if (recording) {
                if (callback) callback(new Error("Recording in progress. Please stop first."), null);
                return;
            }
            config.exportMp3 = exportAsMp3; // Set a flag for the onmessage handler
            currentMP3Callback = callback; 
            recordingWorker.postMessage({
                command: 'exportWAV', 
                type: 'audio/wav' 
            });
        };

        this.exportWAV = function(callback) {
            this.exportAudio(callback, false); // exportAsMp3 is false
        }

        this.exportMP3 = function(callback) {
            if (!mp3EncoderWorker) { // Lazy load MP3 worker
                try {
                    const workerPath = config.encoderWorkerPath || ENCODER_WORKER_PATH;
                    mp3EncoderWorker = new Worker(workerPath);
                     mp3EncoderWorker.onmessage = (e_mp3) => { 
                        if (e_mp3.data.cmd === 'data') {
                            if (e_mp3.data.buf instanceof ArrayBuffer && e_mp3.data.buf.byteLength > 0) {
                                mp3DataChunks.push(e_mp3.data.buf);
                            }
                        } else if (e_mp3.data.cmd === 'end') {
                            if (e_mp3.data.buf instanceof ArrayBuffer && e_mp3.data.buf.byteLength > 0) {
                                mp3DataChunks.push(e_mp3.data.buf);
                            }
                            const finalMp3Blob = new Blob(mp3DataChunks, { type: 'audio/mp3' });
                            if (currentMP3Callback) {
                                currentMP3Callback(null, finalMp3Blob); // Error first callback
                            }
                            mp3DataChunks = []; 
                        } else if (e_mp3.data.cmd === 'error') {
                            console.error("mp3EncoderWorker error:", e_mp3.data.error);
                            if (currentMP3Callback) {
                                currentMP3Callback(new Error(e_mp3.data.error || "MP3 encoding failed in worker"), null);
                            }
                        } else if (e_mp3.data.cmd === 'initComplete') {
                            // console.log("MP3 Encoder Worker initialized successfully for current export.");
                        }
                    };
                } catch (e) {
                    console.error(`Failed to load mp3Worker.js from path: ${config.encoderWorkerPath || ENCODER_WORKER_PATH}. Error: ${e.message}`);
                    if (callback) callback(new Error(`Failed to initialize MP3 Encoder Worker: ${e.message}. Check worker path and script availability.`), null);
                    return;
                }
            }
            this.exportAudio(callback, true); // exportAsMp3 is true
        };

        recordingWorker.onmessage = (e_wav) => { 
            const wavBlob = e_wav.data;
            if (!currentMP3Callback) return;

            if (!wavBlob) { 
                 currentMP3Callback(new Error("No data recorded to export."), null);
                 return;
            }

            if (config.exportMp3) { 
                if (!mp3EncoderWorker) { 
                    currentMP3Callback(new Error("MP3 encoder worker not initialized for MP3 export."), null);
                    return;
                }
                convertToMP3(wavBlob, currentMP3Callback);
            } else { 
                currentMP3Callback(null, wavBlob); // Pass error as first arg (null if success)
            }
        };


        function convertToMP3(wavBlob, finalMp3Callback) { // Converts a WAV Blob to MP3 Blob
            const fileReader = new FileReader();
            mp3DataChunks = []; 

            fileReader.onload = function() {
                const arrayBuffer = this.result;
                const uint8Buffer = new Uint8Array(arrayBuffer);
                let wavData;
                try {
                    wavData = parseWav(uint8Buffer);
                } catch (e) {
                    console.error("Error parsing WAV data:", e);
                    if (finalMp3Callback) finalMp3Callback(new Error(`WAV parsing failed: ${e.message}`), null);
                    return;
                }

                if (!wavData) {
                    if (finalMp3Callback) finalMp3Callback(new Error("Failed to parse WAV data or WAV data is null."), null);
                    return;
                }

                mp3EncoderWorker.postMessage({
                    cmd: 'init',
                    config: {
                        mode: wavData.channels === 1 ? Lame.MONO : Lame.JOINT_STEREO,
                        channels: wavData.channels,
                        samplerate: wavData.sampleRate,
                        bitrate: config.bitrate || 128 
                    }
                });

                const pcmSamplesFloat32 = uint8ArrayToFloat32Array(wavData.samples, wavData.bitsPerSample);

                if (pcmSamplesFloat32.length === 0 && wavData.samples.length > 0) {
                    if (finalMp3Callback) finalMp3Callback(new Error("PCM to Float32 conversion resulted in empty buffer from non-empty input."), null);
                    return;
                }
                if (pcmSamplesFloat32.length === 0 && (wavData.bitsPerSample !== 16 && wavData.bitsPerSample !== 8)) {
                    if (finalMp3Callback) finalMp3Callback(new Error(`Unsupported WAV bit depth for conversion: ${wavData.bitsPerSample}`), null);
                    return;
                }

                mp3EncoderWorker.postMessage(
                    { cmd: 'encode', buf: pcmSamplesFloat32.buffer },
                    [pcmSamplesFloat32.buffer]
                );
                mp3EncoderWorker.postMessage({ cmd: 'finish' });
            };
            
            fileReader.onerror = (err) => {
                console.error("FileReader error:", err);
                if (finalMp3Callback) finalMp3Callback(err, null);
            };
            fileReader.readAsArrayBuffer(wavBlob);
        }


        // Defensive programming for node connection
        if (sourceNode && typeof sourceNode.connect === 'function' &&
            this.node && typeof this.node.connect === 'function') {
            try {
                sourceNode.connect(this.node);
                 // this.node.connect(this.context.destination); // Uncomment for passthrough audio
            } catch (e) {
                console.error("Error connecting audio node in mainRecorder:", e);
            }
        } else {
            console.error("Cannot connect audio nodes in mainRecorder: sourceNode, this.node, or their connect methods are invalid.");
        }

        // Method to disconnect and clean up resources
        this.close = function() {
            if (sourceNode && typeof sourceNode.disconnect === 'function') {
                try {
                    sourceNode.disconnect(this.node);
                } catch (e) {
                    console.warn("Error disconnecting sourceNode from script processor node:", e);
                }
            }
            if (this.node && typeof this.node.disconnect === 'function') {
                try {
                    // if (this.context && this.context.destination) { // If passthrough was connected
                    //     this.node.disconnect(this.context.destination);
                    // }
                    this.node.disconnect(); // Disconnects from all outputs
                } catch(e) {
                    console.warn("Error disconnecting script processor node:", e);
                }
            }
            if (recordingWorker) recordingWorker.terminate();
            if (mp3EncoderWorker) mp3EncoderWorker.terminate();
            // Note: AudioContext is managed by the calling script (e.g., practiceAudioContext in script.js)
            // console.log("Recorder instance closed and workers terminated.");
        };
    };

    window.Recorder = Recorder;

})(window);