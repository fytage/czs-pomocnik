// status-checker.js

import fetch from 'node-fetch';
import fs from 'fs';

// --- Constants and Cache ---
const STATUS_FILE = 'server_status.json';

// JAVA CONFIG
const SERVER_IP = 'mc.czech-survival.cz';
const API_URL = `https://api.mcsrvstat.us/2/${SERVER_IP}`;

// BEDROCK CONFIG
const BEDROCK_SERVER_IP = 'bedrock.czech-survival.cz';
const BEDROCK_SERVER_PORT = '19111';
// FIX: Switched from /3/ to /2/ for better stability with custom ports
const BEDROCK_API_URL = `https://api.mcsrvstat.us/bedrock/2/${BEDROCK_SERVER_IP}:${BEDROCK_SERVER_PORT}`;

const CHECK_INTERVAL = 60 * 1000; // 1 minute

export let statusCache = { 
    java: { uptimeStart: null, downtimeStart: null, lastData: null },
    bedrock: { uptimeStart: null, downtimeStart: null, lastData: null }
};

// --- Cache Management ---
function loadStatusCache() {
    if (fs.existsSync(STATUS_FILE)) {
        try {
            const loadedCache = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
            statusCache = {
                java: { ...statusCache.java, ...loadedCache.java },
                bedrock: { ...statusCache.bedrock, ...loadedCache.bedrock }
            };
            console.log('\x1b[32m%s\x1b[0m', 'Uspesne jsem nacetl server status z cache.');
        } catch (error) {
            console.error('Error loading status cache:', error);
        }
    }
}

function saveStatusCache() {
    try {
        fs.writeFileSync(STATUS_FILE, JSON.stringify(statusCache, null, 2));
    } catch (error) {
        console.error('Error saving status cache:', error);
    }
}

async function checkJavaStatus() {
    let response; 
    try {
        const headers = {
            'User-Agent': 'Czech-Survival-Status-Bot/1.0 (https://czech-survival.cz)'
        };
        
        response = await fetch(API_URL, { headers });
        const contentType = response.headers.get('content-type');

        if (response.ok && contentType && contentType.includes('application/json')) {
            const data = await response.json();
            const now = Date.now();
            
            const badMessages = ['Failed to connect to server', 'Server not found'];
            const isActuallyOnline = data.online 
                && !badMessages.includes(data.motd?.clean?.join('\n'));
            data.online = isActuallyOnline; 

            if (isActuallyOnline) {
                if (!statusCache.java.uptimeStart) statusCache.java.uptimeStart = now;
                statusCache.java.downtimeStart = null;
            } else {
                if (!statusCache.java.downtimeStart) statusCache.java.downtimeStart = now;
                statusCache.java.uptimeStart = null;
            }
            statusCache.java.lastData = data;
        } else {
            // Silent fail: Treat invalid API response as offline/maintenance, don't crash
            console.warn(`Java API Warning: Received ${response.status} instead of JSON.`);
            handleOfflineState('java');
        }
    } catch (error) {
        console.error('Error processing Java server status:', error.message);
        handleOfflineState('java');
    }
}

async function checkBedrockStatus() {
    let response;
    try {
        const headers = {
            'User-Agent': 'Czech-Survival-Status-Bot/1.0 (https://czech-survival.cz)'
        };
        
        response = await fetch(BEDROCK_API_URL, { headers });
        const contentType = response.headers.get('content-type');

        // Check for OK status and JSON content
        if (response.ok && contentType && contentType.includes('application/json')) {
            const data = await response.json();
            const now = Date.now();

            // V2 API structure is slightly different, but 'online' boolean usually exists
            const bedrockMotd = data.motd?.clean?.join('\n') || '';
            const isActuallyOnline = data.online && bedrockMotd !== 'Failed to connect to server';
            data.online = isActuallyOnline;

            if (isActuallyOnline) {
                if (!statusCache.bedrock.uptimeStart) statusCache.bedrock.uptimeStart = now;
                statusCache.bedrock.downtimeStart = null;
            } else {
                if (!statusCache.bedrock.downtimeStart) statusCache.bedrock.downtimeStart = now;
                statusCache.bedrock.uptimeStart = null;
            }
            statusCache.bedrock.lastData = data;
        } else {
            // Handle HTTP 500 or HTML responses here without throwing
            console.warn(`Bedrock status API down or unavailable. Received HTTP ${response.status}`);
            handleOfflineState('bedrock');
        }
    } catch (error) {
        console.error('Error processing Bedrock server status:', error.message);
        handleOfflineState('bedrock');
    }
}

// Helper to avoid code duplication when setting offline state
function handleOfflineState(type) {
    if (!statusCache[type].downtimeStart) {
        statusCache[type].downtimeStart = Date.now();
    }
    statusCache[type].uptimeStart = null;
    // Keep previous data if possible, otherwise set minimal offline object
    if (!statusCache[type].lastData) {
        statusCache[type].lastData = { online: false };
    } else {
        statusCache[type].lastData.online = false;
    }
}

// --- Main Background Task Runner ---
async function runChecks() {
    await Promise.all([
        checkJavaStatus(),
        checkBedrockStatus()
    ]);
    saveStatusCache();
}

export function startStatusChecker() {
    console.log('Initializing status checker...');
    loadStatusCache();
    runChecks(); 
    setInterval(runChecks, CHECK_INTERVAL); 
}