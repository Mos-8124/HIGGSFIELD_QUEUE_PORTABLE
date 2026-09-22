import fs from 'node:fs';
import path, { basename, resolve, dirname } from 'node:path';

const VALID_MODES = new Set(['image', 'video']);
const IMAGE_RATIOS = new Set(['16:9', '4:3', '1:1', '3:4', '9:16']);
const VIDEO_RATIOS = new Set(['16:9', '9:16']);
const VIDEO_DURATIONS = new Set([4, 6, 8, 10]);
const IMAGE_MODELS = new Set(['Nano Banana 2', 'Nano Banana Pro', 'Nano Banana 2 Lite', 'Imagen 4']);
const VIDEO_MODELS = new Set(['Omni Flash', 'Omni 1.1 Flash', 'Veo 3.1 - Lite', 'Veo 3.1 - Fast', 'Veo 3.1 - Quality', 'Veo 3.1 - Lite [Lower Priority]']);
export const VEO_MODELS = new Set(['Veo 3.1 - Lite', 'Veo 3.1 - Fast', 'Veo 3.1 - Quality', 'Veo 3.1 - Lite [Lower Priority]']);
export const VIDEO_RESOLUTIONS = new Set(['360p', '720p']);
const MODEL_ALIASES = new Map([
  ['Omni Flash', 'Omni 1.1 Flash'],
  ['Veo 3.1 Fast', 'Veo 3.1 - Fast'],
  ['Veo 3.1', 'Veo 3.1 - Quality'],
  ['Veo 3.1 Quality', 'Veo 3.1 - Quality'],
  ['Veo 3.1 Lite', 'Veo 3.1 - Lite'],
  ['Veo 3.1 Lite (Lower priority)', 'Veo 3.1 - Lite [Lower Priority]'],
  ['Veo 3.1 - Lite (Lower Priority)', 'Veo 3.1 - Lite [Lower Priority]'],
]);
export const FLOW_PROMPT_WAIT_MS = 15_000;
export const FLOW_UI_ACTION_DELAY_MS = 1_250;
export const FLOW_UPLOAD_SETTLE_MS = 15_000;
export const FLOW_UPLOAD_MAX_WAIT_MS = 20_000;
export const FLOW_GENERATION_MIN_WAIT_MS = 30_000;
export const FLOW_GENERATION_MAX_WAIT_MS = 45_000;
export const FLOW_VIDEO_GENERATION_MAX_WAIT_MS = 5 * 60_000;
export const FLOW_DOWNLOAD_WAIT_MS = 15_000;
export const FLOW_CREATE_BUTTON_XPATH = '//*[@id="__next"]/div[1]/div[5]/div/div/div/div/div[3]/div[2]/button[2]';
export const FLOW_FIRST_FRAME_SLOT_XPATH = '//*[@id="__next"]/div[1]/div[5]/div/div/div/div/div[1]/div[1]';
export const FLOW_LAST_FRAME_SLOT_XPATH = '//*[@id="__next"]/div[1]/div[5]/div/div/div/div/div[1]/div[2]';

export const FLOW_POST_GENERATION_WAIT_MS = 3_000;
export const FLOW_TASK_QUEUE_DELAY_MS = 10_000;
export const FLOW_BATCH_DOWNLOAD_BUTTON_XPATH = '//*[@id="main-content"]/flow-project-shell/flow-project-page/div/flow-project-sidenav-container/mat-sidenav-container/mat-sidenav-content/div/div/cdk-virtual-scroll-viewport/div[1]/div[1]/div[1]/flow-batch-info/div[1]/button[1]';
export const FLOW_DOWNLOAD_TIMEOUT_MS = 60_000;

let lastFlowJobFinishedAt = 0;
export const setLastFlowJobFinishedAt = ts => { lastFlowJobFinishedAt = Number(ts) || 0; };
export const getLastFlowJobFinishedAt = () => lastFlowJobFinishedAt;

const archiveExtensions = {
  image: new Set(['.png', '.jpg', '.jpeg', '.webp']),
  video: new Set(['.mp4', '.webm', '.mov']),
};

export const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Flow Frames maps the first attached image to the opening frame and the second to the closing frame. */
export const assignFlowFrameRoles = assets => {
  if (!Array.isArray(assets) || assets.length < 1 || assets.length > 2) throw new Error('Flow Frames requires one or two images.');
  if (assets.some(asset => !String(asset?.mimeType || '').startsWith('image/'))) throw new Error('Flow Frames accepts images only.');
  return assets.map((asset, index) => ({ ...asset, role: index === 0 ? 'first_frame' : 'last_frame' }));
};

export const isZipDownload = (bytes, suggestedFilename = '') => {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const clean = String(suggestedFilename || '').split('?')[0].toLowerCase();
  return clean.endsWith('.zip') || (data.length >= 2 && data[0] === 0x50 && data[1] === 0x4b);
};

export const isGzipDownload = (bytes, suggestedFilename = '') => {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const clean = String(suggestedFilename || '').split('?')[0].toLowerCase();
  return clean.endsWith('.gz') || clean.endsWith('.gzip') || (data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b);
};

export const isFlowMediaFilename = (filename, mode) => {
  const clean = String(filename || '').split('?')[0].split('#')[0].toLowerCase();
  const ext = clean.slice(clean.lastIndexOf('.'));
  return archiveExtensions[mode]?.has(ext) || false;
};

/** Picks a real renderable media file from a Flow download archive. */
export const selectAllFlowArchiveMedia = (files, mode, variants = 1) => {
  const allowed = archiveExtensions[mode];
  if (!allowed) throw new Error('Unsupported Flow archive media mode.');
  const requested = Number(variants);
  if (!Number.isInteger(requested) || requested < 1 || requested > 4) throw new Error('Flow variants must be between 1 and 4.');
  const matches = Object.entries(files).filter(([filename, bytes]) => {
    const base = basename(filename);
    if (filename.startsWith('__MACOSX/') || base.startsWith('._')) return false;
    const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase();
    return allowed.has(extension) && bytes instanceof Uint8Array && bytes.length > 0;
  }).sort(([left], [right]) => left.localeCompare(right)).map(([filename, bytes]) => ({ filename: basename(filename), bytes }));
  if (matches.length < requested) throw new Error(`Flow ZIP did not contain ${requested} ${mode} variants.`);
  return matches.slice(0, requested);
};

export const selectFlowArchiveMedia = (files, mode) => selectAllFlowArchiveMedia(files, mode, 1)[0];

export const selectRenderedFlowMedia = (media, variants = 1) => {
  const requested = Number(variants);
  if (!Number.isInteger(requested) || requested < 1 || requested > 4) throw new Error('Flow variants must be between 1 and 4.');
  if (media.length < requested) throw new Error(`Flow returned ${media.length} file${media.length === 1 ? '' : 's'} but ${requested} variants were requested.`);
  return media.slice(0, requested);
};

