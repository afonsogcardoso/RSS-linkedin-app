import { createHash } from "node:crypto";

import Parser from "rss-parser";

import { decodeHtmlEntities, firstSentence, stripHtml } from "@/lib/utils";

const RECENT_WINDOW_DAYS = 7;

type ParsedFeedItem = {
  guid?: string;
  title?: string;
  link?: string;
  pubDate?: string;
  content?: string;
  contentSnippet?: string;
  isoDate?: string;
  description?: string;
  summary?: string;
  enclosure?: {
    url?: string;
  };
  "content:encoded"?: string;
  "media:content"?: {
    $?: {
      url?: string;
    };
    url?: string;
  };
  "media:thumbnail"?: {
    $?: {
      url?: string;
    };
    url?: string;
  };
};

export type NormalizedAttachment = {
  type: "image" | "video" | "document";
  url: string | null;
  thumbnailUrl: string | null;
  title: string | null;
};

export type NormalizedPost = {
  id: string;
  title: string;
  description: string;
  content: string;
  link: string;
  pubDate: string;
  authorName: string | null;
  authorUrl: string | null;
  sharedByAuthorName: string | null;
  sharedByAuthorUrl: string | null;
  imageUrl: string | null;
  attachments: NormalizedAttachment[];
  isRecent: boolean;
};

export type FeedState =
  | {
      status: "ready";
      posts: NormalizedPost[];
      feedTitle: string;
      feedDescription: string;
      feedLink: string;
      feedUrl: string;
      lastBuildDate: string | null;
      error: null;
    }
  | {
      status: "error";
      posts: NormalizedPost[];
      feedTitle: string;
      feedDescription: string;
      feedLink: string;
      feedUrl: string;
      lastBuildDate: string | null;
      error: string;
    };

const parser = new Parser<Record<string, never>, ParsedFeedItem>({
  customFields: {
    item: [
      ["content:encoded", "content:encoded"],
      ["media:content", "media:content"],
      ["media:thumbnail", "media:thumbnail"]
    ]
  }
});

export async function loadFeed(): Promise<FeedState> {
  const feedUrl = process.env.RSS_FEED_URL?.trim() || "";

  if (!feedUrl) {
    return {
      status: "error",
      posts: [],
      feedTitle: "LinkedIn RSS Dashboard",
      feedDescription: "",
      feedLink: "",
      feedUrl: "",
      lastBuildDate: null,
      error:
        "RSS_FEED_URL is not configured. Set it in web/.env.local for local development or in Netlify environment variables."
    };
  }

  try {
    const response = await fetch(feedUrl, {
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8"
      },
      next: {
        revalidate: 900
      }
    });

    if (!response.ok) {
      throw new Error(`Feed request failed with status ${response.status}.`);
    }

    const xml = await response.text();
    const parsed = await parser.parseString(xml);
    const feedTitle = parsed.title?.trim() || "LinkedIn RSS Dashboard";
    const feedDescription = parsed.description?.trim() || "";
    const feedLink = parsed.link?.trim() || "";
    const lastBuildDate = readStringField(parsed, "lastBuildDate");

    const posts = (parsed.items || [])
      .map((item) => normalizePost(item, feedLink))
      .filter((post): post is NormalizedPost => Boolean(post))
      .sort((left, right) => Date.parse(right.pubDate) - Date.parse(left.pubDate));

    return {
      status: "ready",
      posts,
      feedTitle,
      feedDescription,
      feedLink,
      feedUrl,
      lastBuildDate,
      error: null
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error while loading the RSS feed.";

    return {
      status: "error",
      posts: [],
      feedTitle: "LinkedIn RSS Dashboard",
      feedDescription: "",
      feedLink: "",
      feedUrl,
      lastBuildDate: null,
      error: `Unable to load or parse the RSS feed. ${message}`
    };
  }
}

export function findPostById(posts: NormalizedPost[], id: string) {
  return posts.find((post) => post.id === id);
}

