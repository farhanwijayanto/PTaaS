#!/usr/bin/env node
/**
 * Pre-pulls or builds the golden PTaaS Kali image ahead of time so Create VM
 * never blocks on a multi-GB download.
 *
 * Usage:
 *   node scripts/prepare-images.mjs            # pulls pinned KALI_IMAGE
 *   node scripts/prepare-images.mjs --build    # builds images/kali/Dockerfile as ptaas/kali:2024.3
 *   KALI_IMAGE=alpine:3.20 node scripts/prepare-images.mjs
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const DEFAULT_PINNED_KALI_IMAGE = 'kasmweb/kali-rolling-desktop:1.15.0';
const DEFAULT_LOCAL_BUILD_TAG = 'ptaas/kali:2024.3';

function assertPinnedRef(imageRef) {
  const ref = String(imageRef || '').trim();
  if (!ref) throw new Error('Image reference cannot be empty.');
  if (/:latest$/i.test(ref)) {
    throw new Error(`Refusing unpinned ':latest' tag (${ref}). Pin an exact tag or @sha256 digest.`);
  }
  if (!ref.includes(':') && !ref.includes('@sha256:')) {
    throw new Error(`Image reference (${ref}) must include an explicit tag or @sha256 digest.`);
  }
  return ref;
}

async function runDocker(args) {
  console.log(`$ docker ${args.join(' ')}`);
  const { stdout, stderr } = await execFileAsync('docker', args, {
    maxBuffer: 20 * 1024 * 1024,
  });
  if (stdout.trim()) console.log(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
}

async function main() {
  const buildMode = process.argv.includes('--build');
  const targetImage = assertPinnedRef(
    process.env.KALI_IMAGE || (buildMode ? DEFAULT_LOCAL_BUILD_TAG : DEFAULT_PINNED_KALI_IMAGE)
  );

  // Check if already available locally unless --force is passed
  if (!process.argv.includes('--force')) {
    try {
      const { stdout } = await execFileAsync('docker', ['image', 'inspect', '--format', '{{.Id}}', targetImage]);
      if (stdout.trim()) {
        console.log(`[OK] Golden image already present locally: ${targetImage} (${stdout.trim().slice(0, 19)})`);
        return;
      }
    } catch {
      // Not present locally yet
    }
  }

  if (buildMode) {
    const contextDir = path.resolve(process.cwd(), 'images', 'kali');
    await runDocker(['build', '-t', targetImage, contextDir]);
  } else {
    await runDocker(['pull', targetImage]);
  }

  const { stdout: verified } = await execFileAsync('docker', [
    'image',
    'inspect',
    '--format',
    '{{.Id}} {{.Size}}',
    targetImage,
  ]);
  console.log(`[READY] Golden image verified locally: ${targetImage} -> ${verified.trim()}`);
}

main().catch((err) => {
  console.error('[FAILED] prepare-images:', err.message || err);
  process.exit(1);
});
