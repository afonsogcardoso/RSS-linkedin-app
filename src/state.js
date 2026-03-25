const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const EMPTY_STATE = {
  generatedAt: null,
  sourceUrl: null,
  items: []
};

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

function normalizeUrl(value) {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(String(value).trim());
    parsed.hash = "";

    if (/linkedin\.com$/i.test(parsed.hostname)) {
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

function sanitizeItem(item) {
  if (!item || typeof item.guid !== "string" || item.guid.trim() === "") {
    return null;
  }

  const normalizedPublishedAt = normalizeDate(item.publishedAt);
  const normalizedFirstSeenAt = normalizeDate(item.firstSeenAt) || normalizedPublishedAt;
  const normalizedLastSeenAt =
    normalizeDate(item.lastSeenAt) || normalizeDate(item.scrapedAt) || normalizedFirstSeenAt;

  return {
    guid: item.guid.trim(),
    title: pickPreferredString(item.title, null) || "LinkedIn post",
    description: pickPreferredString(item.description, null) || "",
    link: normalizeUrl(item.link) || normalizeUrl(item.postUrl) || null,
    postUrl: normalizeUrl(item.postUrl),
    imageUrl: normalizeUrl(item.imageUrl),
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

  return {
    guid: existingItem.guid,
    title: pickPreferredString(incomingItem.title, existingItem.title) || "LinkedIn post",
    description: pickPreferredString(incomingItem.description, existingItem.description) || "",
    link: incomingItem.link || existingItem.link || incomingItem.postUrl || existingItem.postUrl,
    postUrl: incomingItem.postUrl || existingItem.postUrl,
    imageUrl: incomingItem.imageUrl || existingItem.imageUrl,
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

  return Array.from(itemMap.values()).sort(compareItemsNewestFirst).slice(0, maxItems);
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