function normalizePost(item: ParsedFeedItem, fallbackLink: string) {
  const rawHtml =
    item["content:encoded"] ||
    item.content ||
    item.description ||
    item.summary ||
    item.contentSnippet ||
    "";
  const metadata = extractPostMetadata(rawHtml);
  const attachments = extractAttachments(item, rawHtml);
  const content = stripHtml(
    stripAttachmentFigures(stripPostMetadata(rawHtml))
      .replace(/<p>\s*<img[^>]*><\/p>/gi, "")
      .replace(
        /<p>\s*<em>LinkedIn did not expose a reliable publication timestamp[\s\S]*?<\/em>\s*<\/p>/gi,
        ""
      )
  );
  const link = normalizeUrl(item.link) || normalizeUrl(fallbackLink) || "#";
  const pubDate = normalizeDate(item.isoDate || item.pubDate) || new Date().toISOString();
  const title =
    item.title?.trim() ||
    firstSentence(content, "LinkedIn post");
  const description = buildDescription(content, title);
  const stableIdSource =
    item.guid?.trim() || `${link}:${pubDate}:${title}:${content.slice(0, 160)}`;
  const imageAttachment = attachments.find((attachment) => attachment.type === "image");
  const imageUrl =
    imageAttachment?.thumbnailUrl ||
    imageAttachment?.url ||
    extractLegacyImageUrl(item, rawHtml);

  if (!content && !title && !link) {
    return null;
  }

  return {
    id: buildPostId(stableIdSource),
    title,
    description,
    content: content || title || "No post text was available in the RSS item.",
    link,
    pubDate,
    authorName: metadata.authorName,
    authorUrl: metadata.authorUrl,
    sharedByAuthorName: metadata.sharedByAuthorName,
    sharedByAuthorUrl: metadata.sharedByAuthorUrl,
    imageUrl,
    attachments,
    isRecent: Date.now() - Date.parse(pubDate) <= RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000
  };
}

function buildDescription(content: string, title: string) {
  const normalized = content.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return title;
  }

  if (normalized.length <= 220) {
    return normalized;
  }

  return `${normalized.slice(0, 217).trimEnd()}...`;
}

function buildPostId(input: string) {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);
  const hash = createHash("sha1").update(input).digest("hex").slice(0, 8);

  return `${slug || "post"}-${hash}`;
}

function extractAttachments(item: ParsedFeedItem, rawHtml: string) {
  const structuredAttachments = extractStructuredAttachments(rawHtml);

  if (structuredAttachments.length > 0) {
    return structuredAttachments;
  }

  const legacyImageUrl = extractLegacyImageUrl(item, rawHtml);

  return legacyImageUrl
    ? [
        {
          type: "image" as const,
          url: legacyImageUrl,
          thumbnailUrl: legacyImageUrl,
          title: "LinkedIn post image"
        }
      ]
    : [];
}

function extractStructuredAttachments(rawHtml: string) {
  const figures =
    rawHtml.match(/<figure\b[^>]*data-linkedin-attachment-type=["'][^"']+["'][\s\S]*?<\/figure>/gi) ||
    [];
  const rawAttachments: Array<NormalizedAttachment | null> = figures.map((figureHtml) => {
      const type = readHtmlAttribute(figureHtml, "data-linkedin-attachment-type");

      if (type !== "image" && type !== "video" && type !== "document") {
        return null;
      }

      const attachmentType: NormalizedAttachment["type"] = type;

      const url = normalizeUrl(
        decodeHtmlEntities(readHtmlAttribute(figureHtml, "data-linkedin-attachment-url") || ""),
        { preserveSearch: true }
      );
      const thumbnailUrl = normalizeUrl(
        decodeHtmlEntities(
          readHtmlAttribute(figureHtml, "data-linkedin-attachment-thumbnail-url") || ""
        ),
        { preserveSearch: true }
      );
      const title = normalizeTextValue(
        decodeHtmlEntities(readHtmlAttribute(figureHtml, "data-linkedin-attachment-title") || "")
      );

      if (!url && !thumbnailUrl) {
        return null;
      }

      return {
        type: attachmentType,
        url: url || null,
        thumbnailUrl:
          thumbnailUrl || (attachmentType === "image" ? url || null : null),
        title
      };
    });
  const parsedAttachments = rawAttachments.filter(
    (attachment): attachment is NormalizedAttachment => attachment !== null
  );

  return dedupeAttachments(parsedAttachments);
}

