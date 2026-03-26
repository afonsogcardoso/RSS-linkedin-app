const { chromium } = require("playwright");
const { loadConfig } = require("./config");

async function autoScroll(page, config) {
  let previousHeight = 0;
  let stagnantPasses = 0;

  for (let index = 0; index < config.scrollCount; index += 1) {
    const beforeHeight = await page.evaluate(() => document.body.scrollHeight);

    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight * 0.85);
    });

    await page.waitForTimeout(config.scrollDelayMs);

    const afterHeight = await page.evaluate(() => document.body.scrollHeight);
    console.log(`[scrape] Scroll ${index + 1}/${config.scrollCount}: ${beforeHeight} -> ${afterHeight}`);

    if (afterHeight <= beforeHeight && afterHeight <= previousHeight) {
      stagnantPasses += 1;
    } else {
      stagnantPasses = 0;
    }

    previousHeight = afterHeight;

    if (stagnantPasses >= 2) {
      console.log("[scrape] Page height stopped growing; ending scroll loop early.");
      break;
    }
  }
}

function isLoginPage(page) {
  const url = page.url();
  return /linkedin\.com\/(?:uas\/login|login)/i.test(url);
}

async function openBestAvailablePage(page, config) {
  const candidateUrls = [
    config.linkedinPublicCompanyUrl,
    config.linkedinPostsUrl
  ];

  let lastError = null;

  for (const targetUrl of candidateUrls) {
    try {
      console.log(`[scrape] Opening ${targetUrl}`);

      await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: config.scrapeTimeoutMs
      });

      await page.waitForLoadState("networkidle", {
        timeout: Math.min(config.scrapeTimeoutMs, 15000)
      }).catch(() => {
        console.log("[scrape] networkidle did not settle in time; continuing.");
      });

      if (config.pageLoadDelayMs > 0) {
        await page.waitForTimeout(config.pageLoadDelayMs);
      }

      console.log(`[scrape] Page URL: ${page.url()}`);
      console.log(`[scrape] Page title: ${await page.title()}`);

      if (isLoginPage(page)) {
        console.log("[scrape] LinkedIn redirected this candidate to the login page.");
        continue;
      }

      return {
        pageUrl: page.url(),
        requestedUrl: targetUrl
      };
    } catch (error) {
      lastError = error;
      console.log(`[scrape] Candidate failed: ${targetUrl} -> ${error.message}`);
    }
  }

  if (isLoginPage(page)) {
    throw new Error(
      "LinkedIn redirected all candidate company URLs to the login page. This company page is not guest-accessible right now."
    );
  }

  throw lastError || new Error("Unable to open a guest-accessible LinkedIn company page.");
}

