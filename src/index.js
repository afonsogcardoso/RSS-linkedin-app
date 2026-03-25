const fs = require("fs/promises");
const path = require("path");
const { loadConfig } = require("./config");
const { buildItemTitle, buildRssXml } = require("./rss");
const {
  createStableGuid,
  loadState,
  mergeFeedItems,
  normalizeDate,
  normalizeText,
  normalizeUrl,
  saveState
} = require("./state");
const { scrapeLinkedInPosts } = require("./scrape");

function buildNormalizedItem(rawItem, config, scrapedAt, sortRank) {
  const text = normalizeText(rawItem.text);
  const postUrl = normalizeUrl(rawItem.postUrl);
  const imageUrl = normalizeUrl(rawItem.imageUrl);
  const exactPublishedAt = normalizeDate(rawItem.publishedAt);

  if (!text && !postUrl && !imageUrl) {
    return null;
  }

  return {
    guid: createStableGuid({
      postUrl,
      text,
      imageUrl,
      sourceUrl: config.linkedinCompanyUrl
    }),
    title: buildItemTitle(text, config.feedTitle),
    description: text || "LinkedIn post with media.",
    link: postUrl || config.linkedinCompanyUrl,
    postUrl,
    imageUrl,
    publishedAt: exactPublishedAt || scrapedAt,
    usedFallbackDate: !exactPublishedAt,
    sourceUrl: config.linkedinCompanyUrl,
    scrapedAt,
    sortRank
  };
}

async function writeOutput(filePath, contents) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents, "utf8");
}

async function main() {
  const config = loadConfig();
  const scrapedAt = new Date().toISOString();
  const previousState = await loadState(config.stateFile);

  console.log(`[build] Source URL: ${config.linkedinCompanyUrl}`);
  console.log(`[build] Existing state items: ${previousState.items.length}`);

  const rawItems = await scrapeLinkedInPosts(config);
  const normalizedItems = rawItems
    .map((item, index) => buildNormalizedItem(item, config, scrapedAt, index))
    .filter(Boolean);

  console.log(`[build] Normalized items: ${normalizedItems.length}`);

  if (normalizedItems.length === 0) {
    throw new Error(
      "Scrape produced zero items. Refusing to overwrite public/feed.xml or data/feed.json with empty output."
    );
  }

  const mergedItems = mergeFeedItems(previousState.items, normalizedItems, config.maxItems);
  const nextState = {
    generatedAt: scrapedAt,
    sourceUrl: config.linkedinCompanyUrl,
    items: mergedItems
  };
  const rssXml = buildRssXml({
    title: config.feedTitle,
    link: config.linkedinCompanyUrl,
    description: config.feedDescription,
    items: mergedItems,
    generatedAt: scrapedAt
  });

  await saveState(config.stateFile, nextState);
  await writeOutput(config.outputFile, rssXml);

  console.log(`[build] Saved state to ${config.stateFile}`);
  console.log(`[build] Wrote ${mergedItems.length} items to ${config.outputFile}`);
}

main().catch((error) => {
  console.error(`[build] ${error.message}`);
  process.exitCode = 1;
});