const visibleFlowMediaSources = async (page, selector, minWidth, minHeight) => page.locator(selector).evaluateAll((elements, limits) => [...new Set(elements.map(item => {
  const rect = item.getBoundingClientRect();
  const source = item.currentSrc || item.src || item.querySelector('source')?.src;
  return rect.width > limits.minWidth && rect.height > limits.minHeight ? source : null;
}).filter(Boolean))], { minWidth, minHeight });

const captureRenderedFlowImages = async (page, excludedSources = new Set()) => {
  const images = await page.locator('img').evaluateAll(async (imageElements, ignored) => {
    const candidates = imageElements.map(item => {
      const rect = item.getBoundingClientRect();
      return { src: item.currentSrc || item.src, area: rect.width * rect.height, visible: rect.width > 160 && rect.height > 160 };
    }).filter(item => item.visible && item.src && !item.src.includes('/asb/') && !ignored.includes(item.src)).sort((left, right) => right.area - left.area);
    const unique = [...new Map(candidates.map(item => [item.src, item])).values()];
    return (await Promise.all(unique.map(async item => {
      try {
        const response = await fetch(item.src);
        if (!response.ok) return null;
        const bytes = new Uint8Array(await response.arrayBuffer());
        return { contentType: response.headers.get('content-type') || '', bytes: Array.from(bytes) };
      } catch { return null; }
    }))).filter(Boolean);
  }, [...excludedSources]);
  return images.filter(image => image?.bytes?.length).map(image => {
    const extension = image.contentType.includes('jpeg') ? '.jpg' : image.contentType.includes('webp') ? '.webp' : '.png';
    return { bytes: new Uint8Array(image.bytes), suggestedFilename: `flow-render${extension}` };
  });
};

const normalizeMediaKey = (url = '') => {
  if (!url) return '';
  const clean = String(url).replace(/&amp;/g, '&').trim();
  const uuidMatch = clean.match(/flow-content\.google\/(?:video|image)\/([a-f0-9-]+)/i);
  if (uuidMatch) return uuidMatch[1].toLowerCase();
  try {
    const u = new URL(clean);
    return (u.origin + u.pathname).toLowerCase();
  } catch {
    return clean.split('?')[0].toLowerCase();
  }
};

const collectExistingFlowVideoKeys = async page => {
  const keys = await page.locator('video, img, flow-video-tile').evaluateAll(els => els.map(e => {
    const s1 = e.currentSrc || '';
    const s2 = e.src || '';
    const s3 = e.getAttribute('src') || '';
    const s4 = (e.querySelector && e.querySelector('img, video') && (e.querySelector('img, video').currentSrc || e.querySelector('img, video').src)) || '';
    return [s1, s2, s3, s4];
  }).flat().filter(Boolean).map(u => {
    const clean = String(u).replace(/&amp;/g, '&').trim();
    const keysForU = [clean];
    const uuidMatch = clean.match(/flow-content\.google\/(?:video|image)\/([a-f0-9-]+)/i);
    if (uuidMatch) keysForU.push(uuidMatch[1].toLowerCase());
    try {
      const parsed = new URL(clean);
      keysForU.push((parsed.origin + parsed.pathname).toLowerCase());
    } catch {
      keysForU.push(clean.split('?')[0].toLowerCase());
    }
    return keysForU;
  }).flat());
  return new Set(keys);
};

const captureRenderedFlowVideos = async (page, preExistingKeys = new Set(), requestedVariants = 1) => {
  const directCaptured = [];
  const tiles = page.locator('flow-video-tile');
  const tileCount = await tiles.count();

  // Ưu tiên quét các video trong flow-video-tile mới nhất (tối đa requestedVariants tile đầu tiên)
  if (tileCount > 0) {
    const checkLimit = Math.min(tileCount, requestedVariants);
    for (let i = 0; i < checkLimit; i++) {
      const tile = tiles.nth(i);
      const video = tile.locator('video').first();
      if (!await video.count() || !await video.isVisible().catch(() => false)) continue;

      const rawSrc = (await video.getAttribute('src')) || (await video.evaluate(e => e.currentSrc || e.src)) || '';
      if (!rawSrc) continue;
      const clean = rawSrc.replace(/&amp;/g, '&');
      if (clean.includes('/asb/') || !clean.includes('flow-content.google/video/')) continue;
      const key = normalizeMediaKey(clean);
      if (!key || preExistingKeys.has(key)) continue;

      const duration = await video.evaluate(e => e.duration).catch(() => 0);
      if (!duration || isNaN(duration) || duration <= 0) continue;

      if (directCaptured.some(d => d.key === key)) continue;

      try {
        const resp = await page.request.get(clean);
        if (resp.ok()) {
          const bytes = await resp.body();
          if (bytes.length > 50000) {
            directCaptured.push({ bytes: new Uint8Array(bytes), suggestedFilename: 'flow-render.mp4', key });
          }
        }
      } catch (_) {}
    }
    return directCaptured;
  }

  // Fallback: nếu giao diện không có thẻ <flow-video-tile>
  const videoElements = page.locator('video');
  const count = await videoElements.count();
  for (let i = 0; i < count; i++) {
    const el = videoElements.nth(i);
    const rawSrc = (await el.getAttribute('src')) || (await el.evaluate(e => e.currentSrc || e.src)) || '';
    if (!rawSrc) continue;
    const clean = rawSrc.replace(/&amp;/g, '&');
    if (clean.includes('/asb/') || !clean.includes('flow-content.google/video/')) continue;
    const key = normalizeMediaKey(clean);
    if (!key || preExistingKeys.has(key)) continue;
    const duration = await el.evaluate(e => e.duration).catch(() => 0);
    if (!duration || isNaN(duration) || duration <= 0) continue;
    if (directCaptured.some(d => d.key === key)) continue;
    try {
      const resp = await page.request.get(clean);
      if (resp.ok()) {
        const bytes = await resp.body();
        if (bytes.length > 50000) {
          directCaptured.push({ bytes: new Uint8Array(bytes), suggestedFilename: 'flow-render.mp4', key });
        }
      }
    } catch (_) {}
  }
  return directCaptured;
};

const hasVisibleRenderedVideo = async (page, preExistingKeys = new Set()) => {
  const newVideos = await captureRenderedFlowVideos(page, preExistingKeys).catch(() => []);
  return newVideos.length > 0;
};

