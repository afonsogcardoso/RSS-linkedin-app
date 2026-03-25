# LinkedIn Company Posts to RSS

This repository monitors a public LinkedIn company posts page with Node.js and Playwright, stores the latest items in `data/feed.json`, generates an RSS 2.0 feed at `public/feed.xml`, and publishes that feed with GitHub Pages.

The repository only produces an RSS feed. It does not send anything directly to Microsoft Teams. Power Automate can consume the feed later and post notifications into Teams.

## What it does

- Scrapes the latest posts from a public LinkedIn company page.
- Best-effort captures attachment metadata for images, videos, and documents when LinkedIn exposes those assets to guest visitors.
- Uses Playwright because LinkedIn content is dynamic and may require scrolling.
- Keeps state in `data/feed.json` so GUIDs remain stable and duplicate posts are not added again.
- Keeps the newest 20 items in the final feed.
- Publishes `feed.xml` through GitHub Pages using GitHub Actions.

## Requirements

- Node.js 20 or newer
- A public LinkedIn company URL
- GitHub Actions enabled in the repository
- GitHub Pages enabled in the repository

## Configuration

The scraper reads the company URL from the `LINKEDIN_COMPANY_URL` environment variable.

Example value:

```env
LINKEDIN_COMPANY_URL=https://www.linkedin.com/company/company-name
```

The code accepts a company URL and then tries guest-accessible LinkedIn page variants internally. In practice, it prefers the public company page and treats `/posts/?feedView=all` as a secondary candidate because LinkedIn sometimes redirects the posts view to login for unauthenticated visitors.

You can also configure these optional variables:

- `SCRAPE_TIMEOUT_MS`
- `SCROLL_COUNT`
- `SCROLL_DELAY_MS`
- `PAGE_LOAD_DELAY_MS`
- `MAX_ITEMS`
- `RSS_TITLE`
- `RSS_DESCRIPTION`
- `HEADLESS`
- `BROWSER_EXECUTABLE_PATH`
- `USER_AGENT`

## Local setup

1. Clone the repository.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Install the Playwright browser:

   ```bash
   npx playwright install --with-deps chromium
   ```

4. Create a local `.env` file from `.env.example`:

   ```bash
   cp .env.example .env
   ```

5. Set `LINKEDIN_COMPANY_URL` in `.env`.
6. Run a scrape-only debug command:

   ```bash
   npm run scrape
   ```

7. Build the feed and update local state:

   ```bash
   npm run build
   ```

After a successful run, the generated RSS feed will be available in `public/feed.xml` and the deduped cache will be updated in `data/feed.json`.

### Optional: use your installed Chrome or Edge locally

If you do not want to download Playwright's managed Chromium for local runs, you can point Playwright at your installed browser by setting `BROWSER_EXECUTABLE_PATH` in `.env`.

Common macOS examples:

```env
BROWSER_EXECUTABLE_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
```

```env
BROWSER_EXECUTABLE_PATH=/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge
```

This option is intended for local development only. GitHub Actions should keep using Playwright's managed Chromium from `npx playwright install --with-deps chromium`.

## GitHub Actions setup

Prefer a repository variable for `LINKEDIN_COMPANY_URL` because the target company page is public.

To set it in GitHub:

1. Open the repository on GitHub.
2. Go to `Settings`.
3. Go to `Secrets and variables`.
4. Go to `Actions`.
5. Open the `Variables` tab.
6. Click `New repository variable`.
7. Create `LINKEDIN_COMPANY_URL` with your public LinkedIn company URL.

If you prefer, you can store the same value as a repository secret named `LINKEDIN_COMPANY_URL`. The workflow checks repository variables first and then falls back to a secret with the same name.

Optional tuning values such as `SCRAPE_TIMEOUT_MS`, `SCROLL_COUNT`, `SCROLL_DELAY_MS`, `PAGE_LOAD_DELAY_MS`, `MAX_ITEMS`, `RSS_TITLE`, and `RSS_DESCRIPTION` can also be added as repository variables in the same GitHub Actions settings area.

The workflow file is `.github/workflows/build-feed.yml`. It runs:

- manually with `workflow_dispatch`
- automatically every 30 minutes

On each successful run it:

1. Installs dependencies.
2. Installs the Playwright Chromium browser.
3. Scrapes the LinkedIn company posts page.
4. Updates `data/feed.json`.
5. Regenerates `public/feed.xml`.
6. Commits those generated files back to the repository.
7. Deploys the `public` folder to GitHub Pages.

If `LINKEDIN_COMPANY_URL` is missing, the workflow fails with a clear error message before scraping starts.

## GitHub Pages setup

This repository deploys GitHub Pages from Actions, using the `public` folder as the site root. That means `public/feed.xml` is published as `/feed.xml`.

To enable Pages:

1. Push the repository to GitHub.
2. Open `Settings`.
3. Open `Pages`.
4. Under `Build and deployment`, set `Source` to `GitHub Actions`.
5. Run the `Build LinkedIn RSS Feed` workflow once manually, or wait for the next scheduled run.

After the first successful deployment, the public feed URL will usually be:

```text
https://<owner>.github.io/<repository>/feed.xml
```

If the repository is a user or organization site repository named `<owner>.github.io`, the feed URL becomes:

```text
https://<owner>.github.io/feed.xml
```

## Using with Power Automate

Power Automate can consume the RSS feed and publish new items into Microsoft Teams. This repository only creates the feed. It does not send anything to Teams by itself.

