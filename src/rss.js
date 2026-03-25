function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapCdata(value) {
  return `<![CDATA[${String(value).replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function buildItemTitle(text, fallbackTitle) {
  const normalizedText = String(text || "").replace(/\s+/g, " ").trim();

  if (!normalizedText) {
    return `${fallbackTitle} update`;
  }

  const firstSentence = normalizedText.split(/(?<=[.!?])\s+/)[0];
  return truncate(firstSentence || normalizedText, 90);
}

function buildItemDescription(item) {
  const fragments = [];

  if (item.description) {
    fragments.push(
      `<p>${escapeXml(item.description).replace(/\n/g, "<br/>")}</p>`
    );
  }

  if (item.imageUrl) {
    fragments.push(
      `<p><img src="${escapeXml(item.imageUrl)}" alt="LinkedIn post image" /></p>`
    );
  }

  if (item.usedFallbackDate) {
    fragments.push(
      "<p><em>LinkedIn did not expose a reliable publication timestamp on the page, so pubDate reflects the first successful scrape time.</em></p>"
    );
  }

  return fragments.join("");
}

function buildRssXml({ title, link, description, items, generatedAt }) {
  const safeTitle = escapeXml(title);
  const safeLink = escapeXml(link);
  const safeDescription = escapeXml(description);
  const lastBuildDate = new Date(generatedAt || Date.now()).toUTCString();

  const itemsXml = items
    .map((item) => {
      const guid = item.guid || item.link;
      const isPermaLink = /^https?:\/\//i.test(guid);
      const itemTitle = escapeXml(item.title || "LinkedIn post");
      const itemLink = escapeXml(item.link || link);
      const itemGuid = escapeXml(guid);
      const itemPubDate = new Date(item.publishedAt || generatedAt || Date.now()).toUTCString();
      const itemDescription = wrapCdata(buildItemDescription(item));

      return [
        "    <item>",
        `      <title>${itemTitle}</title>`,
        `      <link>${itemLink}</link>`,
        `      <description>${itemDescription}</description>`,
        `      <guid isPermaLink="${isPermaLink ? "true" : "false"}">${itemGuid}</guid>`,
        `      <pubDate>${escapeXml(itemPubDate)}</pubDate>`,
        "    </item>"
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<rss version=\"2.0\">",
    "  <channel>",
    `    <title>${safeTitle}</title>`,
    `    <link>${safeLink}</link>`,
    `    <description>${safeDescription}</description>`,
    `    <lastBuildDate>${escapeXml(lastBuildDate)}</lastBuildDate>`,
    itemsXml,
    "  </channel>",
    "</rss>",
    ""
  ].join("\n");
}

module.exports = {
  buildItemTitle,
  buildRssXml
};