async function extractRawPosts(page, config) {
  return page.evaluate(({ candidateLimit }) => {
    const MAX_TEXT_LENGTH = 4000;
    const POST_URL_PATTERN = /linkedin\.com\/.*(\/posts\/|\/feed\/update\/urn:li:activity:)/i;
    const DOCUMENT_URL_PATTERN = /\.(pdf|pptx?|docx?|xlsx?)(?:$|[?#])/i;
    const LINKEDIN_DOCUMENT_URL_PATTERN = /linkedin\.com\/.*document/i;
    const AUTHOR_PROFILE_URL_PATTERN = /linkedin\.com\/(?:company|in|school|showcase)\//i;
    const DOCUMENT_HINT_PATTERN =
      /\b(pdf|document|deck|slides|presentation|whitepaper|brochure|guide|one-pager|ebook|case study)\b/i;
    const DOCUMENT_PAGE_HINT_PATTERN = /\b\d+\s+pages?\b/i;
    const selectorCandidates = [
      "div[data-id^='urn:li:activity:']",
      "div[data-urn^='urn:li:activity:']",
      "div.feed-shared-update-v2",
      "div.occludable-update",
      "article",
      "section.artdeco-card"
    ];
    const textSelectors = [
      ".update-components-text .break-words",
      ".update-components-text",
      ".feed-shared-update-v2__description",
      ".attributed-text-segment-list__container",
      "[data-test-id='main-feed-activity-card__commentary']",
      ".break-words"
    ];
    const metadataPatterns = [
      /^\d+\s*(followers?|employees?)$/i,
      /^\d+\s*(reactions?|comments?|reposts?)$/i,
      /^(like|comment|repost|send|share|copy link|follow|more|see translation|view translation)$/i,
      /^\d+\s*[smhdwoy]$/i,
      /^(edited|promoted)$/i
    ];

    function normalizeWhitespace(value) {
      return String(value || "")
        .replace(/\u00a0/g, " ")
        .replace(/\r/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
    }

    function looksLikePostUrl(value) {
      return POST_URL_PATTERN.test(String(value || ""));
    }

    function decodeEmbeddedMarkup(value) {
      return String(value || "")
        .replace(/\\u002F/g, "/")
        .replace(/\\\//g, "/")
        .replace(/&amp;/g, "&");
    }

    function extractActivityId(value) {
      const match = String(value || "").match(/(?:activity-|urn:li:activity:)(\d+)/i);
      return match ? match[1] : null;
    }

    function decodeTimestampFromActivityId(activityId) {
      if (!/^\d+$/.test(String(activityId || ""))) {
        return null;
      }

      try {
        // LinkedIn activity IDs encode the publish timestamp in the high bits.
        const timestampMs = Number(BigInt(activityId) >> 22n);

        if (!Number.isFinite(timestampMs)) {
          return null;
        }

        const parsedValue = new Date(timestampMs);

        if (Number.isNaN(parsedValue.getTime())) {
          return null;
        }

        if (parsedValue.getUTCFullYear() < 2000 || parsedValue.getUTCFullYear() > 2100) {
          return null;
        }

        return parsedValue.toISOString();
      } catch (error) {
        return null;
      }
    }

    function extractDirectPostUrls(value) {
      const decoded = decodeEmbeddedMarkup(value);
      const matches =
        decoded.match(/https:\/\/www\.linkedin\.com\/posts\/[^"'\\\s<]+/gi) || [];

      return Array.from(new Set(matches))
        .map((match) => cleanUrl(match))
        .filter((match) => match && looksLikePostUrl(match));
    }

    function extractDirectDocumentUrls(value) {
      const decoded = decodeEmbeddedMarkup(value);
      const matches = [
        ...(decoded.match(/https?:\/\/[^"'\\\s<]+?\.(?:pdf|pptx?|docx?|xlsx?)(?:[?#][^"'\\\s<]*)?/gi) || []),
        ...(decoded.match(/https:\/\/www\.linkedin\.com\/[^"'\\\s<]*document[^"'\\\s<]*/gi) || [])
      ];

      return Array.from(new Set(matches))
        .map((match) => cleanUrl(match, { preserveSearch: true }))
        .filter(Boolean);
    }

    function cleanUrl(value, options = {}) {
      if (!value) {
        return null;
      }

      try {
        const parsed = new URL(value, window.location.origin);
        parsed.hash = "";

        if (!options.preserveSearch && /linkedin\.com$/i.test(parsed.hostname)) {
          parsed.search = "";
        }

        return parsed.toString();
      } catch (error) {
        return null;
      }
    }

    function titleCaseFromSlug(value) {
      return String(value || "")
        .split("-")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    }

    function sanitizeAuthorName(value) {
      const normalized = normalizeWhitespace(value || "")
        .replace(/^[\s\-–—•·|:]+/, "")
        .replace(/[\s\-–—•·|:]+$/, "");

      if (!normalized || normalized.length < 2 || normalized.length > 120) {
        return null;
      }

      if (/^https?:\/\//i.test(normalized) || /\blinkedin\.com\b/i.test(normalized)) {
        return null;
      }

      if (
        isMetadataLine(normalized) ||
        /^(follow|more|send|share|copy link|view profile|see translation|view translation|learn more)$/i.test(
          normalized
        )
      ) {
        return null;
      }

      return normalized;
    }

    function looksLikeAuthorProfileUrl(value) {
      return AUTHOR_PROFILE_URL_PATTERN.test(String(value || ""));
    }

    function inferAuthorNameFromUrl(url) {
      if (!looksLikeAuthorProfileUrl(url)) {
        return null;
      }

      try {
        const parsed = new URL(url);
        const [, entityType, slug] =
          parsed.pathname.match(/^\/(company|in|school|showcase)\/([^/?#]+)/i) || [];

        if (!entityType || !slug) {
          return null;
        }

        return sanitizeAuthorName(titleCaseFromSlug(slug));
      } catch (error) {
        return null;
      }
    }

    function isMetadataLine(value) {
      const line = normalizeWhitespace(value);

      if (!line) {
        return true;
      }

      return metadataPatterns.some((pattern) => pattern.test(line));
    }

    function findContainer(startNode) {
      let current = startNode;

      for (let depth = 0; current && depth < 10; depth += 1, current = current.parentElement) {
        if (!(current instanceof HTMLElement)) {
          continue;
        }

        if (
          current.matches(
            "article, div[data-id^='urn:li:activity:'], div[data-urn^='urn:li:activity:'], div.feed-shared-update-v2, div.occludable-update, section.artdeco-card"
          )
        ) {
          return current;
        }

        const text = normalizeWhitespace(current.innerText || "");

        if (text.length >= 120 && current.querySelector("a[href*='/posts/'], a[href*='/feed/update/']")) {
          return current;
        }
      }

      return null;
    }

    function extractText(container) {
      for (const selector of textSelectors) {
        const matches = Array.from(container.querySelectorAll(selector));

        for (const match of matches) {
          const text = normalizeWhitespace(match.innerText || match.textContent || "");

          if (text.length >= 20) {
            return {
              value: text.slice(0, MAX_TEXT_LENGTH),
              fromSelector: true
            };
          }
        }
      }

      const lines = normalizeWhitespace(container.innerText || "")
        .split("\n")
        .map((line) => normalizeWhitespace(line))
        .filter(Boolean);
      const filtered = [];

      for (let index = 0; index < lines.length; index += 1) {
        const currentLine = lines[index];
        const nextLine = lines[index + 1];

        if (isMetadataLine(currentLine)) {
          continue;
        }

        if (
          filtered.length === 0 &&
          currentLine.length <= 80 &&
          (isMetadataLine(nextLine) || isMetadataLine(lines[index + 2]))
        ) {
          continue;
        }

        filtered.push(currentLine);

        if (filtered.join("\n").length >= MAX_TEXT_LENGTH) {
          break;
        }
      }

      return {
        value: normalizeWhitespace(filtered.join("\n")).slice(0, MAX_TEXT_LENGTH),
        fromSelector: false
      };
    }

    function collectAuthorCandidates(container) {
      const containerTop = container.getBoundingClientRect().top + window.scrollY;
      const candidates = [];
      const seen = new Set();

      for (const node of container.querySelectorAll("a[href]")) {
        if (!(node instanceof HTMLAnchorElement)) {
          continue;
        }

        const url = cleanUrl(node.getAttribute("href") || node.href);

        if (
          !url ||
          !looksLikeAuthorProfileUrl(url) ||
          looksLikePostUrl(url) ||
          LINKEDIN_DOCUMENT_URL_PATTERN.test(url)
        ) {
          continue;
        }

        const values = [
          node.getAttribute("aria-label"),
          node.getAttribute("title"),
          node.textContent,
          node.querySelector("img")?.getAttribute("alt")
        ];
        const name =
          values.map((value) => sanitizeAuthorName(value)).find(Boolean) ||
          inferAuthorNameFromUrl(url);

        if (!name) {
          continue;
        }

        const topOffset = node.getBoundingClientRect().top + window.scrollY - containerTop;

        if (topOffset < -40 || topOffset > 900) {
          continue;
        }

        const key = `${url}|${name.toLowerCase()}`;

        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        candidates.push({
          name,
          url,
          topOffset,
          score:
            (topOffset <= 240 ? 180 : Math.max(0, 120 - Math.floor(topOffset / 6))) +
            (node.querySelector("img") ? 25 : 0)
        });
      }

      return candidates.sort((left, right) => right.score - left.score || left.topOffset - right.topOffset);
    }

    function extractAuthorMetadata(container) {
      const authorCandidates = collectAuthorCandidates(container);
      const primaryAuthor = authorCandidates[0] || null;
      const repostSignal =
        /\brepost(?:ed|ing)?\b|\breshared\b|\bshared post\b/i.test(container.innerText || "") ||
        Boolean(container.querySelector("[aria-label*='repost' i], [title*='repost' i]"));
      const descendantUrns = Array.from(
        container.querySelectorAll("[data-id^='urn:li:activity:'], [data-urn^='urn:li:activity:']")
      )
        .map((node) =>
          node instanceof HTMLElement
            ? normalizeWhitespace(node.getAttribute("data-id") || node.getAttribute("data-urn") || "")
            : ""
        )
        .filter((value) => /^urn:li:activity:\d+$/i.test(value));
      const hasNestedActivity = new Set(descendantUrns).size > 1;
      const repostedFromAuthor = (repostSignal || hasNestedActivity)
        ? authorCandidates.find(
            (candidate) =>
              primaryAuthor &&
              candidate.name !== primaryAuthor.name &&
              candidate.url !== primaryAuthor.url &&
              candidate.topOffset >= primaryAuthor.topOffset
          ) || null
        : null;

      return {
        authorName: repostedFromAuthor?.name || primaryAuthor?.name || null,
        authorUrl: repostedFromAuthor?.url || primaryAuthor?.url || null,
        sharedByAuthorName: repostedFromAuthor ? primaryAuthor?.name || null : null,
        sharedByAuthorUrl: repostedFromAuthor ? primaryAuthor?.url || null : null
      };
    }

    function extractActivityUrn(container) {
      let current = container;

      for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
        if (!(current instanceof HTMLElement)) {
          continue;
        }

        for (const attributeName of ["data-id", "data-urn"]) {
          const rawValue = normalizeWhitespace(current.getAttribute(attributeName) || "");

          if (/^urn:li:activity:\d+$/i.test(rawValue)) {
            return rawValue;
          }
        }
      }

      const directUrnMatch = decodeEmbeddedMarkup(container.innerHTML || "").match(
        /urn:li:activity:(\d+)/i
      );

      if (directUrnMatch) {
        return `urn:li:activity:${directUrnMatch[1]}`;
      }

      const activityIdFromMarkup = extractActivityId(container.innerHTML || "");

      if (activityIdFromMarkup) {
        return `urn:li:activity:${activityIdFromMarkup}`;
      }

      const descendantUrns = Array.from(
        container.querySelectorAll("[data-id^='urn:li:activity:'], [data-urn^='urn:li:activity:']")
      )
        .map((node) => {
          if (!(node instanceof HTMLElement)) {
            return null;
          }

          return normalizeWhitespace(node.getAttribute("data-id") || node.getAttribute("data-urn") || "");
        })
        .filter((value) => /^urn:li:activity:\d+$/i.test(value));
      const uniqueUrns = Array.from(new Set(descendantUrns));

      if (uniqueUrns.length === 1) {
        return uniqueUrns[0];
      }

      return null;
    }

    function buildPostUrlFromActivityUrn(activityUrn) {
      if (!activityUrn) {
        return null;
      }

      return `https://www.linkedin.com/feed/update/${activityUrn}/`;
    }

    function buildPostUrlIndex() {
      const postUrlMap = new Map();

      for (const match of extractDirectPostUrls(document.documentElement?.innerHTML || "")) {
        const activityId = extractActivityId(match);

        if (activityId && !postUrlMap.has(activityId)) {
          postUrlMap.set(activityId, match);
        }
      }

      for (const link of document.querySelectorAll("a[href]")) {
        const href = link.getAttribute("href") || link.href;

        for (const match of extractDirectPostUrls(href)) {
          const activityId = extractActivityId(match);

          if (activityId && !postUrlMap.has(activityId)) {
            postUrlMap.set(activityId, match);
          }
        }
      }

      return postUrlMap;
    }

    function extractPostUrl(container, postUrlByActivityId) {
      const links = Array.from(container.querySelectorAll("a[href]"));

      for (const link of links) {
        const href = link.getAttribute("href") || link.href;
        const normalized = cleanUrl(href);

        if (normalized && looksLikePostUrl(normalized)) {
          return normalized;
        }
      }

      const embeddedPostUrl = extractDirectPostUrls(container.innerHTML || "")[0];

      if (embeddedPostUrl) {
        return embeddedPostUrl;
      }

      const activityUrn = extractActivityUrn(container);
      const activityId = extractActivityId(activityUrn);

      if (activityId && postUrlByActivityId.has(activityId)) {
        return postUrlByActivityId.get(activityId);
      }

      return buildPostUrlFromActivityUrn(activityUrn);
    }

    function extractTimestamp(container) {
      const datetimeNode = container.querySelector("time[datetime], [datetime]");

      if (datetimeNode) {
        const rawValue = datetimeNode.getAttribute("datetime");

        if (rawValue) {
          const parsedValue = new Date(rawValue);

          if (!Number.isNaN(parsedValue.getTime())) {
            return parsedValue.toISOString();
          }
        }
      }

      const activityId = extractActivityId(extractActivityUrn(container) || "");

      if (activityId) {
        return decodeTimestampFromActivityId(activityId);
      }

      return null;
    }

    function isDecorativeImageAsset(src, alt) {
      const fingerprint = `${src || ""} ${alt || ""}`;

      if (/static\.licdn\.com\/aero-v1\/sc\//i.test(src || "")) {
        return true;
      }

      return /avatar|profile|logo|ghost|emoji|icon|reaction|like|comment|repost|send|share/i.test(
        fingerprint
      );
    }

    function extractImageUrl(container) {
      const candidates = Array.from(container.querySelectorAll("img"))
        .map((image) => {
          const src = cleanUrl(image.currentSrc || image.getAttribute("src"), {
            preserveSearch: true
          });
          const alt = normalizeWhitespace(image.getAttribute("alt") || "");
          const width = image.naturalWidth || image.width || 0;
          const height = image.naturalHeight || image.height || 0;
          const score = width * height;

          return { src, alt, score };
        })
        .filter(({ src, alt }) => {
          if (!src || src.startsWith("data:")) {
            return false;
          }

          return !isDecorativeImageAsset(src, alt);
        })
        .sort((left, right) => right.score - left.score);

      return candidates[0] ? candidates[0].src : null;
    }

    function pickAttachmentTitle(values, fallback = null) {
      for (const value of values) {
        const normalized = normalizeWhitespace(value || "");

        if (!normalized) {
          continue;
        }

        const firstLine = normalized.split("\n").map((line) => normalizeWhitespace(line)).find(Boolean);

        if (!firstLine || isMetadataLine(firstLine)) {
          continue;
        }

        return firstLine.slice(0, 180);
      }

      return fallback;
    }

    function collectNodeDocumentSignals(node) {
      if (!(node instanceof HTMLElement)) {
        return {
          text: "",
          title: null,
          hasHint: false,
          hasPageHint: false
        };
      }

      const values = [
        node.getAttribute("aria-label"),
        node.getAttribute("title"),
        node.textContent
      ];
      const combinedText = normalizeWhitespace(values.filter(Boolean).join("\n"));

      return {
        text: combinedText,
        title: pickAttachmentTitle(values, null),
        hasHint: DOCUMENT_HINT_PATTERN.test(combinedText),
        hasPageHint: DOCUMENT_PAGE_HINT_PATTERN.test(combinedText)
      };
    }

    function collectPreviewImages(node) {
      if (!(node instanceof HTMLElement)) {
        return [];
      }

      return Array.from(node.querySelectorAll("img"))
        .map((image) => {
          const url = cleanUrl(image.currentSrc || image.getAttribute("src"), {
            preserveSearch: true
          });
          const alt = normalizeWhitespace(image.getAttribute("alt") || "");
          const width = image.naturalWidth || image.width || image.clientWidth || 0;
          const height = image.naturalHeight || image.height || image.clientHeight || 0;
          const score = width * height;

          return {
            url,
            alt,
            score
          };
        })
        .filter(({ url, alt }) => url && !isDecorativeImageAsset(url, alt))
        .sort((left, right) => right.score - left.score);
    }

    function collectImageAttachments(container) {
      return Array.from(container.querySelectorAll("img"))
        .map((image) => {
          const url = cleanUrl(image.currentSrc || image.getAttribute("src"), {
            preserveSearch: true
          });
          const alt = normalizeWhitespace(image.getAttribute("alt") || "");
          const width = image.naturalWidth || image.width || 0;
          const height = image.naturalHeight || image.height || 0;
          const score = width * height;

          return {
            type: "image",
            url,
            thumbnailUrl: url,
            title: pickAttachmentTitle([alt], "LinkedIn post image"),
            score
          };
        })
        .filter(({ url, title }) => {
          if (!url || url.startsWith("data:")) {
            return false;
          }

          return !isDecorativeImageAsset(url, title || "");
        })
        .sort((left, right) => right.score - left.score);
    }

    function collectVideoAttachments(container, postUrl) {
      return Array.from(container.querySelectorAll("video"))
        .map((video) => {
          const sourceNode = video.querySelector("source[src]");
          const videoUrl = cleanUrl(
            video.currentSrc ||
              video.getAttribute("src") ||
              sourceNode?.getAttribute("src"),
            { preserveSearch: true }
          );
          const thumbnailUrl = cleanUrl(video.getAttribute("poster"), {
            preserveSearch: true
          });
          const nearestAnchor = video.closest("a[href]");
          const anchorUrl = cleanUrl(nearestAnchor?.getAttribute("href") || nearestAnchor?.href, {
            preserveSearch: true
          });
          const url =
            videoUrl ||
            (anchorUrl && !looksLikePostUrl(anchorUrl) ? anchorUrl : null) ||
            postUrl ||
            null;
          const score =
            (video.videoWidth || video.clientWidth || video.offsetWidth || 0) *
            (video.videoHeight || video.clientHeight || video.offsetHeight || 0);

          if (!url && !thumbnailUrl) {
            return null;
          }

          return {
            type: "video",
            url,
            thumbnailUrl,
            title: pickAttachmentTitle(
              [
                video.getAttribute("aria-label"),
                video.getAttribute("title"),
                nearestAnchor?.getAttribute("aria-label"),
                nearestAnchor?.getAttribute("title"),
                nearestAnchor?.textContent
              ],
              "LinkedIn video attachment"
            ),
            score
          };
        })
        .filter(Boolean);
    }

    function collectDocumentAttachments(container, postUrl) {
      const htmlDocumentUrls = extractDirectDocumentUrls(container.innerHTML || "").map((url) => ({
        type: "document",
        url,
        thumbnailUrl: null,
        title: "LinkedIn document attachment",
        score: 10
      }));

      const domDocumentAttachments = Array.from(
        container.querySelectorAll("a[href], button, [role='button'], [aria-label], [title]")
      )
        .map((node) => {
          if (!(node instanceof HTMLElement)) {
            return null;
          }

          const rawUrl =
            node instanceof HTMLAnchorElement
              ? cleanUrl(node.getAttribute("href") || node.href, {
                  preserveSearch: true
                })
              : null;
          const signals = collectNodeDocumentSignals(node);
          const previewImages = collectPreviewImages(node);
          const previewUrl = previewImages[0]?.url || null;
          const hasDocumentUrl =
            DOCUMENT_URL_PATTERN.test(rawUrl || "") || LINKEDIN_DOCUMENT_URL_PATTERN.test(rawUrl || "");
          const pointsToPost = looksLikePostUrl(rawUrl || "");
          const isLikelyDocument =
            hasDocumentUrl ||
            (signals.hasHint && (signals.hasPageHint || Boolean(previewUrl) || signals.text.length <= 220));

          if (!isLikelyDocument) {
            return null;
          }

          if (!hasDocumentUrl && !signals.hasHint && !signals.hasPageHint) {
            return null;
          }

          if (!hasDocumentUrl && !previewUrl && !pointsToPost) {
            return null;
          }

          const url = rawUrl || postUrl || null;

          if (!url && !previewUrl) {
            return null;
          }

          return {
            type: "document",
            url,
            thumbnailUrl: previewUrl,
            title: signals.title || "LinkedIn document attachment",
            score: previewImages[0]?.score || (hasDocumentUrl ? 5 : 0)
          };
        })
        .filter(Boolean);

      return dedupeAttachments([...htmlDocumentUrls, ...domDocumentAttachments]);
    }

    function dedupeAttachments(attachments) {
      const attachmentMap = new Map();

      for (const attachment of attachments) {
        if (!attachment || (!attachment.url && !attachment.thumbnailUrl)) {
          continue;
        }

        const key = [
          attachment.type,
          attachment.url || "",
          attachment.thumbnailUrl || ""
        ].join("|");
        const existing = attachmentMap.get(key);

        if (!existing || (attachment.score || 0) > (existing.score || 0)) {
          attachmentMap.set(key, attachment);
        }
      }

      return Array.from(attachmentMap.values())
        .sort((left, right) => (right.score || 0) - (left.score || 0))
        .map(({ score, ...attachment }) => attachment);
    }

    function extractAttachments(container, postUrl) {
      const documentAttachments = collectDocumentAttachments(container, postUrl);
      const documentPreviewUrls = new Set(
        documentAttachments.map((attachment) => attachment.thumbnailUrl).filter(Boolean)
      );
      const videoAttachments = collectVideoAttachments(container, postUrl);
      const videoThumbnailUrls = new Set(
        videoAttachments.map((attachment) => attachment.thumbnailUrl).filter(Boolean)
      );
      const imageAttachments = collectImageAttachments(container).filter(
        (attachment) =>
          !videoThumbnailUrls.has(attachment.url) && !documentPreviewUrls.has(attachment.url)
      );

      return dedupeAttachments([
        ...imageAttachments,
        ...videoAttachments,
        ...documentAttachments
      ]);
    }

    function pickPreferredText(primary, secondary) {
      const primaryText = normalizeWhitespace(primary?.value || "");
      const secondaryText = normalizeWhitespace(secondary?.value || "");

      if (!primaryText) {
        return {
          value: secondaryText,
          fromSelector: Boolean(secondary?.fromSelector)
        };
      }

      if (!secondaryText) {
        return {
          value: primaryText,
          fromSelector: Boolean(primary?.fromSelector)
        };
      }

      if (Boolean(primary?.fromSelector) !== Boolean(secondary?.fromSelector)) {
        return Boolean(primary?.fromSelector)
          ? { value: primaryText, fromSelector: true }
          : { value: secondaryText, fromSelector: true };
      }

      return primaryText.length >= secondaryText.length
        ? {
            value: primaryText,
            fromSelector: Boolean(primary?.fromSelector)
          }
        : {
            value: secondaryText,
            fromSelector: Boolean(secondary?.fromSelector)
          };
    }

    function choosePrimaryImageUrl(imageUrl, attachments) {
      const imageAttachment = (attachments || []).find((attachment) => attachment.type === "image");
      return imageAttachment?.url || imageAttachment?.thumbnailUrl || imageUrl || null;
    }

    function scoreCandidate(candidate) {
      let score = 0;

      if (candidate.postUrl) {
        score += 1000;
      }

      if (candidate.publishedAt) {
        score += 500;
      }

      if (candidate.textFromSelector) {
        score += 250;
      }

      score += Math.min(normalizeWhitespace(candidate.text || "").length, 500);
      score += (candidate.attachments?.length || 0) * 50;

      if (candidate.imageUrl) {
        score += 25;
      }

      return score;
    }

    function isLowSignalMediaCandidate(candidate) {
      const textLength = normalizeWhitespace(candidate.text || "").length;
      const hasOnlyImages =
        candidate.attachments.length > 0 &&
        candidate.attachments.every((attachment) => attachment.type === "image");

      return (
        !candidate.textFromSelector &&
        !candidate.postUrl &&
        !candidate.publishedAt &&
        hasOnlyImages &&
        candidate.attachments.length > 0 &&
        textLength < MAX_TEXT_LENGTH
      );
    }

    function buildCandidateKey(candidate) {
      if (candidate.postUrl) {
        return `url:${candidate.postUrl}`;
      }

      const text = normalizeWhitespace(candidate.text || "")
        .replace(/\n+/g, "\n")
        .replace(/\s*…more$/i, "")
        .trim();

      if (text.length >= 80) {
        return `text:${text.slice(0, 1200)}`;
      }

      const attachmentKey = candidate.attachments
        .map((attachment) => `${attachment.type}|${attachment.url || ""}|${attachment.thumbnailUrl || ""}`)
        .join(",");

      return attachmentKey ? `attachment:${attachmentKey}` : null;
    }

    function mergeCandidatePair(left, right) {
      const leftScore = scoreCandidate(left);
      const rightScore = scoreCandidate(right);
      const primary = leftScore >= rightScore ? left : right;
      const secondary = primary === left ? right : left;
      const mergedText = pickPreferredText(
        {
          value: primary.text,
          fromSelector: primary.textFromSelector
        },
        {
          value: secondary.text,
          fromSelector: secondary.textFromSelector
        }
      );
      const attachments = dedupeAttachments([
        ...(left.attachments || []),
        ...(right.attachments || [])
      ]);

      return {
        text: mergedText.value,
        textFromSelector: mergedText.fromSelector,
        postUrl: primary.postUrl || secondary.postUrl || null,
        publishedAt: primary.publishedAt || secondary.publishedAt || null,
        authorName: primary.authorName || secondary.authorName || null,
        authorUrl: primary.authorUrl || secondary.authorUrl || null,
        sharedByAuthorName: primary.sharedByAuthorName || secondary.sharedByAuthorName || null,
        sharedByAuthorUrl: primary.sharedByAuthorUrl || secondary.sharedByAuthorUrl || null,
        attachments,
        imageUrl: choosePrimaryImageUrl(primary.imageUrl || secondary.imageUrl || null, attachments),
        sortIndex: Math.min(left.sortIndex, right.sortIndex)
      };
    }

    const containerSet = new Set();

    for (const selector of selectorCandidates) {
      for (const node of document.querySelectorAll(selector)) {
        if (node instanceof HTMLElement) {
          containerSet.add(node);
        }
      }
    }

    for (const link of document.querySelectorAll("a[href*='/posts/'], a[href*='/feed/update/']")) {
      const container = findContainer(link);

      if (container) {
        containerSet.add(container);
      }
    }

    const orderedContainers = Array.from(containerSet)
      .filter((container) => normalizeWhitespace(container.innerText || "").length >= 30)
      .sort((left, right) => {
        const leftOffset = left.getBoundingClientRect().top + window.scrollY;
        const rightOffset = right.getBoundingClientRect().top + window.scrollY;
        return leftOffset - rightOffset;
      })
      .slice(0, candidateLimit);

    const candidateMap = new Map();
    const postUrlByActivityId = buildPostUrlIndex();

    orderedContainers.forEach((container, index) => {
      const extractedText = extractText(container);
      const postUrl = extractPostUrl(container, postUrlByActivityId);
      const publishedAt = extractTimestamp(container);
      const authorMetadata = extractAuthorMetadata(container);
      const attachments = extractAttachments(container, postUrl);
      const firstImageAttachment = attachments.find((attachment) => attachment.type === "image");
      const candidate = {
        text: extractedText.value,
        textFromSelector: extractedText.fromSelector,
        postUrl,
        publishedAt,
        authorName: authorMetadata.authorName,
        authorUrl: authorMetadata.authorUrl,
        sharedByAuthorName: authorMetadata.sharedByAuthorName,
        sharedByAuthorUrl: authorMetadata.sharedByAuthorUrl,
        imageUrl: firstImageAttachment?.url || extractImageUrl(container),
        attachments,
        sortIndex: index
      };

      if (isLowSignalMediaCandidate(candidate)) {
        return;
      }

      const candidateKey = buildCandidateKey(candidate) || `index:${index}`;
      const existing = candidateMap.get(candidateKey);
      candidateMap.set(
        candidateKey,
        existing ? mergeCandidatePair(existing, candidate) : candidate
      );
    });

    return Array.from(candidateMap.values())
      .sort((left, right) => left.sortIndex - right.sortIndex)
      .map(({ textFromSelector, sortIndex, ...candidate }) => candidate);
  }, { candidateLimit: config.scrapeCandidateLimit });
}

async function scrapeLinkedInPosts(config) {
  const launchOptions = {
    headless: config.headless
  };

  if (config.browserExecutablePath) {
    launchOptions.executablePath = config.browserExecutablePath;
    console.log(`[scrape] Using system browser: ${config.browserExecutablePath}`);
  }

  const browser = await chromium.launch(launchOptions);

  const context = await browser.newContext({
    userAgent: config.userAgent,
    viewport: { width: 1440, height: 1600 },
    locale: "en-US",
    timezoneId: "UTC"
  });

  const page = await context.newPage();

  try {
    const openedPage = await openBestAvailablePage(page, config);
    console.log(`[scrape] Using page source ${openedPage.pageUrl}`);

    await autoScroll(page, config);

    const rawPosts = await extractRawPosts(page, config);
    const filteredPosts = rawPosts.filter(
      (post) =>
        post.text ||
        post.postUrl ||
        post.imageUrl ||
        (Array.isArray(post.attachments) && post.attachments.length > 0)
    );

    console.log(`[scrape] Extracted ${filteredPosts.length} candidate posts after filtering.`);

    return filteredPosts;
  } catch (error) {
    console.error(`[scrape] Failed to scrape ${config.linkedinCompanyUrl}: ${error.message}`);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function runFromCli() {
  const config = loadConfig();
  const posts = await scrapeLinkedInPosts(config);
  console.log(JSON.stringify({ count: posts.length, posts }, null, 2));
}

if (require.main === module) {
  runFromCli().catch((error) => {
    console.error(`[scrape] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  scrapeLinkedInPosts
};
