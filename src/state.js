const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const EMPTY_STATE = {
  generatedAt: null,
  sourceUrl: null,
  items: []
};
const SUPPORTED_ATTACHMENT_TYPES = new Set(["image", "video", "document"]);
const FALLBACK_DUPLICATE_WINDOW_MS = 48 * 60 * 60 * 1000;
const MEDIA_COLLISION_WINDOW_MS = 6 * 60 * 60 * 1000;

function normalizeText(value) {
  if (!value) {
    return "";
  }

  return String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeUrl(value, options = {}) {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(String(value).trim());
    parsed.hash = "";

    if (!options.preserveSearch && /linkedin\.com$/i.test(parsed.hostname)) {
      parsed.search = "";
    }

    return parsed.toString();
  } catch (error) {
    return null;
  }
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function pickPreferredString(primary, fallback) {
  const normalizedPrimary = normalizeText(primary);
  const normalizedFallback = normalizeText(fallback);

  if (!normalizedPrimary) {
    return normalizedFallback || null;
  }

  if (!normalizedFallback) {
    return normalizedPrimary;
  }

  return normalizedPrimary.length >= normalizedFallback.length ? normalizedPrimary : normalizedFallback;
}

function sanitizeAttachment(attachment) {
  if (!attachment || typeof attachment.type !== "string") {
    return null;
  }

  const type = attachment.type.trim().toLowerCase();

  if (!SUPPORTED_ATTACHMENT_TYPES.has(type)) {
    return null;
  }

  const url = normalizeUrl(attachment.url, { preserveSearch: true });
  const thumbnailUrl = normalizeUrl(attachment.thumbnailUrl, { preserveSearch: true });
  const title = pickPreferredString(attachment.title, null);

  if (!url && !thumbnailUrl) {
    return null;
  }

  return {
    type,
    url,
    thumbnailUrl: thumbnailUrl || (type === "image" ? url : null),
    title
  };
}

function mergeAttachments(existingAttachments, incomingAttachments) {
  const attachmentMap = new Map();

  for (const attachment of [...(existingAttachments || []), ...(incomingAttachments || [])]) {
    const sanitized = sanitizeAttachment(attachment);

    if (!sanitized) {
      continue;
    }

    const key = [
      sanitized.type,
      sanitized.url || "",
      sanitized.thumbnailUrl || ""
    ].join("|");
    const existing = attachmentMap.get(key);

    attachmentMap.set(
      key,
      existing
        ? {
            ...existing,
            title: pickPreferredString(sanitized.title, existing.title)
          }
        : sanitized
    );
  }

  return Array.from(attachmentMap.values());
}

function pickPrimaryImageUrl(imageUrl, attachments) {
  const normalizedImageUrl = normalizeUrl(imageUrl, { preserveSearch: true });

  if (normalizedImageUrl) {
    return normalizedImageUrl;
  }

  const imageAttachment = (attachments || []).find((attachment) => attachment.type === "image");
  return imageAttachment?.thumbnailUrl || imageAttachment?.url || null;
}

function sanitizeItem(item) {
  if (!item || typeof item.guid !== "string" || item.guid.trim() === "") {
    return null;
  }

  const normalizedPublishedAt = normalizeDate(item.publishedAt);
  const normalizedFirstSeenAt = normalizeDate(item.firstSeenAt) || normalizedPublishedAt;
  const normalizedLastSeenAt =
    normalizeDate(item.lastSeenAt) || normalizeDate(item.scrapedAt) || normalizedFirstSeenAt;
  const attachments = mergeAttachments([], item.attachments);

  return {
    guid: item.guid.trim(),
    title: pickPreferredString(item.title, null) || "LinkedIn post",
    description: pickPreferredString(item.description, null) || "",
    link: normalizeUrl(item.postUrl) || normalizeUrl(item.link) || null,
    postUrl: normalizeUrl(item.postUrl),
    imageUrl: pickPrimaryImageUrl(item.imageUrl, attachments),
    attachments,
    publishedAt: normalizedPublishedAt || normalizedFirstSeenAt || new Date(0).toISOString(),
    usedFallbackDate: item.usedFallbackDate !== false,
    sourceUrl: normalizeUrl(item.sourceUrl),
    firstSeenAt: normalizedFirstSeenAt || new Date(0).toISOString(),
    lastSeenAt: normalizedLastSeenAt || normalizedFirstSeenAt || new Date(0).toISOString(),
    scrapedAt: normalizeDate(item.scrapedAt) || normalizedLastSeenAt || normalizedFirstSeenAt,
    sortRank: Number.isInteger(item.sortRank) ? item.sortRank : Number.MAX_SAFE_INTEGER
  };
}

function createStableGuid({ postUrl, text, imageUrl, sourceUrl }) {
  const normalizedPostUrl = normalizeUrl(postUrl);

  if (normalizedPostUrl) {
    return normalizedPostUrl;
  }

  const hash = crypto
    .createHash("sha1")
    .update(
      [
        normalizeUrl(sourceUrl) || "",
        normalizeText(text),
        normalizeUrl(imageUrl) || ""
      ].join("\n")
    )
    .digest("hex");

  return `urn:linkedin-rss:${hash}`;
}

function mergeTwoItems(existing, incoming) {
  const existingItem = sanitizeItem(existing);
  const incomingItem = sanitizeItem(incoming);

  if (!existingItem) {
    return incomingItem;
  }

  if (!incomingItem) {
    return existingItem;
  }

  const shouldPromoteExactDate =
    incomingItem.usedFallbackDate === false &&
    (existingItem.usedFallbackDate !== false || !existingItem.publishedAt);

  const publishedAt = shouldPromoteExactDate
    ? incomingItem.publishedAt
    : existingItem.publishedAt || incomingItem.publishedAt;

  const usedFallbackDate = shouldPromoteExactDate
    ? false
    : existingItem.usedFallbackDate && incomingItem.usedFallbackDate;
  const attachments = mergeAttachments(existingItem.attachments, incomingItem.attachments);

  return {
    guid: existingItem.guid,
    title: pickPreferredString(incomingItem.title, existingItem.title) || "LinkedIn post",
    description: pickPreferredString(incomingItem.description, existingItem.description) || "",
    link: incomingItem.postUrl || existingItem.postUrl || incomingItem.link || existingItem.link,
    postUrl: incomingItem.postUrl || existingItem.postUrl,
    imageUrl: pickPrimaryImageUrl(incomingItem.imageUrl || existingItem.imageUrl, attachments),
    attachments,
    publishedAt,
    usedFallbackDate,
    sourceUrl: incomingItem.sourceUrl || existingItem.sourceUrl,
    firstSeenAt: existingItem.firstSeenAt || incomingItem.firstSeenAt || publishedAt,
    lastSeenAt: incomingItem.scrapedAt || incomingItem.lastSeenAt || existingItem.lastSeenAt,
    scrapedAt: incomingItem.scrapedAt || existingItem.scrapedAt || existingItem.lastSeenAt,
    sortRank: Math.min(existingItem.sortRank, incomingItem.sortRank)
  };
}

function compareItemsNewestFirst(left, right) {
  const leftPublishedAt = new Date(left.publishedAt).getTime();
  const rightPublishedAt = new Date(right.publishedAt).getTime();

  if (rightPublishedAt !== leftPublishedAt) {
    return rightPublishedAt - leftPublishedAt;
  }

  const leftFirstSeenAt = new Date(left.firstSeenAt).getTime();
  const rightFirstSeenAt = new Date(right.firstSeenAt).getTime();

  if (rightFirstSeenAt !== leftFirstSeenAt) {
    return rightFirstSeenAt - leftFirstSeenAt;
  }

  if (left.sortRank !== right.sortRank) {
    return left.sortRank - right.sortRank;
  }

  return left.guid.localeCompare(right.guid);
}

function buildContentKey(item) {
  const description = normalizeText(item.description || item.title || "");

  if (description.length < 80) {
    return null;
  }

  return [
    normalizeUrl(item.sourceUrl) || "",
    description.replace(/\n+/g, "\n").replace(/\s*…more$/i, "").trim()
  ].join("\n");
}

function extractImageUrls(item) {
  const urls = new Set();

  if (normalizeUrl(item.imageUrl, { preserveSearch: true })) {
    urls.add(normalizeUrl(item.imageUrl, { preserveSearch: true }));
  }

  for (const attachment of item.attachments || []) {
    if (attachment.type !== "image") {
      continue;
    }

    const imageUrl = normalizeUrl(attachment.url, { preserveSearch: true });
    const thumbnailUrl = normalizeUrl(attachment.thumbnailUrl, { preserveSearch: true });

    if (imageUrl) {
      urls.add(imageUrl);
    }

    if (thumbnailUrl) {
      urls.add(thumbnailUrl);
    }
  }

  return urls;
}

function hasSharedImage(left, right) {
  const leftImages = extractImageUrls(left);
  const rightImages = extractImageUrls(right);

  if (leftImages.size === 0 || rightImages.size === 0) {
    return false;
  }

  for (const imageUrl of leftImages) {
    if (rightImages.has(imageUrl)) {
      return true;
    }
  }

  return false;
}

function isLowConfidenceMediaItem(item) {
  const link = normalizeUrl(item.link);
  const sourceUrl = normalizeUrl(item.sourceUrl);
  const attachmentTypes = new Set((item.attachments || []).map((attachment) => attachment.type));

  return (
    !normalizeUrl(item.postUrl) &&
    Boolean(link) &&
    Boolean(sourceUrl) &&
    link === sourceUrl &&
    item.usedFallbackDate === true &&
    attachmentTypes.size === 1 &&
    attachmentTypes.has("image")
  );
}

function isWithinWindow(left, right, windowMs) {
  const leftTime = new Date(left.firstSeenAt || left.publishedAt).getTime();
  const rightTime = new Date(right.firstSeenAt || right.publishedAt).getTime();

  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && Math.abs(leftTime - rightTime) <= windowMs;
}

function areLikelyDuplicateItems(left, right) {
  const leftPostUrl = normalizeUrl(left.postUrl);
  const rightPostUrl = normalizeUrl(right.postUrl);

  if (leftPostUrl && rightPostUrl && leftPostUrl === rightPostUrl) {
    return true;
  }

  const leftContentKey = buildContentKey(left);
  const rightContentKey = buildContentKey(right);

  if (
    leftContentKey &&
    leftContentKey === rightContentKey &&
    left.usedFallbackDate === true &&
    right.usedFallbackDate === true &&
    isWithinWindow(left, right, FALLBACK_DUPLICATE_WINDOW_MS)
  ) {
    return true;
  }

  return (
    isWithinWindow(left, right, MEDIA_COLLISION_WINDOW_MS) &&
    hasSharedImage(left, right) &&
    (isLowConfidenceMediaItem(left) || isLowConfidenceMediaItem(right))
  );
}

function collapseLikelyDuplicates(items) {
  let currentItems = [...items].sort(compareItemsNewestFirst);

  while (true) {
    const collapsed = [];

    for (const item of currentItems) {
      const existingIndex = collapsed.findIndex((candidate) => areLikelyDuplicateItems(candidate, item));

      if (existingIndex === -1) {
        collapsed.push(item);
        continue;
      }

      collapsed[existingIndex] = mergeTwoItems(collapsed[existingIndex], item);
    }

    const nextItems = collapsed.sort(compareItemsNewestFirst);

    if (nextItems.length === currentItems.length) {
      return nextItems;
    }

    currentItems = nextItems;
  }
}

function mergeFeedItems(previousItems, incomingItems, maxItems) {
  const itemMap = new Map();

  for (const item of previousItems || []) {
    const sanitized = sanitizeItem(item);

    if (sanitized) {
      itemMap.set(sanitized.guid, sanitized);
    }
  }

  for (const item of incomingItems || []) {
    const sanitizedIncoming = sanitizeItem(item);

    if (!sanitizedIncoming) {
      continue;
    }

    const existing = itemMap.get(sanitizedIncoming.guid);
    itemMap.set(sanitizedIncoming.guid, mergeTwoItems(existing, sanitizedIncoming));
  }

  return collapseLikelyDuplicates(Array.from(itemMap.values())).slice(0, maxItems);
}

async function loadState(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);

    return {
      generatedAt: normalizeDate(parsed.generatedAt),
      sourceUrl: normalizeUrl(parsed.sourceUrl),
      items: Array.isArray(parsed.items)
        ? parsed.items.map((item) => sanitizeItem(item)).filter(Boolean)
        : []
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { ...EMPTY_STATE, items: [] };
    }

    if (error instanceof SyntaxError) {
      throw new Error(`State file is not valid JSON: ${filePath}`);
    }

    throw error;
  }
}

async function saveState(filePath, state) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

module.exports = {
  createStableGuid,
  loadState,
  mergeFeedItems,
  normalizeDate,
  normalizeText,
  normalizeUrl,
  saveState
};
