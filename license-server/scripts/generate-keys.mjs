#!/usr/bin/env node
// Generates a fresh Ed25519 license signing key pair + admin session secret.
// Usage: npm run gen-keys      (paste the output into .env.local or Vercel env vars)
import crypto from 'node:crypto';

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');

const privB64 = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const rawPub = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url'); // 32 raw bytes
if (rawPub.length !== 32) throw new Error('unexpected public key length');
const pubB64 = rawPub.toString('base64');
const sessionSecret = crypto.randomBytes(32).toString('base64url');

console.log('# --- CorePOS license server secrets (generated ' + new Date().toISOString() + ') ---');
console.log('# KEEP LICENSE_PRIVATE_KEY SECRET. Embed LICENSE_PUBLIC_KEY in the desktop client.');
console.log('# Changing the key pair later invalidates every token already issued to clients.');
console.log(`LICENSE_PRIVATE_KEY=${privB64}`);
console.log(`LICENSE_PUBLIC_KEY=${pubB64}`);
console.log(`ADMIN_SESSION_SECRET=${sessionSecret}`);
