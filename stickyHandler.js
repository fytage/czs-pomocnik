import fs from 'fs';
import path from 'path';

// Path to the sticky messages JSON file
const stickyFilePath = path.join(process.cwd(), 'sticky_messages.json');

let stickyCache = null;

// Helper to read sticky messages
export function getStickyMessages() {
    if (stickyCache) return stickyCache;

    if (!fs.existsSync(stickyFilePath)) {
        stickyCache = {};
        return stickyCache;
    }
    try {
        const data = fs.readFileSync(stickyFilePath, 'utf8');
        stickyCache = JSON.parse(data);
    } catch (err) {
        console.error("Error parsing sticky_messages.json:", err);
        stickyCache = {};
    }
    return stickyCache;
}

// Helper to save sticky messages
export function saveStickyMessages(data) {
    stickyCache = data;
    fs.writeFileSync(stickyFilePath, JSON.stringify(data, null, 2), 'utf8');
}