export const checkNewlyRenderedFlowElement = async (page, mode, preExistingVideoKeys = new Set(), preExistingImages = new Set(), requestedVariants = 1) => {
  if (mode === 'video') {
    // Nếu có cdk-virtual-scroll-viewport (trang Flow thật), ưu tiên quét Batch 0 (batch mới nhất vừa tạo)
    let searchScope = page;
    try {
      const batch0 = page.locator('cdk-virtual-scroll-viewport div.cdk-virtual-scroll-content-wrapper > div > div').first();
      if (typeof batch0?.count === 'function' && await batch0.count().catch(() => 0) > 0) {
        const tileInBatch0 = batch0.locator('flow-video-tile').first();
        if (typeof tileInBatch0?.count === 'function' && await tileInBatch0.count().catch(() => 0) > 0) {
          await tileInBatch0.hover().catch(() => {});
        }
        searchScope = batch0;
      }
    } catch (_) {}

    const videos = searchScope.locator('video');
    const count = await videos.count().catch(() => 0);
    const newVideos = [];
    for (let i = 0; i < count; i++) {
      const el = videos.nth(i);
      const rawSrc = (await el.getAttribute('src')) || (await el.evaluate(e => e.currentSrc || e.src || (e.querySelector('source') && e.querySelector('source').src)).catch(() => '')) || '';
      if (!rawSrc) continue;
      const clean = rawSrc.replace(/&amp;/g, '&');
      if (!clean.includes('flow-content.google/video/') && !clean.includes('/asb/')) continue;
      const key = normalizeMediaKey(clean);
      const uuidMatch = clean.match(/flow-content\.google\/(?:video|image)\/([a-f0-9-]+)/i);
      const uuid = uuidMatch ? uuidMatch[1].toLowerCase() : null;
      if (!key || preExistingVideoKeys.has(key) || preExistingVideoKeys.has(clean) || (uuid && preExistingVideoKeys.has(uuid))) continue;
      if (newVideos.some(v => v.key === key)) continue;
      const ariaLabel = (await el.getAttribute('aria-label').catch(() => '')) || '';
      // Phải có dạng element video hoàn tất do Flow sinh
      const isFlowGeneratedVideo = !ariaLabel || /video|được tạo|generated/i.test(ariaLabel);
      if (!isFlowGeneratedVideo) continue;
      newVideos.push({ key, src: clean, ariaLabel });
    }
    const needed = Math.max(1, Number(requestedVariants) || 1);
    if (newVideos.length >= needed || (newVideos.length >= 1 && requestedVariants === 1)) {
      return { ready: true, count: newVideos.length, items: newVideos };
    }
    return { ready: false, count: newVideos.length, items: newVideos };
  } else {
    const images = page.locator('img, image');
    const count = await images.count().catch(() => 0);
    const newImages = [];
    for (let i = 0; i < count; i++) {
      const el = images.nth(i);
      const rawSrc = (await el.getAttribute('src')) || (await el.evaluate(e => e.currentSrc || e.src).catch(() => '')) || '';
      if (!rawSrc || rawSrc.includes('/asb/') || preExistingImages.has(rawSrc)) continue;
      const visible = await el.isVisible().catch(() => false);
      if (!visible) continue;
      const rect = await el.boundingBox().catch(() => null);
      if (rect && (rect.width < 120 || rect.height < 120)) continue;
      if (newImages.some(img => img.src === rawSrc)) continue;
      const ariaLabel = (await el.getAttribute('aria-label').catch(() => '')) || (await el.getAttribute('alt').catch(() => '')) || '';
      newImages.push({ src: rawSrc, ariaLabel });
    }
    const needed = Math.max(1, Number(requestedVariants) || 1);
    if (newImages.length >= needed || (newImages.length >= 1 && requestedVariants === 1)) {
      return { ready: true, count: newImages.length, items: newImages };
    }
    return { ready: false, count: newImages.length, items: newImages };
  }
};

export const flowWorkspaceUrl = (candidate = 'https://labs.google/fx/vi/tools/flow') => {
  const normalized = String(candidate).replace(/\/$/, '');
  if (!/^https:\/\/(?:labs\.google\/fx\/vi\/tools\/flow|flow\.google\.com(?:\/tools\/flow)?)(?:\/project\/[0-9a-f-]{36})?$/.test(normalized)) throw new Error('Flow URL must be a Flow workspace or project URL.');
  return normalized;
};

export const buildFlowJob = ({ mode, prompt, aspectRatio = '16:9', duration, model, variants = 1, videoInputMode, resolution }) => {
  if (!VALID_MODES.has(mode)) throw new Error('Flow mode must be image or video.');
  const cleanPrompt = String(prompt || '').trim();
  if (!cleanPrompt) throw new Error('Flow prompt is required.');
  if (!(mode === 'image' ? IMAGE_RATIOS : VIDEO_RATIOS).has(aspectRatio)) throw new Error('Unsupported Flow aspect ratio.');
  // Older canvas nodes stored select labels such as "8s"; accept both that
  // persisted form and the numeric option values emitted by the current UI.
  const numericDuration = duration === undefined ? undefined : Number(String(duration).trim().replace(/\s*s$/i, ''));
  if (mode === 'video' && !VIDEO_DURATIONS.has(numericDuration)) throw new Error('Unsupported Flow video duration.');
  const numericVariants = Number(variants);
  if (!Number.isInteger(numericVariants) || numericVariants < 1 || numericVariants > 4) throw new Error('Flow variants must be between 1 and 4.');
  const cleanModel = MODEL_ALIASES.get(String(model || '').trim()) || String(model || (mode === 'image' ? 'Nano Banana 2' : 'Omni Flash')).trim();
  if (!cleanModel) throw new Error('Flow model is required.');
  if (!(mode === 'image' ? IMAGE_MODELS : VIDEO_MODELS).has(cleanModel)) throw new Error(`Unsupported Flow ${mode} model.`);
  const inputMode = mode === 'video' ? (videoInputMode || 'frames') : undefined;
  if (inputMode !== undefined && !['frames', 'ingredients'].includes(inputMode)) throw new Error('Unsupported Flow video input mode.');

  let cleanResolution = undefined;
  if (mode === 'video') {
    if (resolution !== undefined && resolution !== null && String(resolution).trim()) {
      const resStr = String(resolution).trim().toLowerCase();
      if (!VIDEO_RESOLUTIONS.has(resStr)) throw new Error('Unsupported Flow video resolution.');
      cleanResolution = resStr;
    } else if (cleanModel === 'Omni 1.1 Flash') {
      cleanResolution = '360p';
    }
  }

  return {
    mode,
    prompt: cleanPrompt,
    aspectRatio,
    duration: mode === 'video' ? numericDuration : undefined,
    model: cleanModel,
    variants: numericVariants,
    videoInputMode: inputMode,
    resolution: cleanResolution,
  };
};

/** Resolve only files that Canvas itself saved in the active session. */
export const localPathForSessionAsset = (assetUrl, sessionId, publicDir) => {
  let pathname;
  try { pathname = new URL(assetUrl).pathname; } catch { throw new Error('Asset must have a saved Canvas URL.'); }
  const prefix = `/sessions/${encodeURIComponent(sessionId)}/`;
  if (!pathname.startsWith(prefix)) throw new Error('Asset belongs to a different session.');
  const [folder, filename, ...rest] = pathname.slice(prefix.length).split('/').map(decodeURIComponent);
  if (!['uploads', 'videos', 'flow'].includes(folder) || !filename || rest.length || basename(filename) !== filename) throw new Error('Invalid Canvas media path.');
  const root = resolve(publicDir, 'sessions', sessionId, folder);
  const fullPath = resolve(root, filename);
  return fullPath;
};

