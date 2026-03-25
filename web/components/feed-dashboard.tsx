"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { useDeferredValue, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  Filter,
  Images,
  LayoutDashboard,
  Rss,
  Search,
  Sparkles,
  TriangleAlert
} from "lucide-react";

import type { FeedState } from "@/lib/feed";
import { formatCompactDate, formatDate, formatRelativeTime } from "@/lib/utils";

import { PostCard } from "@/components/post-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SortOrder = "newest" | "oldest";

type FeedDashboardProps = {
  feed: FeedState;
};

export function FeedDashboard({ feed }: FeedDashboardProps) {
  const [query, setQuery] = useState("");
  const [onlyWithImage, setOnlyWithImage] = useState(false);
  const [onlyRecent, setOnlyRecent] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const deferredQuery = useDeferredValue(query);

  const normalizedQuery = deferredQuery.trim().toLowerCase();
  let visiblePosts = [...feed.posts];

  if (normalizedQuery) {
    visiblePosts = visiblePosts.filter((post) => {
      const haystack = `${post.title} ${post.description} ${post.content}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }

  if (onlyWithImage) {
    visiblePosts = visiblePosts.filter((post) => Boolean(post.imageUrl));
  }

  if (onlyRecent) {
    visiblePosts = visiblePosts.filter((post) => post.isRecent);
  }

  visiblePosts.sort((left, right) => {
    const leftTime = Date.parse(left.pubDate);
    const rightTime = Date.parse(right.pubDate);
    return sortOrder === "newest" ? rightTime - leftTime : leftTime - rightTime;
  });

  const latestPost = feed.posts[0];

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="overflow-hidden rounded-[2rem] border border-border/60 bg-card/85 p-6 shadow-panel backdrop-blur sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-4xl space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1.5">
                <LayoutDashboard className="h-3.5 w-3.5" />
                LinkedIn dashboard
              </Badge>
              <Badge variant="outline">Source of truth stays in the root RSS pipeline</Badge>
            </div>

            <div className="space-y-3">
              <h1 className="max-w-3xl font-[family-name:var(--font-display)] text-4xl leading-tight text-balance sm:text-5xl lg:text-6xl">
                {feed.feedTitle || "LinkedIn RSS Dashboard"}
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                A separate Netlify-ready interface for reviewing LinkedIn posts from
                the existing GitHub-hosted RSS feed. The repository feed generator,
                GitHub Pages delivery, and Power Automate consumption stay unchanged.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {latestPost ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/45 px-3 py-1.5">
                  <CalendarDays className="h-4 w-4" />
                  Latest item {formatRelativeTime(latestPost.pubDate)}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/45 px-3 py-1.5">
                <Sparkles className="h-4 w-4" />
                Premium, responsive, read-only UI
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {feed.feedUrl ? (
              <a
                href={feed.feedUrl}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "outline" })}
              >
                <Rss className="h-4 w-4" />
                View RSS XML
              </a>
            ) : null}
            {feed.feedLink ? (
              <a
                href={feed.feedLink}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "outline" })}
              >
                Open LinkedIn
                <ArrowUpRight className="h-4 w-4" />
              </a>
            ) : null}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="Total posts"
          value={String(feed.posts.length)}
          detail="Normalized from the RSS feed"
        />
        <SummaryCard
          label="Latest post date"
          value={latestPost ? formatCompactDate(latestPost.pubDate) : "None"}
          detail={latestPost ? formatDate(latestPost.pubDate) : "No items available"}
        />
        <SummaryCard
          label="Visible posts"
          value={String(visiblePosts.length)}
          detail="Updates instantly as you search and filter"
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card className="border-border/70 bg-card/85 backdrop-blur">
            <CardContent className="space-y-4 p-5 sm:p-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Filter className="h-4 w-4" />
                Search, filter, and sort
              </div>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search titles, previews, or full post text"
                    className="pl-11"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <FilterPill
                    active={onlyWithImage}
                    onClick={() => setOnlyWithImage((current) => !current)}
                    icon={Images}
                    label="With image"
                  />
                  <FilterPill
                    active={onlyRecent}
                    onClick={() => setOnlyRecent((current) => !current)}
                    icon={Sparkles}
                    label="Recent"
                  />
                  <FilterPill
                    active={sortOrder === "newest"}
                    onClick={() => setSortOrder("newest")}
                    label="Newest first"
                  />
                  <FilterPill
                    active={sortOrder === "oldest"}
                    onClick={() => setSortOrder("oldest")}
                    label="Oldest first"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {feed.status === "error" ? (
            <StatusCard
              icon={TriangleAlert}
              title="The feed could not be loaded"
              description={feed.error}
              ctaLabel={feed.feedUrl ? "Open configured RSS feed" : undefined}
              ctaHref={feed.feedUrl || undefined}
            />
          ) : feed.posts.length === 0 ? (
            <StatusCard
              icon={Rss}
              title="No feed items are available"
              description="The dashboard connected successfully but found no posts in the RSS feed."
              ctaLabel={feed.feedUrl ? "Open RSS feed" : undefined}
              ctaHref={feed.feedUrl || undefined}
            />
          ) : visiblePosts.length === 0 ? (
            <StatusCard
              icon={Search}
              title="No posts match the current filters"
              description="Try clearing the search query or disabling one of the optional filters."
            />
          ) : (
            visiblePosts.map((post) => <PostCard key={post.id} post={post} />)
          )}
        </div>

        <aside className="space-y-6">
          <Card className="border-border/70 bg-card/85 backdrop-blur">
            <CardHeader>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Feed source
              </p>
              <CardTitle className="text-xl">Current connection</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="space-y-1">
                <p className="text-muted-foreground">RSS URL</p>
                <p className="break-all leading-6 text-foreground">
                  {feed.feedUrl || "Missing RSS_FEED_URL"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">LinkedIn source</p>
                <p className="break-all leading-6 text-foreground">
                  {feed.feedLink || "Unavailable"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Last build date</p>
                <p className="text-foreground">
                  {feed.lastBuildDate ? formatDate(feed.lastBuildDate) : "Unavailable"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/85 backdrop-blur">
            <CardHeader>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Deployment
              </p>
              <CardTitle className="text-xl">Repository separation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-7 text-muted-foreground">
              <p>
                The dashboard lives only in <code>web/</code>. The root workflow
                still builds <code>public/feed.xml</code> for GitHub Pages.
              </p>
              <p>
                Power Automate should continue using the GitHub-hosted feed URL. The
                Netlify deployment is read-only and consumes that feed.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/85 backdrop-blur">
            <CardHeader>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Quick actions
              </p>
              <CardTitle className="text-xl">Open related pages</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Link href="/" className={cn(buttonVariants({ variant: "secondary" }), "justify-center")}>
                Refresh dashboard state
              </Link>
              {feed.feedUrl ? (
                <a
                  href={feed.feedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(buttonVariants({ variant: "outline" }), "justify-center")}
                >
                  <Rss className="h-4 w-4" />
                  Open RSS XML
                </a>
              ) : null}
              {feed.feedLink ? (
                <a
                  href={feed.feedLink}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(buttonVariants({ variant: "outline" }), "justify-center")}
                >
                  LinkedIn company page
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              ) : null}
            </CardContent>
          </Card>
        </aside>
      </section>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="border-border/70 bg-card/85 backdrop-blur">
      <CardHeader className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {label}
        </p>
        <CardTitle className="font-[family-name:var(--font-display)] text-4xl">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-6 text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function FilterPill({
  active,
  icon: Icon,
  label,
  onClick
}: {
  active: boolean;
  icon?: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition",
        active
          ? "border-primary/30 bg-primary text-primary-foreground shadow-lg shadow-primary/20"
          : "border-border/80 bg-card text-foreground hover:bg-muted"
      )}
    >
      {Icon ? <Icon className="h-4 w-4" /> : null}
      {label}
    </button>
  );
}

function StatusCard({
  icon: Icon,
  title,
  description,
  ctaLabel,
  ctaHref
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <Card className="border-border/70 bg-card/85 backdrop-blur">
      <CardContent className="space-y-5 p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <div className="space-y-2">
          <h2 className="font-[family-name:var(--font-display)] text-3xl text-balance">
            {title}
          </h2>
          <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
            {description}
          </p>
        </div>
        {ctaLabel && ctaHref ? (
          <a
            href={ctaHref}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "outline" })}
          >
            {ctaLabel}
            <ArrowUpRight className="h-4 w-4" />
          </a>
        ) : null}
      </CardContent>
    </Card>
  );
}
