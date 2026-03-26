import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink, FileText, ImageIcon, PlayCircle, Rss } from "lucide-react";
import { notFound } from "next/navigation";

import { AttachmentGallery } from "@/components/attachment-gallery";
import { GuidancePanel } from "@/components/guidance-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { findPostById, loadFeed } from "@/lib/feed";
import { cn, formatDate, formatRelativeTime } from "@/lib/utils";

type PostDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function generateMetadata({
  params
}: PostDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const feed = await loadFeed();
  const post = findPostById(feed.posts, id);

  if (!post) {
    return {
      title: "Post not found | LinkedIn RSS Dashboard"
    };
  }

  return {
    title: `${post.title} | LinkedIn RSS Dashboard`,
    description: post.description
  };
}

export const revalidate = 900;

export default async function PostDetailPage({ params }: PostDetailPageProps) {
  const { id } = await params;
  const feed = await loadFeed();

  if (feed.status === "error") {
    return (
      <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
          <ThemeToggle />
        </div>
        <Card className="border-border/70 bg-card/90 shadow-panel backdrop-blur">
          <CardContent className="space-y-4 p-8">
            <Badge variant="outline" className="w-fit">
              Feed unavailable
            </Badge>
            <h1 className="font-[family-name:var(--font-display)] text-4xl text-balance">
              The detail view cannot load right now.
            </h1>
            <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
              {feed.error}
            </p>
            {feed.feedUrl ? (
              <a
                href={feed.feedUrl}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "outline" })}
              >
                <Rss className="h-4 w-4" />
                Open configured RSS feed
              </a>
            ) : null}
          </CardContent>
        </Card>
      </main>
    );
  }

  const post = findPostById(feed.posts, id);

  if (!post) {
    notFound();
  }

  const imageCount = post.attachments.filter((attachment) => attachment.type === "image").length;
  const videoCount = post.attachments.filter((attachment) => attachment.type === "video").length;
  const documentCount = post.attachments.filter((attachment) => attachment.type === "document").length;

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 rounded-[2rem] border border-border/60 bg-card/85 p-6 shadow-panel backdrop-blur sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Post detail</Badge>
            {post.isRecent ? (
              <Badge className="bg-success/15 text-success hover:bg-success/15">
                New
              </Badge>
            ) : null}
            {imageCount > 0 ? (
              <Badge variant="outline" className="gap-1.5">
                <ImageIcon className="h-3.5 w-3.5" />
                {imageCount} image{imageCount > 1 ? "s" : ""}
              </Badge>
            ) : null}
            {videoCount > 0 ? (
              <Badge variant="outline" className="gap-1.5">
                <PlayCircle className="h-3.5 w-3.5" />
                {videoCount} video{videoCount > 1 ? "s" : ""}
              </Badge>
            ) : null}
            {documentCount > 0 ? (
              <Badge variant="outline" className="gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                {documentCount} doc{documentCount > 1 ? "s" : ""}
              </Badge>
            ) : null}
          </div>
          <h1 className="max-w-4xl font-[family-name:var(--font-display)] text-4xl leading-tight text-balance sm:text-5xl">
            {post.title}
          </h1>
          {post.authorName ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>By {post.authorName}</span>
              {post.sharedByAuthorName ? (
                <>
                  <span className="h-1 w-1 rounded-full bg-border" />
                  <span>Reposted by {post.sharedByAuthorName}</span>
                </>
              ) : null}
            </div>
          ) : null}
          <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
            Full post view normalized from the repository RSS feed. Original feed
            delivery remains handled separately by GitHub Pages and Power Automate.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <article className="overflow-hidden rounded-[2rem] border border-border/60 bg-card/90 shadow-panel backdrop-blur">
          {post.attachments.length > 0 ? (
            <div className="border-b border-border/70 bg-muted/50 p-3">
              <AttachmentGallery attachments={post.attachments} title={post.title} />
            </div>
          ) : null}

          <div className="space-y-8 p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>{formatDate(post.pubDate)}</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>{formatRelativeTime(post.pubDate)}</span>
            </div>

            <div className="space-y-5">
              <p className="text-base leading-8 text-foreground/90 whitespace-pre-wrap">
                {post.content}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <a
                href={post.link}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  buttonVariants({ variant: "default" }),
                  "shadow-lg shadow-primary/20"
                )}
              >
                Open original LinkedIn post
                <ExternalLink className="h-4 w-4" />
              </a>
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
            </div>
          </div>
        </article>

        <aside className="space-y-6">
          <Card className="border-border/70 bg-card/85 backdrop-blur">
            <CardContent className="space-y-4 p-6">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Metadata
                </p>
                <h2 className="text-lg font-semibold">Feed context</h2>
              </div>

              <dl className="space-y-4 text-sm">
                <div className="space-y-1">
                  <dt className="text-muted-foreground">Post ID</dt>
                  <dd className="break-all text-foreground">{post.id}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-muted-foreground">Author</dt>
                  <dd className="text-foreground">{post.authorName || "Unknown"}</dd>
                </div>
                {post.sharedByAuthorName ? (
                  <div className="space-y-1">
                    <dt className="text-muted-foreground">Reposted by</dt>
                    <dd className="text-foreground">{post.sharedByAuthorName}</dd>
                  </div>
                ) : null}
                <div className="space-y-1">
                  <dt className="text-muted-foreground">Published</dt>
                  <dd className="text-foreground">{formatDate(post.pubDate)}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-muted-foreground">Attachments</dt>
                  <dd className="text-foreground">{post.attachments.length}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-muted-foreground">Source feed</dt>
                  <dd className="text-foreground">{feed.feedTitle}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <GuidancePanel compact={false} />

          <Card className="border-border/70 bg-card/85 backdrop-blur">
            <CardContent className="space-y-4 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Original source
              </p>
              <p className="text-sm leading-7 text-muted-foreground">
                The dashboard consumes the RSS feed only. It does not generate the
                feed, post to Teams, or modify the Power Automate flow.
              </p>
              <a
                href={post.link}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "w-full justify-center"
                )}
              >
                Open on LinkedIn
                <ExternalLink className="h-4 w-4" />
              </a>
            </CardContent>
          </Card>
        </aside>
      </section>
    </main>
  );
}