function dedupeAttachments(attachments: NormalizedAttachment[]) {
  const attachmentMap = new Map<string, NormalizedAttachment>();

  for (const attachment of attachments) {
    const key = [
      attachment.type,
      attachment.url || "",
      attachment.thumbnailUrl || ""
    ].join("|");
    const existing = attachmentMap.get(key);

    attachmentMap.set(key, {
      ...attachment,
      title: normalizeTextValue(attachment.title || existing?.title || "")
    });
  }

  return Array.from(attachmentMap.values());
}

function extractLegacyImageUrl(item: ParsedFeedItem, rawHtml: string) {
  const mediaContent =
    item["media:content"]?.url || item["media:content"]?.$?.url || "";
  const mediaThumbnail =
    item["media:thumbnail"]?.url || item["media:thumbnail"]?.$?.url || "";
  const enclosureUrl = item.enclosure?.url || "";

  const directUrl = normalizeUrl(mediaContent || mediaThumbnail || enclosureUrl);

  if (directUrl) {
    return directUrl;
  }

  const match = rawHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
  return normalizeUrl(match?.[1] || "") || null;
}

function extractPostMetadata(rawHtml: string) {
  const metadataHtml =
    rawHtml.match(/<div\b[^>]*data-linkedin-post-meta=["']true["'][^>]*><\/div>/i)?.[0] || "";

  return {
    authorName: normalizeTextValue(
      decodeHtmlEntities(readHtmlAttribute(metadataHtml, "data-linkedin-author-name") || "")
    ),
    authorUrl: normalizeUrl(
      decodeHtmlEntities(readHtmlAttribute(metadataHtml, "data-linkedin-author-url") || "")
    ) || null,
    sharedByAuthorName: normalizeTextValue(
      decodeHtmlEntities(readHtmlAttribute(metadataHtml, "data-linkedin-shared-by-author-name") || "")
    ),
    sharedByAuthorUrl: normalizeUrl(
      decodeHtmlEntities(readHtmlAttribute(metadataHtml, "data-linkedin-shared-by-author-url") || "")
    ) || null
  };
}

function stripPostMetadata(rawHtml: string) {
  return rawHtml.replace(/<div\b[^>]*data-linkedin-post-meta=["']true["'][^>]*><\/div>/gi, "");
}

function stripAttachmentFigures(rawHtml: string) {
  return rawHtml.replace(
    /<figure\b[^>]*data-linkedin-attachment-type=["'][^"']+["'][\s\S]*?<\/figure>/gi,
    ""
  );
}

function readHtmlAttribute(html: string, attributeName: string) {
  const escapedAttributeName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`${escapedAttributeName}=["']([^"']*)["']`, "i"));
  return match?.[1] || null;
}

function normalizeUrl(input?: string, options: { preserveSearch?: boolean } = {}) {
  if (!input) {
    return "";
  }

  try {
    const parsed = new URL(input);
    parsed.hash = "";

    if (!options.preserveSearch && /linkedin\.com$/i.test(parsed.hostname)) {
      parsed.search = "";
    }

    return parsed.toString();
  } catch {
    return "";
  }
}

function normalizeDate(input?: string) {
  if (!input) {
    return "";
  }

  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function readStringField(source: object, key: string) {
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : null;
}

function normalizeTextValue(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || null;
}