### Power Automate setup

1. Create an automated cloud flow in Power Automate.
2. Choose the RSS trigger `When a feed item is published`.
3. Paste the public GitHub Pages feed URL.
4. Add the Microsoft Teams action `Post message in a chat or channel`.
5. Use the RSS item fields in the Teams message body.

Example Teams message template:

```text
Novo post no LinkedIn

Tema: @{triggerBody()?['title']}
Link: @{triggerBody()?['primaryLink']}
```

The repository also includes `teams-message-template.txt` with a Portuguese message template you can adapt inside Power Automate.

## Separate web UI in `/web`

The repository root remains the source of truth for RSS generation. The existing GitHub Actions workflow still updates `public/feed.xml`, GitHub Pages still publishes that file, and Power Automate should continue consuming the GitHub-hosted feed URL exactly as before.

The `/web` folder is a separate Next.js application that only reads the RSS feed and presents it in a modern dashboard. It does not generate feed data, does not replace the root pipeline, and does not post anything to Teams.

### What `/web` does

- Fetches the RSS feed from `RSS_FEED_URL`
- Parses and normalizes feed items into a clean internal model
- Provides a responsive dashboard with search, filters, sorting, and detail pages
- Keeps the UI isolated so it can be deployed independently on Netlify

### Run `/web` locally

1. Open the web app folder:

   ```bash
   cd web
   ```

2. Install the web app dependencies:

   ```bash
   npm install
   ```

3. Create a local environment file:

   ```bash
   cp .env.example .env.local
   ```

4. Set `RSS_FEED_URL` in `web/.env.local` to the existing public GitHub Pages feed URL. Example:

   ```env
   RSS_FEED_URL=https://<owner>.github.io/<repository>/feed.xml
   ```

5. Start the development server:

   ```bash
   npm run dev
   ```

6. Open `http://localhost:3000`

### Deploy `/web` to Netlify

Deploy the `/web` app as a separate site, but prefer using the repository root `netlify.toml` so Netlify reads the build settings from version control instead of relying on dashboard defaults.

Recommended Netlify settings:

- Base directory: leave empty if Netlify is reading the root `netlify.toml`
- Build command: leave empty if Netlify is reading the root `netlify.toml`
- Publish directory: leave empty and let the Next.js Netlify plugin manage it
- Node version: `20`

If you prefer configuring the dashboard manually instead of using the root `netlify.toml`, use:

- Base directory: `web`
- Build command: `npm run build`
- Publish directory: leave empty

Do not set the publish directory to `web`, `web/`, `.next`, or `web/web`. With the Next.js Netlify plugin, that will fail because the publish directory cannot be the same as the site base directory.

Set this environment variable in Netlify:

- `RSS_FEED_URL` = the existing GitHub Pages RSS URL served from this repository

The repository root `netlify.toml` includes the Netlify build configuration for the `/web` app.

### Separation of responsibilities

- Root workflow `.github/workflows/build-feed.yml` continues generating and publishing `public/feed.xml`
- GitHub Pages continues hosting the RSS file
- Power Automate continues using the GitHub-hosted `feed.xml`
- `/web` only consumes the feed and can be deployed independently on Netlify

## Feed behavior

- Stable GUIDs are based on the LinkedIn post URL whenever available.
- If a stable post URL is not available, the code derives a GUID from the post content and image URL.
- New items are merged into the existing state file, deduped, sorted newest first, and trimmed to the latest 20 items.
- When LinkedIn exposes guest-accessible attachment assets, the feed preserves image, video, and document metadata in the generated item description HTML and in `data/feed.json`.
- If LinkedIn does not expose a reliable publication timestamp, the feed uses the first successful scrape time as `pubDate`.
- If the scraper returns zero items, the build fails and keeps the previous `public/feed.xml` and `data/feed.json` unchanged.

## Limitations

- LinkedIn HTML can change at any time.
- Scraping may break if LinkedIn changes its markup, rate limits requests, or serves a login wall.
- Some company pages or page variants may redirect guests to LinkedIn login even when the company itself is public.
- This project is best-effort scraping of public company pages only.
- Company mentions outside the company posts page are out of scope for this repository.
- Exact publication dates are not always exposed reliably on public pages.

## Troubleshooting

- `Missing LINKEDIN_COMPANY_URL`: set the variable locally in `.env` or in GitHub at `Settings > Secrets and variables > Actions`.
- `Executable doesn't exist` or browser launch failures: run `npx playwright install --with-deps chromium`.
- Empty scrape output: LinkedIn may have changed the page structure, throttled the request, or shown a partial page. The workflow intentionally fails instead of overwriting the previous feed with an empty one.
- GitHub Pages not updating: confirm `Settings > Pages > Build and deployment > Source` is set to `GitHub Actions`, then rerun the workflow.
- Power Automate not triggering: verify the public feed URL is reachable in a browser and that new items are being added to the top of `feed.xml`.

## Repository structure

```text
.
├── .github/workflows/build-feed.yml
├── data/feed.json
├── netlify.toml
├── public/feed.xml
├── web/
│   ├── .env.example
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── package.json
│   ├── tailwind.config.ts
│   └── tsconfig.json
├── src/config.js
├── src/index.js
├── src/rss.js
├── src/scrape.js
├── src/state.js
├── .env.example
├── .gitignore
├── package.json
└── teams-message-template.txt
```