const findFirst = async (page, selectors) => {
  for (const selector of selectors) {
    const candidate = page.locator(selector).first();
    if (await candidate.count() && await candidate.isVisible().catch(() => false)) return candidate;
  }
  return null;
};

const waitForFirst = async (page, selectors, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const candidate = await findFirst(page, selectors);
    if (candidate) return candidate;
    await wait(500);
  }
  return null;
};

/** Tải media (ảnh/video) lên thư viện Flow qua menu Add Media và sự kiện FileChooser. */
export const uploadMediaToFlow = async (page, mediaPaths, log = () => {}) => {
  if (!mediaPaths.length) return;
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('Escape').catch(() => {});
    await wait(200);
  }

  // Check if static input[type="file"] already exists
  const existingInput = page.locator('input[type="file"]');
  if (await existingInput.count() && await existingInput.first().isVisible().catch(() => false)) {
    await existingInput.first().setInputFiles(mediaPaths);
    log(`đã tải ${mediaPaths.length} file qua input file có sẵn`);
    await waitForFlowUploadToSettle(page);
    return;
  }

  // Otherwise trigger Add Media button on top header
  const addMediaBtn = await waitForFirst(page, [
    'button[aria-label*="nội dung nghe nhìn" i]',
    'button[aria-label*="add media" i]',
    'button:has-text("add")',
  ], FLOW_PROMPT_WAIT_MS);
  if (!addMediaBtn) throw new Error('Không tìm thấy nút Thêm nội dung nghe nhìn trên Flow.');

  await addMediaBtn.click({ force: true });
  await settleFlowUi(page);

  const uploadItem = await waitForFirst(page, [
    '[role="menuitem"]:has-text("Tải lên")',
    '[role="menuitem"]:has-text("Upload")',
    '.mat-mdc-menu-item:has-text("Tải lên")',
  ], FLOW_PROMPT_WAIT_MS);
  if (!uploadItem) throw new Error('Không tìm thấy mục "Tải lên" trong menu của Flow.');

  const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 10_000 });
  await uploadItem.click();
  const chooser = await fileChooserPromise;
  await chooser.setFiles(mediaPaths);
  log(`đã nạp ${mediaPaths.length} file vào FileChooser của Flow, đang xử lý upload`);
  await waitForFlowUploadToSettle(page);
  await dismissFlowOverlays(page);
  log(`tải lên hoàn tất ${mediaPaths.length} file vào thư viện Flow`);
};

export const dismissFlowOverlays = async (page, maxAttempts = 3) => {
  for (let i = 0; i < maxAttempts; i++) {
    const backdrop = page.locator('.cdk-overlay-backdrop');
    if (await backdrop.count() && await backdrop.first().isVisible().catch(() => false)) {
      await page.keyboard.press('Escape').catch(() => {});
      await wait(300);
    } else {
      break;
    }
  }
};

/** Flow uploads asynchronously after setInputFiles; do not generate while it is still settling. */
const waitForFlowUploadToSettle = async page => {
  await wait(FLOW_UPLOAD_SETTLE_MS);
  const deadline = Date.now() + (FLOW_UPLOAD_MAX_WAIT_MS - FLOW_UPLOAD_SETTLE_MS);
  while (Date.now() < deadline) {
    const pending = await page.locator('[role="progressbar"], mat-progress-bar, .uploading, [aria-busy="true"]').count();
    if (!pending) break;
    await wait(500);
  }
};

/** Phase 2: choose the media already uploaded to Flow and attach it to the composer. */
export const attachUploadedMediaToFlowPrompt = async (page, mediaPaths, log = () => {}, frameSlotXpath) => {
  if (!mediaPaths.length) return;

  // New Google Flow: attach via ingredient button (.add-menu-trigger)
  const ingredientBtn = await waitForFirst(page, [
    'button.add-menu-trigger',
    'button[aria-label*="Thêm thành phần vào ô nhập" i]',
    'button[aria-label*="ingredient" i]',
  ], 4_000);

  if (ingredientBtn) {
    for (const mediaPath of mediaPaths) {
      const filename = basename(mediaPath);
      const nameWithoutExt = filename.slice(0, filename.lastIndexOf('.')) || filename;
      await ingredientBtn.click({ force: true });
      await wait(800);

      const options = page.locator('.cdk-overlay-pane button[role="option"], .cdk-overlay-pane flow-add-menu-asset-item');
      const count = await options.count();
      let attached = false;
      if (count) {
        const texts = await options.evaluateAll(els => els.map((e, idx) => ({
          idx,
          text: (e.innerText || '').toLowerCase().trim(),
          title: ((e.innerText || '').split('\n')[0] || '').toLowerCase().trim(),
        })));
        const match = texts.find(t => t.title === nameWithoutExt.toLowerCase() || t.title === filename.toLowerCase())
          || texts.find(t => t.text.includes(nameWithoutExt.toLowerCase()) || t.text.includes(filename.toLowerCase()));
        const targetIdx = match ? match.idx : 0;
        await options.nth(targetIdx).click({ force: true });
        attached = true;
        log(`đã đính kèm tham chiếu "${filename}" vào câu lệnh`);
      }
      await dismissFlowOverlays(page);
      await settleFlowUi(page);
    }
    await dismissFlowOverlays(page);
    return;
  }

  // Fallback: old dialog with search
  let dialog;
  if (frameSlotXpath) {
    const slot = await waitForFirst(page, [`xpath=${frameSlotXpath}`], FLOW_PROMPT_WAIT_MS);
    if (!slot) throw new Error('Flow Frame slot was not found.');
    await slot.click();
    await settleFlowUi(page);
    dialog = await waitForFirst(page, ['[role="dialog"]'], FLOW_PROMPT_WAIT_MS);
  } else {
    const composerButtons = page.locator('button[aria-haspopup="dialog"]');
    const triggers = await composerButtons.evaluateAll(elements => elements.map((element, index) => ({ index, text: (element.innerText || '').replace(/\s+/g, ' ').trim(), visible: element instanceof HTMLElement && !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length) })).filter(item => item.visible && item.text.includes('add_2')));
    if (triggers.length) await composerButtons.nth(triggers[0].index).click();
    else log('Flow attachment picker was not rendered; keeping the upload order already assigned to Frames');
    await settleFlowUi(page);
    dialog = await waitForFirst(page, ['[role="dialog"]'], FLOW_PROMPT_WAIT_MS);
  }
  if (!dialog) {
    log('Flow attachment picker was not rendered; keeping the upload order already assigned to Frames');
    return;
  }
  const search = await waitForFirst(dialog, ['input[aria-label*="Tìm"]', 'input[aria-label*="Search"]', 'input[type="search"]'], FLOW_PROMPT_WAIT_MS);
  if (!search) throw new Error('Flow media library search control was not found.');

  for (const mediaPath of mediaPaths) {
    const filename = basename(mediaPath);
    await search.fill(filename);
    await settleFlowUi(page);
    const deadline = Date.now() + FLOW_PROMPT_WAIT_MS;
    let option = null;
    while (Date.now() < deadline && !option) {
      const options = dialog.locator('[role="option"]');
      const matches = await options.evaluateAll((elements, target) => elements.map((element, index) => ({
        index,
        text: (element.innerText || '').replace(/\s+/g, ' ').trim(),
        visible: element instanceof HTMLElement && !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length),
      })).filter(item => item.visible && item.text.includes(target)), filename);
      if (matches.length) option = options.nth(matches[0].index);
      else await wait(250);
    }
    if (!option) throw new Error(`Flow uploaded media "${filename}" did not appear in the media library.`);
    await option.click();
    await settleFlowUi(page);
  }

  const attach = await waitForFlowPromptAttachControl(dialog);
  if (attach) await attach.click();
  else {
    log('Flow attachment action was already applied or did not remain visible; continuing to configuration');
    if (await dialog.isVisible().catch(() => false)) await page.keyboard.press('Escape').catch(() => {});
  }
  await settleFlowUi(page);
  log(`attached ${mediaPaths.length} uploaded media file(s) to the Flow prompt`);
};

