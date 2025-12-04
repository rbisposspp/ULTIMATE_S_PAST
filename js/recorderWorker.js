let recLength = 0;
let recBuffers = []; // Array of arrays of Float32Array buffers for each channel
let sampleRate;
let numChannels;

this.onmessage = function(e) {
    switch (e.data.command) {
        case 'init':
            init(e.data.config);
            break;
        case 'record':
            record(e.data.buffer);
            break;
        case 'exportWAV':
            exportWAV(e.data.type); // type is 'audio/wav'
            break;
        case 'getBuffer': // This command is not typically used with WAV export directly to Blob
            getFloat32Buffers(); // Renamed for clarity if needed
            break;
        case 'clear':
            clear();
            break;
        default:
            console.warn(`recorderWorker: Unknown command received: ${e.data.command}`);
            break;
    }
};

function init(config) {
    sampleRate = config.sampleRate;
    numChannels = config.numChannels || 1;
    initBuffers();
    // console.log(`recorderWorker: Initialized with sampleRate=${sampleRate}, numChannels=${numChannels}`);
}

function record(inputBuffer) { // inputBuffer is an array of Float32Array(s)
    if (!recBuffers || (numChannels > 0 && !recBuffers[0])) { // Ensure buffers are initialized
        initBuffers();
    }

    if (numChannels === 1 && inputBuffer instanceof Float32Array) {
        // Handle mono audio sent as a single Float32Array directly
        if (inputBuffer.length > 0) {
            recBuffers[0].push(inputBuffer);
            recLength += inputBuffer.length;
        }
        return;
    }

    // Handle array of Float32Arrays (standard case or stereo)
    if (Array.isArray(inputBuffer) && inputBuffer.length === numChannels) {
        let currentBufferLength = 0;
        for (let channel = 0; channel < numChannels; channel++) {
            if (inputBuffer[channel] && inputBuffer[channel] instanceof Float32Array && inputBuffer[channel].length > 0) {
                recBuffers[channel].push(inputBuffer[channel]);
                if (channel === 0) { // Use length of first channel to increment total recLength
                    currentBufferLength = inputBuffer[channel].length;
                }
            } else {
                // console.warn(`recorderWorker: Missing, empty, or invalid data for channel ${channel}.`);
                // If one channel is bad, we might have inconsistent data. Decide how to handle.
                // For now, we'll only update recLength if channel 0 is valid.
                return;
            }
        }
        if (currentBufferLength > 0) {
            recLength += currentBufferLength;
        }
    } else {
        // console.warn(`recorderWorker: inputBuffer is not in the expected format (array of Float32Arrays with length ${numChannels}).`);
    }
}


function exportWAV(type) {
    if (recLength === 0) {
        console.warn("recorderWorker: exportWAV called with no recorded data.");
        this.postMessage(null); // Indicate no data or error
        return;
    }

    const mergedBuffers = [];
    for (let channel = 0; channel < numChannels; channel++) {
        if (!recBuffers[channel] || recBuffers[channel].length === 0) {
            console.error(`recorderWorker: No data found for channel ${channel} during export.`);
            this.postMessage(null);
            return;
        }
        mergedBuffers.push(mergeBuffers(recBuffers[channel], recLength));
    }

    let interleaved;
    if (numChannels === 2) {
        if (mergedBuffers[0].length !== mergedBuffers[1].length) {
            console.error("recorderWorker: Stereo channels have different lengths, cannot interleave properly.");
            this.postMessage(null);
            return;
        }
        interleaved = interleave(mergedBuffers[0], mergedBuffers[1]);
    } else { // Mono
        interleaved = mergedBuffers[0];
    }

    if (!interleaved || interleaved.length === 0) {
        console.error("recorderWorker: Interleaved/merged buffer is empty before WAV encoding.");
        this.postMessage(null);
        return;
    }

    const dataview = encodeWAV(interleaved);
    const audioBlob = new Blob([dataview], { type: type || 'audio/wav' });

    this.postMessage(audioBlob);
}

function getFloat32Buffers() { // Renamed from getBuffer
    const buffers = [];
    for (let channel = 0; channel < numChannels; channel++) {
        buffers.push(mergeBuffers(recBuffers[channel], recLength));
    }
    // To send Float32Array data, you might want to send their underlying ArrayBuffers for transfer
    // Example: this.postMessage(buffers.map(b => b.buffer), buffers.map(b => b.buffer));
    // For now, keeping as is (clones data) as WAV export is primary.
    this.postMessage(buffers);
}

function clear() {
    recLength = 0;
    recBuffers = [];
    initBuffers();
    // console.log("recorderWorker: Cleared.");
}

function initBuffers() {
    recBuffers = []; // Ensure it's reset
    for (let channel = 0; channel < numChannels; channel++) {
        recBuffers[channel] = [];
    }
    recLength = 0; // Reset length too
}

function mergeBuffers(channelRecBuffers, totalRecLength) {
    const result = new Float32Array(totalRecLength);
    let offset = 0;
    for (let i = 0; i < channelRecBuffers.length; i++) {
        result.set(channelRecBuffers[i], offset);
        offset += channelRecBuffers[i].length;
    }
    return result;
}

function interleave(inputL, inputR) {
    const length = inputL.length + inputR.length;
    const result = new Float32Array(length);
    let index = 0;
    let inputIndex = 0;

    while (index < length) {
        result[index++] = inputL[inputIndex];
        result[index++] = inputR[inputIndex];
        inputIndex++;
    }
    return result;
}

function floatTo16BitPCM(output, offset, input) {
    for (let i = 0; i < input.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, input[i])); // Clamp to [-1, 1]
        output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true); // true for little-endian
    }
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

function encodeWAV(samples) {
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = samples.length * bytesPerSample;

    const buffer = new ArrayBuffer(44 + dataSize); // WAV header is 44 bytes
    const view = new DataView(buffer);

    /* RIFF identifier */
    writeString(view, 0, 'RIFF');
    /* RIFF chunk length */
    view.setUint32(4, 36 + dataSize, true); // 36 = 44 (header) - 8 (RIFF ID and size)
    /* RIFF type */
    writeString(view, 8, 'WAVE');
    /* format chunk identifier */
    writeString(view, 12, 'fmt ');
    /* format chunk length */
    view.setUint32(16, 16, true); // 16 for PCM
    /* sample format (raw PCM) */
    view.setUint16(20, 1, true); // 1 for PCM
    /* channel count */
    view.setUint16(22, numChannels, true);
    /* sample rate */
    view.setUint32(24, sampleRate, true);
    /* byte rate (sampleRate * numChannels * bytesPerSample) */
    view.setUint32(28, byteRate, true);
    /* block align (numChannels * bytesPerSample) */
    view.setUint16(32, blockAlign, true);
    /* bits per sample */
    view.setUint16(34, bitsPerSample, true);
    /* data chunk identifier */
    writeString(view, 36, 'data');
    /* data chunk length */
    view.setUint32(40, dataSize, true);

    floatTo16BitPCM(view, 44, samples);

    return view;
}