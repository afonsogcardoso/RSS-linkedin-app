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
  const attachments =
    Array.isArray(item.attachments) && item.attachments.length > 0
      ? item.attachments
      : item.imageUrl
        ? [
            {
              type: "image",
              url: item.imageUrl,
              thumbnailUrl: item.imageUrl,
              title: "LinkedIn post image"
            }
          ]
        : [];

  const metadataAttributes = [
    'data-linkedin-post-meta="true"',
    item.authorName
      ? `data-linkedin-author-name="${escapeXml(item.authorName)}"`
      : "",
    item.authorUrl
      ? `data-linkedin-author-url="${escapeXml(item.authorUrl)}"`
      : "",
    item.sharedByAuthorName
      ? `data-linkedin-shared-by-author-name="${escapeXml(item.sharedByAuthorName)}"`
      : "",
    item.sharedByAuthorUrl
      ? `data-linkedin-shared-by-author-url="${escapeXml(item.sharedByAuthorUrl)}"`
      : ""
  ]
    .filter(Boolean)
    .join(" ");

  fragments.push(`<div ${metadataAttributes}></div>`);

  if (item.description) {
    fragments.push(
      `<p>${escapeXml(item.description).replace(/\n/g, "<br/>")}</p>`
    );
  }

  for (const attachment of attachments) {
    const title = attachment.title || `LinkedIn ${attachment.type} attachment`;
    const figureAttributes = [
      `data-linkedin-attachment-type="${escapeXml(attachment.type)}"`,
      attachment.url
        ? `data-linkedin-attachment-url="${escapeXml(attachment.url)}"`
        : "",
      attachment.thumbnailUrl
        ? `data-linkedin-attachment-thumbnail-url="${escapeXml(attachment.thumbnailUrl)}"`
        : "",
      attachment.title
        ? `data-linkedin-attachment-title="${escapeXml(attachment.title)}"`
        : ""
    ]
      .filter(Boolean)
      .join(" ");
    const figureFragments = [];

    if (attachment.thumbnailUrl) {
      figureFragments.push(
        `<img src="${escapeXml(attachment.thumbnailUrl)}" alt="${escapeXml(title)}" />`
      );
    }

    if (attachment.type !== "image" && attachment.url) {
      figureFragments.push(
        `<p><a href="${escapeXml(attachment.url)}">${escapeXml(title)}</a></p>`
      );
    }

    if (figureFragments.length > 0) {
      fragments.push(`<figure ${figureAttributes}>${figureFragments.join("")}</figure>`);
    }
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
      const guid = item.guid || item.postUrl || item.link;
      const isPermaLink = /^https?:\/\//i.test(guid);
      const itemTitle = escapeXml(item.title || "LinkedIn post");
      const itemLink = escapeXml(item.postUrl || item.link || link);
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