const normalizeUiText = value => String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();

export const isFlowPromptAttachControl = value => {
  const text = normalizeUiText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return (text.includes('add') && text.includes('prompt')) || (text.includes('them') && text.includes('cau lenh'));
};

const findFlowPromptAttachControl = async dialog => {
  const controls = dialog.locator('button, [role="button"]');
  const matches = await controls.evaluateAll(elements => elements.map((element, index) => ({
    index,
    text: [element.innerText, element.getAttribute('aria-label'), element.getAttribute('title')].filter(Boolean).join(' '),
    visible: element instanceof HTMLElement && !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length),
  })).filter(item => item.visible && isFlowPromptAttachControl(item.text)));
  return matches.length ? controls.nth(matches[0].index) : null;
};

const waitForFlowPromptAttachControl = async (dialog, timeoutMs = FLOW_PROMPT_WAIT_MS) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const control = await findFlowPromptAttachControl(dialog);
    if (control) return control;
    await wait(250);
  }
  return null;
};
const settleFlowUi = () => wait(FLOW_UI_ACTION_DELAY_MS);

/** Select only a button whose own label matches a supported Flow option exactly. */
const selectByText = async (page, options) => {
  const expected = options.map(normalizeUiText);
  const buttons = page.locator('button');
  const matches = await buttons.evaluateAll((elements, names) => elements.map((element, index) => ({
    index,
    text: (element.innerText || element.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase(),
    visible: element instanceof HTMLElement && !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length),
  })).filter(item => item.visible && names.includes(item.text)), expected);
  if (!matches.length) return false;
  await buttons.nth(matches[0].index).click();
  return true;
};

const selectRequired = async (page, options, setting) => {
  if (!await selectByText(page, options)) throw new Error(`Flow ${setting} control was not found or did not expose the requested value.`);
};

const findVisibleButtonByEnding = async (page, labels, selector = 'button') => {
  const expected = labels.map(normalizeUiText);
  const buttons = page.locator(selector);
  const matches = await buttons.evaluateAll((elements, names) => elements.map((element, index) => ({
    index,
    text: (element.innerText || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase(),
    visible: element instanceof HTMLElement && !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length),
  })).filter(item => item.visible && names.some(name => item.text === name || item.text.endsWith(name))), expected);
  return matches.length ? buttons.nth(matches[0].index) : null;
};

const waitForVisibleButtonByEnding = async (page, labels, timeoutMs = FLOW_PROMPT_WAIT_MS) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const button = await findVisibleButtonByEnding(page, labels);
    if (button) return button;
    await wait(250);
  }
  return null;
};

const findVisibleButtonContaining = async (page, labels, selector = 'button') => {
  const expected = labels.map(normalizeUiText);
  const buttons = page.locator(selector);
  const matches = await buttons.evaluateAll((elements, names) => elements.map((element, index) => ({
    index,
    text: (element.innerText || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase(),
    visible: element instanceof HTMLElement && !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length),
  })).filter(item => item.visible && names.some(name => item.text.includes(name))), expected);
  return matches.length ? buttons.nth(matches[0].index) : null;
};

const isFlowSettingsOpen = async page => {
  return page.locator('.cdk-overlay-pane button[role="radio"]:has-text("Video"), .cdk-overlay-pane button[role="radio"]:has-text("Image"), .cdk-overlay-pane button[role="radio"]:has-text("Hình ảnh")').first().isVisible().catch(() => false);
};

const findFlowSettingsTrigger = async page => {
  const trigger = page.locator('button.settings-trigger-button, button[aria-label*="kích hoạt cài đặt" i], button[aria-label="Settings trigger"]').first();
  if (await trigger.count() && await trigger.isVisible().catch(() => false)) return trigger;

  const buttons = page.locator('button');
  const matches = await buttons.evaluateAll(elements => elements.map((element, index) => ({
    index,
    text: (element.innerText || '').replace(/\s+/g, ' ').trim(),
    visible: element instanceof HTMLElement && !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length),
  })).filter(item => item.visible && item.text.includes('crop_') && /x[1-4]/.test(item.text)));
  return matches.length ? buttons.nth(matches[0].index) : null;
};

const openFlowSettings = async page => {
  if (await isFlowSettingsOpen(page)) return;
  const trigger = await findFlowSettingsTrigger(page);
  if (!trigger) throw new Error('Flow settings summary was not found.');
  await trigger.click({ force: true });
  await settleFlowUi(page);
};

/** Frames slots are only actionable after the expanded settings panel is closed. */
const closeFlowSettings = async page => {
  if (!await isFlowSettingsOpen(page)) return;
  const trigger = await findFlowSettingsTrigger(page);
  if (trigger) {
    await trigger.click({ force: true }).catch(() => {});
    await settleFlowUi(page);
  }
  if (await isFlowSettingsOpen(page)) {
    await page.keyboard.press('Escape').catch(() => {});
    await settleFlowUi(page);
  }
};

const FLOW_TAB_SELECTORS = [
  '.cdk-overlay-pane button[role="radio"]',
  '.cdk-overlay-pane [role="radio"]',
  '.cdk-overlay-pane button[role="tab"]',
  '.cdk-overlay-pane [role="tab"]',
  '.cdk-overlay-pane button',
  'button[role="radio"]',
  '[role="radio"]',
];

