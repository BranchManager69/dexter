#!/usr/bin/env node

import { mkdir, copyFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));

const previewsDir = join(__dirname, '../previews');
const previewsVideoDir = join(previewsDir, 'video');
const publishDir = '/var/www/docs.dexter.cash/previews';

const mode = process.argv.includes('--png-only') ? 'png' : 'video';

const targets = [
  {
    slug: 'dexter-fe',
    url: 'https://dexter.cash',
  },
  {
    slug: 'dexter-beta',
    url: 'https://beta.dexter.cash',
  },
  {
    slug: 'pumpstreams',
    url: 'https://pump.dexter.cash',
  },
];

async function capture() {
  await mkdir(previewsDir, { recursive: true });
  await mkdir(previewsVideoDir, { recursive: true });
  await mkdir(publishDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    for (const target of targets) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        recordVideo:
          mode === 'video'
            ? { dir: previewsVideoDir, size: { width: 1280, height: 720 } }
            : undefined,
      });
      const page = await context.newPage();
      console.log(`→ Capturing ${target.url}`);
      await page.goto(target.url, { waitUntil: 'networkidle' });

      if (mode === 'video') {
        // simple scroll-and-return animation so videos have movement
        await page.waitForTimeout(1500);
        await page.evaluate(() => {
          window.scrollBy({ top: window.innerHeight * 0.35, behavior: 'smooth' });
        });
        await page.waitForTimeout(2000);
        await page.evaluate(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        await page.waitForTimeout(1500);
      } else {
        await page.waitForTimeout(2000);
      }

      const pngName = `${target.slug}.png`;
      const videoName = `${target.slug}.webm`;
      const localPng = join(previewsDir, pngName);
      await page.screenshot({ path: localPng, fullPage: false });
      await copyFile(localPng, join(publishDir, pngName));
      console.log(`   saved ${join(publishDir, pngName)}`);

      const videoHandle = page.video();
      await page.close();
      const videoPath = videoHandle ? await videoHandle.path() : null;
      await context.close();

      if (mode === 'video' && videoPath) {
        const videoDest = join(publishDir, videoName);
        await copyFile(videoPath, videoDest);
        console.log(`   saved ${videoDest}`);
      }
    }
  } finally {
    await browser.close();
  }

  const staticAssets = [
    {
      name: 'dexter-stack-wordmark.svg',
      src: join(previewsDir, 'dexter-stack-wordmark.svg'),
    },
  ];

  for (const asset of staticAssets) {
    try {
      await access(asset.src);
      await copyFile(asset.src, join(publishDir, asset.name));
      console.log(`   synced ${asset.name} → ${join(publishDir, asset.name)}`);
    } catch (err) {
      console.warn(`   skipped ${asset.name}: ${err.message}`);
    }
  }

  if (mode === 'video') {
    console.log('\nPreviews refreshed. README assets available at https://docs.dexter.cash/previews/<slug>.{png,webm}');
  } else {
    console.log('\nPNG previews refreshed. README assets available at https://docs.dexter.cash/previews/<slug>.png');
  }
}

capture().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
