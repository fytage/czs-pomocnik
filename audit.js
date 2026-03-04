/*
 * This file is used to run npm audit fix from within Pterodactyl
 * when the startup command is locked to 'node <file>'.
 * --- ES Module Version ---
 */

// --- FIX: Use import (ESM) instead of require (CJS) ---
import { exec } from 'child_process';

console.log('--- STARTING NPM AUDIT ---');
console.log('Running "npm audit fix && npm install"...');

// Execute the command
const auditProcess = exec('npm audit fix && npm install');

// Stream the output (stdout) from the command to the panel console
auditProcess.stdout.on('data', (data) => {
  process.stdout.write(data); // Using process.stdout.write to avoid adding extra newlines
});

// Stream the error output (stderr)
auditProcess.stderr.on('data', (data) => {
  process.stderr.write(data);
});

// Handle the completion of the command
auditProcess.on('close', (code) => {
  if (code === 0) {
    console.log('--- NPM AUDIT SUCCEEDED ---');
  } else {
    console.error(`--- NPM AUDIT FAILED (Exit Code: ${code}) ---`);
  }
  
  console.log('!!! TASK COMPLETE !!!');
  console.log('You must now go back to the "Startup" tab and change the startup file back to index.js');
  
  // We exit the process so the server stops,
  // allowing you to make the change.
  process.exit();
});