const selectFlowTab = async (page, labels, setting) => {
  const deadline = Date.now() + FLOW_PROMPT_WAIT_MS;
  let tab = null;
  while (Date.now() < deadline && !tab) {
    // Flow's mode/aspect/duration pickers are not always <button role="tab">.
    // Sweep progressively wider selectors so a UI markup change still resolves.
    for (const selector of FLOW_TAB_SELECTORS) {
      tab = await findVisibleButtonByEnding(page, labels, selector);
      if (!tab) tab = await findVisibleButtonContaining(page, labels, selector);
      if (tab) break;
    }
    if (!tab) await wait(250);
  }
  if (!tab) {
    // Diagnostic dump: tell the operator what Flow actually renders around here,
    // instead of a bare "option was not found" message.
    const candidates = await page.locator('button, [role="tab"], [role="radio"], [role="button"], input[type="radio"] + label').evaluateAll((elements) => elements.map((element, index) => ({
      index,
      tag: element.tagName,
      role: element.getAttribute('role'),
      text: (element.innerText || element.getAttribute('aria-label') || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
    })).filter(item => item.text && /(image|video|hinh|hình|ảnh|pha|chọn|mode)/i.test(item.text)).slice(0, 8));
    throw new Error(`Flow ${setting} option was not found. Nearby controls: ${JSON.stringify(candidates)}`);
  }
  const selected = (await tab.getAttribute('aria-selected')) || (await tab.getAttribute('aria-checked'));
  if (selected === 'true') return;
  await tab.click();
  await settleFlowUi(page);
};

const findModelControl = async (page, log = () => {}) => {
  // The settings summary also contains the current model name. Only the actual
  // model dropdown has arrow_drop_down and aria-expanded=false.
  const knownModels = [...IMAGE_MODELS, ...VIDEO_MODELS].map(normalizeUiText);
  const deadline = Date.now() + FLOW_PROMPT_WAIT_MS;
  while (Date.now() < deadline) {
    const buttons = page.locator('button');
    const matches = await buttons.evaluateAll((elements, models) => elements.map((element, index) => ({
      index,
      text: (element.innerText || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase(),
      visible: element instanceof HTMLElement && !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length),
    })).filter(item => item.visible && item.text.includes('arrow_drop_down') && models.some(model => item.text.includes(model))), knownModels);
    if (matches.length) return buttons.nth(matches[0].index);
    await wait(250);
  }
  log('Flow model picker did not render before timeout; dumping nearby controls');
  const candidates = await page.locator('button, [role="combobox"], [role="listbox"], [role="option"]').evaluateAll((elements) => elements.map((element, index) => ({
    index,
    tag: element.tagName,
    role: element.getAttribute('role'),
    expanded: element.getAttribute('aria-expanded'),
    text: (element.innerText || element.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 80),
  })).filter(item => item.text && /(nano|imagen|veo|omni|model|banana|flash|fast|quality|lite)/i.test(item.text)).slice(0, 10));
  throw new Error(`Flow model control was not found. Nearby controls: ${JSON.stringify(candidates)}`);
};

const closeOpenFlowModelMenu = async page => {
  const knownModels = [...IMAGE_MODELS, ...VIDEO_MODELS].map(normalizeUiText);
  const buttons = page.locator('button[aria-expanded="true"]');
  const matches = await buttons.evaluateAll((elements, models) => elements.map((element, index) => ({
    index,
    text: (element.innerText || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase(),
    visible: element instanceof HTMLElement && !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length),
  })).filter(item => item.visible && item.text.includes('arrow_drop_down') && models.some(model => item.text.includes(model))), knownModels);
  if (matches.length) {
    await buttons.nth(matches[0].index).click({ force: true });
    await settleFlowUi(page);
  }
};

const configureFlowControls = async (page, job) => {
  await openFlowSettings(page);
  await closeOpenFlowModelMenu(page);
  await selectFlowTab(page, job.mode === 'video' ? ['Video'] : ['Hình ảnh', 'Image'], 'mode');
  if (job.mode === 'video') await selectFlowTab(page, job.videoInputMode === 'ingredients' ? ['Thành phần', 'Ingredients'] : ['Khung hình', 'Frames'], 'video input mode');
  await selectFlowTab(page, [job.aspectRatio], 'aspect ratio');
  const modelPicker = await findModelControl(page);
  const currentModel = normalizeUiText(await modelPicker.innerText().catch(() => ''));
  if (!currentModel.includes(normalizeUiText(job.model)) && !currentModel.endsWith(normalizeUiText(job.model))) {
    await modelPicker.click();
    await settleFlowUi(page);
    const model = await waitForVisibleButtonByEnding(page, [job.model]);
    if (!model) throw new Error(`Flow model "${job.model}" was not found in this account.`);
    await model.click();
    await settleFlowUi(page);
  }
  if (job.mode === 'video' && job.resolution && (job.model === 'Omni 1.1 Flash' || !VEO_MODELS.has(job.model))) {
    const resTab = await findVisibleButtonContaining(page, [job.resolution], '.cdk-overlay-pane button[role="radio"]');
    if (resTab) {
      const selected = (await resTab.getAttribute('aria-selected')) || (await resTab.getAttribute('aria-checked'));
      if (selected !== 'true') {
        await resTab.click();
        await settleFlowUi(page);
      }
    }
  }
  if (job.mode === 'video' && job.duration) await selectFlowTab(page, [`${job.duration} giây`, `${job.duration}s`, `${job.duration} s`], 'duration');
  await selectFlowTab(page, [`x${job.variants}`], 'variants');
};

/**
 * Runs inside the host process, not Codex. Chrome must already be started with
 * --remote-debugging-port and the Google account profile that is allowed to use Flow.
 */
export const runGoogleFlowJob = async ({ cdpUrl, workspaceUrl, job, mediaPaths = [], outputPath, queueDelayMs = FLOW_TASK_QUEUE_DELAY_MS, timeoutMs = 8 * 60_000, log = () => {} }) => {
  if (!cdpUrl) throw new Error('GOOGLE_FLOW_CDP_URL is not configured.');
  const flowUrl = flowWorkspaceUrl(workspaceUrl);
  const { chromium } = await import('playwright-core');
  const browser = await chromium.connectOverCDP(cdpUrl).catch(() => {
    // GTF: cổng CDP của Flow là 9334 (né 9222 theo yêu cầu, né 9333 của V1 Higgsfield).
    throw new Error(`Cannot reach Google Flow Chrome at ${cdpUrl}. Chạy MO_CHROME_GOOGLE_FLOW_9334.bat (profile đã đăng nhập Google) rồi thử lại.`);
  });
  const context = browser.contexts()[0];
  if (!context) throw new Error('Chrome CDP has no browser context.');

  // Tìm đúng tab Google Flow đang mở, tránh bắt nhầm tab extension hoặc accounts
  let page = context.pages().find(p => {
    const u = p.url() || '';
    return u.includes('labs.google') || u.includes('flow.google.com');
  });
  if (!page) {
    page = context.pages().find(p => !p.url().startsWith('chrome://') && !p.url().includes('accounts.google.com')) || context.pages()[0] || await context.newPage();
  }

  // Cấu hình CDP download behavior để Chrome phát sự kiện download và lưu trực tiếp không mở dialog Windows
  const cdpSession = await context.newCDPSession(page).catch(() => null);
  if (cdpSession) {
    const downloadDir = outputPath ? dirname(outputPath) : process.cwd();
    await cdpSession.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir,
      eventsEnabled: true,
    }).catch(() => {});
    await cdpSession.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir,
    }).catch(() => {});
  }

  const networkMedia = [];
  const preExistingVideoKeys = new Set();
  let generationSubmitted = false;
  const onResponse = async response => {
    try {
      if (!generationSubmitted || job.mode !== 'video') return;
      let status;
      try { status = response.status(); } catch { return; }
      if (status !== 200) return;
      const url = response.url() || '';
      // Chỉ chấp nhận video CDN thực sự từ Google Flow, tuyệt đối bỏ qua /asb/ và reference
      if (!url.includes('flow-content.google/video/') || url.includes('/asb/')) return;
      const key = normalizeMediaKey(url);
      if (!key || preExistingVideoKeys.has(key)) return;
      if (networkMedia.some(media => normalizeMediaKey(media.url) === key)) return;

      const headers = response.headers() || {};
      const contentType = headers['content-type'] || '';
      if (!contentType.startsWith('video/') && !/\.(mp4|webm|mov)(?:[?#]|$)/i.test(url)) return;

      const bytes = new Uint8Array(await response.body().catch(() => []));
      if (bytes.length < 50_000) return;

      const extension = contentType.includes('webm') ? '.webm' : contentType.includes('quicktime') ? '.mov' : '.mp4';
      networkMedia.push({ url, bytes, key, suggestedFilename: `flow-network-${networkMedia.length + 1}${extension}` });
      log(`captured Flow video response bytes=${bytes.length}, key=${key}`);
    } catch { /* A streamed response can be unavailable; DOM/download fallbacks still run. */ }
  };
  page.on('response', onResponse);
  try {
    // Đảm bảo đủ queueDelayMs (mặc định 10s) sau khi lượt trước tải xong trước khi ấn F5
    const targetDelayMs = typeof queueDelayMs === 'number' ? queueDelayMs : FLOW_TASK_QUEUE_DELAY_MS;
    const now = Date.now();
    const elapsedSinceLast = now - lastFlowJobFinishedAt;
    if (lastFlowJobFinishedAt > 0 && elapsedSinceLast < targetDelayMs) {
      const remainingMs = targetDelayMs - elapsedSinceLast;
      log(`đợi ${Math.ceil(remainingMs / 1000)}s (đủ 10s sau lượt trước tải xong) trước khi ấn F5 làm task tiếp theo...`);
      await wait(remainingMs);
    }

    log(`opening Flow project mode=${job.mode}`);
    const currentUrl = page.url() || '';
    const isFlowPage = currentUrl && (currentUrl.includes('labs.google') || currentUrl.includes('flow.google.com'));
    const normalizeUrl = u => String(u || '').replace(/\/$/, '').toLowerCase();
    const isSameProject = isFlowPage && (
      normalizeUrl(currentUrl) === normalizeUrl(flowUrl) ||
      !workspaceUrl ||
      flowUrl === flowWorkspaceUrl()
    );

    if (isSameProject) {
      log('ấn F5 làm mới giao diện Flow...');
      try {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 });
      } catch (err) {
        log(`reload F5 gặp lỗi (${err?.message || err}), điều hướng lại URL Flow...`);
        await page.goto(flowUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      }
    } else {
      await page.goto(flowUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    }
    await wait(2_000);

    // 1. Tải media tham chiếu lên thư viện Flow nếu có
    if (mediaPaths.length) {
      log(`tải ${mediaPaths.length} file tham chiếu lên thư viện Flow...`);
      await uploadMediaToFlow(page, mediaPaths, log);
    }

    // 2. Cấu hình cài đặt (mode, inputMode, ratio, model, duration, variants)
    await configureFlowControls(page, job);
    await closeFlowSettings(page);

    // 3. Nhập câu lệnh prompt vào ô nhập
    const promptBox = await waitForFirst(page, ['textarea', '[contenteditable="true"]'], FLOW_PROMPT_WAIT_MS);
    if (!promptBox) throw new Error('Flow prompt field was not found in the new project.');
    await promptBox.fill(job.prompt);
    await settleFlowUi(page);

    // 4. Gắn media tham chiếu vào câu lệnh (Ingredients) hoặc khung hình (Frames)
    if (mediaPaths.length) {
      if (job.mode === 'video' && job.videoInputMode === 'frames') {
        await attachUploadedMediaToFlowPrompt(page, [mediaPaths[0]], log, FLOW_FIRST_FRAME_SLOT_XPATH);
        if (mediaPaths[1]) await attachUploadedMediaToFlowPrompt(page, [mediaPaths[1]], log, FLOW_LAST_FRAME_SLOT_XPATH);
      } else {
        await attachUploadedMediaToFlowPrompt(page, mediaPaths, log);
      }
    }

    const flowCreateButton = await waitForFirst(page, [
      'button.generate-icon-button',
      'button[aria-label*="generation" i]',
      'button[aria-label*="tạo" i]',
      'button:has-text("arrow_forward")',
      'button:has-text("Generate")',
      'button:has-text("Tạo")',
      `xpath=${FLOW_CREATE_BUTTON_XPATH}`
    ], FLOW_PROMPT_WAIT_MS);
    if (!flowCreateButton) throw new Error('Flow Generate button was not found.');
    if (await flowCreateButton.isDisabled().catch(() => false)) {
      throw new Error('Nút Tạo bị vô hiệu hóa — vui lòng kiểm tra lại prompt hoặc tham chiếu.');
    }

    // Thu thập toàn bộ video và ảnh đã tồn tại trước khi bấm Tạo
    const existingVideoKeys = await collectExistingFlowVideoKeys(page);
    existingVideoKeys.forEach(k => preExistingVideoKeys.add(k));
    const preExistingImages = new Set(await visibleFlowMediaSources(page, 'img, image', 160, 160));

    await dismissFlowOverlays(page);
    log('submitting Flow generation');
    generationSubmitted = true;
    await settleFlowUi(page);
    await flowCreateButton.click({ force: true });
    log('đã bấm Tạo, đang chờ Google Flow khởi tạo tác vụ...');
    await wait(5_000);

    const maxWaitMs = job.mode === 'video' ? FLOW_VIDEO_GENERATION_MAX_WAIT_MS : FLOW_GENERATION_MAX_WAIT_MS;
    const deadline = Date.now() + maxWaitMs;
    const generationStartTime = Date.now();
    const minWaitMs = job.mode === 'video' ? 15_000 : 5_000;
    log(`đang chờ Google Flow tạo ${job.mode} hoàn tất...`);
    let lastLogTime = Date.now();
    let generationFinished = false;

    while (Date.now() < deadline) {
      // 1. Kiểm tra video/image mới tạo có dạng element hoàn tất xuất hiện chưa (sau thời gian tối thiểu)
      if (Date.now() - generationStartTime >= minWaitMs) {
        const detection = await checkNewlyRenderedFlowElement(page, job.mode, preExistingVideoKeys, preExistingImages, job.variants).catch(() => ({ ready: false }));
        if (detection.ready) {
          log(`phát hiện element ${job.mode} đã tạo xong (${detection.count} element), đợi 3s trước khi ấn nút tải về...`);
          await wait(FLOW_POST_GENERATION_WAIT_MS);
          generationFinished = true;
          break;
        }
      }

      if (Date.now() - lastLogTime >= 15_000) {
        const elapsed = Math.round((maxWaitMs - (deadline - Date.now())) / 1000);
        log(`Google Flow vẫn đang xử lý ${job.mode}... (${elapsed}s trôi qua)`);
        lastLogTime = Date.now();
      }

      await wait(2_000);
    }

    // Khi xuất hiện element đã tạo xong và đợi 3s: ấn vào xpath download button
    if (generationFinished) {
      log('tìm nút tải về của batch theo xpath...');
      const batchDownloadSelectors = [
        `xpath=${FLOW_BATCH_DOWNLOAD_BUTTON_XPATH}`,
        'flow-batch-info button',
        'cdk-virtual-scroll-viewport flow-batch-info button',
        'button[aria-label*="Tải xuống" i]',
        'button[aria-label*="Download" i]',
      ];
      const batchDownloadBtn = await waitForFirst(page, batchDownloadSelectors, 10_000);
      if (batchDownloadBtn) {
        log('bấm nút tải về theo xpath batch info và chờ browser download...');
        // Cấu hình lại CDP session download behavior trước khi click để đảm bảo Chrome phát sự kiện download
        const downloadSession = await context.newCDPSession(page).catch(() => null);
        if (downloadSession) {
          const downloadDir = outputPath ? dirname(outputPath) : process.cwd();
          await downloadSession.send('Browser.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadDir,
            eventsEnabled: true,
          }).catch(() => {});
          await downloadSession.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadDir,
          }).catch(() => {});
        }

        const downloadPromise = page.waitForEvent('download', { timeout: FLOW_DOWNLOAD_TIMEOUT_MS }).catch(err => {
          log(`chờ sự kiện download timeout hoặc lỗi: ${err?.message || err}`);
          return null;
        });
        await batchDownloadBtn.scrollIntoViewIfNeeded().catch(() => {});
        await batchDownloadBtn.click({ force: true });
        await settleFlowUi(page);

        // Kiểm tra nhanh sau 1.5s xem có xuất hiện menu con "Tải xuống" hay không (tránh chờ hết 60s timeout mới kiểm tra)
        const checkMenuPromise = wait(1_500).then(async () => {
          const menuItem = await waitForFirst(page, [
            '[role="menuitem"]:has-text("Tải xuống")',
            '[role="menuitem"]:has-text("Download")',
            '.mat-mdc-menu-item:has-text("Tải xuống")',
            '.mat-mdc-menu-item:has-text("Download")',
          ], 1_500).catch(() => null);
          if (menuItem) {
            log('phát hiện menu con tải về, bấm tiếp tục...');
            await menuItem.click({ force: true }).catch(() => {});
          }
        });

        const [download] = await Promise.all([downloadPromise, checkMenuPromise]);
        const targetDir = outputPath ? dirname(outputPath) : process.cwd();

        if (download) {
          const suggestedFilename = download.suggestedFilename() || 'flow-download';
          const directDownloadedPath = path.join(targetDir, suggestedFilename);
          await wait(1_000);

          if (fs.existsSync(directDownloadedPath) && fs.statSync(directDownloadedPath).size > 0) {
            log(`Chrome đã tải trực tiếp file về: ${suggestedFilename} (${directDownloadedPath})`);
            try {
              if (outputPath && directDownloadedPath !== outputPath) {
                fs.copyFileSync(directDownloadedPath, outputPath);
              }
            } catch (_) {}
            return { outputPath: directDownloadedPath, suggestedFilename };
          }

          try {
            await download.saveAs(outputPath);
            log(`đã lưu file qua download.saveAs: ${suggestedFilename} (${outputPath})`);
            return { outputPath, suggestedFilename };
          } catch (err) {
            const files = fs.readdirSync(targetDir).filter(f => !f.endsWith('.crdownload') && !f.endsWith('.download') && !f.startsWith('.'));
            if (files.length > 0) {
              const actualFile = files[0];
              const actualPath = path.join(targetDir, actualFile);
              log(`đã tìm thấy file tải về thành công trong thư mục: ${actualFile}`);
              try {
                if (outputPath && actualPath !== outputPath) {
                  fs.copyFileSync(actualPath, outputPath);
                }
              } catch (_) {}
              return { outputPath: actualPath, suggestedFilename: actualFile };
            }
            throw err;
          }
        }

        // Nếu download event không bắt được, kiểm tra file trực tiếp trong thư mục targetDir
        if (outputPath) {
          await wait(2_000);
          const files = fs.readdirSync(targetDir).filter(f => !f.endsWith('.crdownload') && !f.endsWith('.download') && !f.startsWith('.'));
          if (files.length > 0) {
            const actualFile = files[0];
            const actualPath = path.join(targetDir, actualFile);
            log(`đã nhận diện file tải về thành công từ Chrome: ${actualFile}`);
            return { outputPath: actualPath, suggestedFilename: actualFile };
          }
        }

        log('không nhận được sự kiện download từ batch button, chuyển sang cơ chế fallback...');
      } else {
        log('không tìm thấy nút tải về của batch theo xpath, chuyển sang cơ chế fallback...');
      }
    }

    // Phương án fallback nếu download event không kích hoạt
    if (job.mode === 'video') {
      const validNetwork = networkMedia.filter(m => !preExistingVideoKeys.has(m.key || normalizeMediaKey(m.url)));
      if (validNetwork.length >= job.variants) {
        const renderedMedia = selectRenderedFlowMedia(validNetwork, job.variants);
        log(`captured ${renderedMedia.length} Flow video variant(s) qua network fallback`);
        return { renderedMedia };
      }

      const directVideos = await captureRenderedFlowVideos(page, preExistingVideoKeys, job.variants).catch(() => []);
      if (directVideos.length >= job.variants) {
        const renderedMedia = selectRenderedFlowMedia(directVideos, job.variants);
        log(`captured ${renderedMedia.length} rendered Flow video variant(s) từ canvas fallback`);
        return { renderedMedia };
      }
    } else {
      const renderedMedia = selectRenderedFlowMedia(await captureRenderedFlowImages(page, preExistingImages), job.variants);
      if (renderedMedia.length) {
        log(`captured ${renderedMedia.length} rendered Flow image variant(s) qua image fallback`);
        return { renderedMedia };
      }
    }

    throw new Error(`Google Flow không hoàn tất tạo hoặc không tải được ${job.mode} sau ${Math.round(maxWaitMs / 1000)}s.`);
  } finally {
    page.off('response', onResponse);
    lastFlowJobFinishedAt = Date.now();
    // CDP owns the user’s Chrome; do not close it from Canvas.
    await browser.close();
  }
};
