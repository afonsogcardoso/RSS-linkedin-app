const path = require("path");
const dotenv = require("dotenv");

let envLoaded = false;

function loadEnv() {
  if (envLoaded) {
    return;
  }

  dotenv.config({ path: path.resolve(process.cwd(), ".env") });
  envLoaded = true;
}

function parseInteger(name, defaultValue, options = {}) {
  const rawValue = process.env[name];

  if (rawValue === undefined || rawValue === "") {
    return defaultValue;
  }

  const value = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(value)) {
    throw new Error(`Environment variable ${name} must be an integer.`);
  }

  if (options.min !== undefined && value < options.min) {
    throw new Error(`Environment variable ${name} must be >= ${options.min}.`);
  }

  if (options.max !== undefined && value > options.max) {
    throw new Error(`Environment variable ${name} must be <= ${options.max}.`);
  }

  return value;
}

function parseBoolean(name, defaultValue) {
  const rawValue = process.env[name];

  if (rawValue === undefined || rawValue === "") {
    return defaultValue;
  }

  const normalized = rawValue.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Environment variable ${name} must be a boolean.`);
}

function titleCaseFromSlug(slug) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeLinkedInCompanyUrl(rawUrl) {
  if (!rawUrl || rawUrl.trim() === "") {
    throw new Error(
      "Missing LINKEDIN_COMPANY_URL. Set it locally in .env or in GitHub under Settings > Secrets and variables > Actions."
    );
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(rawUrl.trim());
  } catch (error) {
    throw new Error("LINKEDIN_COMPANY_URL must be a valid absolute URL.");
  }

  const hostname = parsedUrl.hostname.replace(/^www\./i, "").toLowerCase();

  if (hostname !== "linkedin.com") {
    throw new Error("LINKEDIN_COMPANY_URL must point to linkedin.com.");
  }

  const match = parsedUrl.pathname.match(/^\/company\/([^/]+)/i);

  if (!match) {
    throw new Error(
      "LINKEDIN_COMPANY_URL must point to a public LinkedIn company page, for example https://www.linkedin.com/company/company-name."
    );
  }

  const companySlug = match[1];
  const publicCompanyUrl = new URL(`https://www.linkedin.com/company/${companySlug}/`);
  const postsUrl = new URL(`https://www.linkedin.com/company/${companySlug}/posts/`);
  postsUrl.searchParams.set("feedView", "all");

  return {
    companySlug,
    companyName: titleCaseFromSlug(companySlug),
    url: publicCompanyUrl.toString(),
    publicCompanyUrl: publicCompanyUrl.toString(),
    postsUrl: postsUrl.toString()
  };
}

function loadConfig() {
  loadEnv();

  const { companySlug, companyName, url, publicCompanyUrl, postsUrl } = normalizeLinkedInCompanyUrl(
    process.env.LINKEDIN_COMPANY_URL
  );
  const maxItems = parseInteger("MAX_ITEMS", 20, { min: 1, max: 100 });

  return {
    companySlug,
    companyName,
    linkedinCompanyUrl: url,
    linkedinPublicCompanyUrl: publicCompanyUrl,
    linkedinPostsUrl: postsUrl,
    scrapeTimeoutMs: parseInteger("SCRAPE_TIMEOUT_MS", 45000, { min: 5000 }),
    scrollCount: parseInteger("SCROLL_COUNT", 8, { min: 1, max: 50 }),
    scrollDelayMs: parseInteger("SCROLL_DELAY_MS", 1200, { min: 100, max: 10000 }),
    pageLoadDelayMs: parseInteger("PAGE_LOAD_DELAY_MS", 2500, { min: 0, max: 15000 }),
    maxItems,
    scrapeCandidateLimit: Math.max(maxItems * 2, 20),
    headless: parseBoolean("HEADLESS", true),
    browserExecutablePath: process.env.BROWSER_EXECUTABLE_PATH || null,
    userAgent:
      process.env.USER_AGENT ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    feedTitle: process.env.RSS_TITLE || `${companyName} LinkedIn Posts`,
    feedDescription:
      process.env.RSS_DESCRIPTION ||
      `Latest public LinkedIn company posts from ${companyName}, exposed as RSS.`,
    stateFile: path.resolve(process.cwd(), "data", "feed.json"),
    outputFile: path.resolve(process.cwd(), "public", "feed.xml")
  };
}

module.exports = {
  loadConfig,
  normalizeLinkedInCompanyUrl
};
