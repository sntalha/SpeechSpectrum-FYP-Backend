import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import Constants from '../constant.js';

function tryParseJson(value) {
    if (!value || typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    const candidates = [trimmed];
    const hasWrappingQuotes =
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"));

    if (hasWrappingQuotes) {
        candidates.push(trimmed.slice(1, -1));
    }

    // Handles values copied from shell contexts with escaped quotes.
    candidates.push(trimmed.replace(/\\"/g, '"'));

    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate);
        } catch {
            // Try the next candidate format.
        }
    }

    return null;
}

function extractMultilineJsonFromDotenv() {
    let envText = '';

    try {
        const envPath = path.resolve(process.cwd(), '.env');
        envText = readFileSync(envPath, 'utf8');
    } catch {
        return null;
    }

    const key = 'FIREBASE_SERVICE_ACCOUNT_JSON=';
    const keyIndex = envText.indexOf(key);
    if (keyIndex === -1) {
        return null;
    }

    let cursor = keyIndex + key.length;
    while (cursor < envText.length && /\s/.test(envText[cursor])) {
        cursor += 1;
    }

    if (envText[cursor] !== '{') {
        return null;
    }

    const start = cursor;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (; cursor < envText.length; cursor += 1) {
        const char = envText[cursor];

        if (inString) {
            if (escaped) {
                escaped = false;
                continue;
            }

            if (char === '\\') {
                escaped = true;
                continue;
            }

            if (char === '"') {
                inString = false;
            }

            continue;
        }

        if (char === '"') {
            inString = true;
            continue;
        }

        if (char === '{') {
            depth += 1;
            continue;
        }

        if (char === '}') {
            depth -= 1;

            if (depth === 0) {
                return envText.slice(start, cursor + 1);
            }
        }
    }

    return null;
}

function getCredentials() {
    let invalidJsonDetected = false;

    if (Constants.FIREBASE_SERVICE_ACCOUNT_JSON) {
        const parsed = tryParseJson(Constants.FIREBASE_SERVICE_ACCOUNT_JSON);
        if (parsed) {
            return parsed;
        }

        const rawMultilineJson = extractMultilineJsonFromDotenv();
        if (rawMultilineJson) {
            const parsedMultiline = tryParseJson(rawMultilineJson);
            if (parsedMultiline) {
                return parsedMultiline;
            }
        }

        invalidJsonDetected = true;
    }

    if (
        Constants.FIREBASE_PROJECT_ID &&
        Constants.FIREBASE_CLIENT_EMAIL &&
        Constants.FIREBASE_PRIVATE_KEY
    ) {
        return {
            projectId: Constants.FIREBASE_PROJECT_ID,
            clientEmail: Constants.FIREBASE_CLIENT_EMAIL,
            privateKey: Constants.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        };
    }

    if (invalidJsonDetected) {
        throw new Error(
            'FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON. Use a single-line JSON string, a quoted multiline value, or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY.'
        );
    }

    return null;
}

let initialized = false;

export function initializeFirebaseAdmin() {
    if (initialized) {
        return admin;
    }

    const credentials = getCredentials();
    if (!credentials) {
        console.warn('Firebase Admin is not configured. Push delivery will be skipped.');
        initialized = true;
        return admin;
    }

    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(credentials)
        });
    }

    initialized = true;
    return admin;
}

export function isFirebaseConfigured() {
    return Boolean(
        Constants.FIREBASE_SERVICE_ACCOUNT_JSON ||
        (Constants.FIREBASE_PROJECT_ID && Constants.FIREBASE_CLIENT_EMAIL && Constants.FIREBASE_PRIVATE_KEY)
    );
}
