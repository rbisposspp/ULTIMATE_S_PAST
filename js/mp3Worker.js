// Safe, library-free stub worker to avoid runtime errors when LAME is not bundled.
// It loads successfully and responds with clear error messages for any command.

self.onmessage = function(e) {
    const cmd = e && e.data && e.data.cmd;
    switch (cmd) {
        case 'init':
            self.postMessage({ cmd: 'error', error: 'MP3 encoding not available (LAME library not bundled).' });
            break;
        case 'encode':
        case 'finish':
            self.postMessage({ cmd: 'error', error: 'MP3 encoding disabled. Please enable LAME to use this feature.' });
            break;
        default:
            self.postMessage({ cmd: 'error', error: `MP3 worker disabled. Unknown or unsupported command: ${cmd}` });
    }
};
