#!/usr/bin/env node
import { randomBytes } from 'crypto';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Derive __dirname from import.meta.url (ES module pattern)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

/**
 * Generate a cryptographically secure auth token
 * @returns {string} 64-character hex token
 */
function generateAuthToken() {
  return randomBytes(32).toString('hex');
}

/**
 * Create .env file from .env.example template
 * @returns {string|null} Generated auth token or null if .env exists
 */
function createEnvFile() {
  const envPath = join(PROJECT_ROOT, '.env');
  const examplePath = join(PROJECT_ROOT, '.env.example');

  // Check if .env already exists - never overwrite
  if (existsSync(envPath)) {
    console.log('[WARNING] .env file already exists - skipping creation (not overwriting)');
    console.log('[INFO] If you need to regenerate, delete .env first');
    return null;
  }

  // Check if .env.example exists
  if (!existsSync(examplePath)) {
    console.error('[ERROR] .env.example not found - cannot create .env');
    process.exit(1);
  }

  // Read template
  const template = readFileSync(examplePath, 'utf-8');

  // Generate auth token
  const authToken = generateAuthToken();

  // Replace placeholder with generated token
  const envContent = template.replace('generate_with_openssl_rand_hex_32', authToken);

  // Write .env file
  writeFileSync(envPath, envContent, 'utf-8');
  console.log('[OK] Created .env file with generated AUTH_TOKEN');

  return authToken;
}

/**
 * Install npm dependencies
 */
function installDeps() {
  try {
    console.log('[INFO] Installing dependencies...');
    execFileSync('npm', ['install'], { cwd: PROJECT_ROOT, stdio: 'inherit' });
    console.log('[OK] Dependencies installed');
  } catch (error) {
    console.warn('[WARNING] Failed to install dependencies:', error.message);
    console.warn('[INFO] You may need to run "npm install" manually');
  }
}

/**
 * Print next-steps instructions
 * @param {string|null} authToken Generated auth token
 */
function printInstructions(authToken) {
  console.log('\n=== Claude SMS Connect - Setup Complete ===\n');

  if (authToken) {
    console.log('[OK] Auth token generated and saved to .env');
  } else {
    console.log('[OK] .env file already exists');
  }
  console.log('[OK] Dependencies installed');

  console.log('\n--- NEXT STEPS ---\n');
  console.log('1. Edit .env and add your Twilio credentials:');
  console.log('   - TWILIO_ACCOUNT_SID  (from Twilio Console > Account Info)');
  console.log('   - TWILIO_AUTH_TOKEN   (from Twilio Console > Account Info)');
  console.log('   - TWILIO_PHONE_NUMBER (your Twilio phone number, e.g., +15551234567)');
  console.log('   - USER_PHONE_NUMBER   (your personal phone number, e.g., +15559876543)');
  console.log('');
  console.log('2. Start the server:');
  console.log('   npm run dev');
  console.log('');
  console.log('3. Set up ngrok tunnel (in another terminal):');
  console.log('   ngrok http 3000');
  console.log('');
  console.log('4. Configure Twilio webhook:');
  console.log('   - Go to Twilio Console > Phone Numbers > Active Numbers');
  console.log('   - Set Messaging webhook to: https://YOUR-NGROK-URL/sms/inbound');
  console.log('');
  console.log('5. Configure Claude Code hook:');
  console.log('   - Copy hooks/claude-code-hook.sh to your preferred location');
  console.log('   - Make it executable: chmod +x hooks/claude-code-hook.sh');
  console.log('   - Edit the AUTH_TOKEN value in the script to match your .env');
  console.log('   - Add to Claude Code settings (see instructions in the hook script)');

  if (authToken) {
    console.log('');
    console.log(`Your AUTH_TOKEN: ${authToken}`);
    console.log('(Save this -- you will need it for the Claude Code hook configuration)');
  }

  console.log('');
}

/**
 * Main setup function
 */
function main() {
  try {
    console.log('Starting Claude SMS Connect setup...\n');

    const authToken = createEnvFile();
    installDeps();
    printInstructions(authToken);

    console.log('Setup complete!\n');
  } catch (error) {
    console.error('[ERROR] Setup failed:', error.message);
    process.exit(1);
  }
}

main();
