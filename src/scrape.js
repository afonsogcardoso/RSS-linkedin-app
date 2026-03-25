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
    const DOCUMENT_HINT_PATTERN =
      /\b(pdf|document|deck|slides|presentation|whitepaper|brochure|guide|one-pager|ebook|case study)\b/i;
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
            return text.slice(0, MAX_TEXT_LENGTH);
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

      return normalizeWhitespace(filtered.join("\n")).slice(0, MAX_TEXT_LENGTH);
    }

    function extractPostUrl(container) {
      const links = Array.from(container.querySelectorAll("a[href]"));

      for (const link of links) {
        const href = link.getAttribute("href") || link.href;
        const normalized = cleanUrl(href);

        if (normalized && looksLikePostUrl(normalized)) {
          return normalized;
        }
      }

      return null;
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

      return null;
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

          return !/avatar|profile|logo|ghost|emoji|icon/i.test(`${src} ${alt}`);
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

          return !/avatar|profile|logo|ghost|emoji|icon/i.test(`${url} ${title || ""}`);
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

    function collectDocumentAttachments(container) {
      return Array.from(container.querySelectorAll("a[href]"))
        .map((link) => {
          const url = cleanUrl(link.getAttribute("href") || link.href, {
            preserveSearch: true
          });

          if (!url || looksLikePostUrl(url)) {
            return null;
          }

          const title = pickAttachmentTitle(
            [
              link.getAttribute("aria-label"),
              link.getAttribute("title"),
              link.textContent
            ],
            null
          );
          const combined = `${url} ${title || ""}`;

          if (
            !DOCUMENT_URL_PATTERN.test(url) &&
            !/linkedin\.com\/.*document/i.test(url) &&
            !DOCUMENT_HINT_PATTERN.test(combined)
          ) {
            return null;
          }

          return {
            type: "document",
            url,
            thumbnailUrl: null,
            title: title || "LinkedIn document attachment",
            score: 0
          };
        })
        .filter(Boolean);
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
      const videoAttachments = collectVideoAttachments(container, postUrl);
      const videoThumbnailUrls = new Set(
        videoAttachments.map((attachment) => attachment.thumbnailUrl).filter(Boolean)
      );
      const imageAttachments = collectImageAttachments(container).filter(
        (attachment) => !videoThumbnailUrls.has(attachment.url)
      );
      const documentAttachments = collectDocumentAttachments(container);

      return dedupeAttachments([
        ...imageAttachments,
        ...videoAttachments,
        ...documentAttachments
      ]);
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

    return orderedContainers.map((container) => {
      const postUrl = extractPostUrl(container);
      const attachments = extractAttachments(container, postUrl);
      const firstImageAttachment = attachments.find((attachment) => attachment.type === "image");

      return {
        text: extractText(container),
        postUrl,
        publishedAt: extractTimestamp(container),
        imageUrl: firstImageAttachment?.url || extractImageUrl(container),
        attachments
      };
    });
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
