import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  Clock3,
  ExternalLink,
  FileText,
  ImageIcon,
  PlayCircle
} from "lucide-react";

import type { NormalizedPost } from "@/lib/feed";
import { formatDate, formatRelativeTime } from "@/lib/utils";

import { AttachmentGallery } from "@/components/attachment-gallery";
import { GuidancePanel } from "@/components/guidance-panel";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

type PostCardProps = {
  post: NormalizedPost;
};

export function PostCard({ post }: PostCardProps) {
  const imageCount = post.attachments.filter((attachment) => attachment.type === "image").length;
  const videoCount = post.attachments.filter((attachment) => attachment.type === "video").length;
  const documentCount = post.attachments.filter((attachment) => attachment.type === "document").length;

  return (
    <Card className="overflow-hidden border-border/70 bg-card/85 shadow-panel backdrop-blur">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex flex-col">
          <CardHeader className="space-y-5 p-6 sm:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                {formatDate(post.pubDate)}
              </Badge>
              <Badge variant="outline" className="gap-1.5">
                <Clock3 className="h-3.5 w-3.5" />
                {formatRelativeTime(post.pubDate)}
              </Badge>
              {imageCount > 0 ? (
                <Badge variant="secondary" className="gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5" />
                  {imageCount} image{imageCount > 1 ? "s" : ""}
                </Badge>
              ) : null}
              {videoCount > 0 ? (
                <Badge variant="secondary" className="gap-1.5">
                  <PlayCircle className="h-3.5 w-3.5" />
                  {videoCount} video{videoCount > 1 ? "s" : ""}
                </Badge>
              ) : null}
              {documentCount > 0 ? (
                <Badge variant="secondary" className="gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  {documentCount} doc{documentCount > 1 ? "s" : ""}
                </Badge>
              ) : null}
              {post.attachments.length > 1 ? (
                <Badge variant="outline">{post.attachments.length} attachments</Badge>
              ) : null}
              {post.isRecent ? (
                <Badge className="bg-success/15 text-success hover:bg-success/15">
                  New
                </Badge>
              ) : null}
            </div>

            <div className="space-y-3">
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
              <Link href={`/posts/${post.id}`} className="group block">
                <h2 className="font-[family-name:var(--font-display)] text-2xl leading-tight text-balance transition-colors group-hover:text-primary sm:text-[2rem]">
                  {post.title}
                </h2>
              </Link>
              <p className="line-clamp-4 text-sm leading-7 text-muted-foreground sm:text-base">
                {post.description}
              </p>
            </div>
          </CardHeader>

          <CardContent className="space-y-5 px-6 pb-0 sm:px-7">
            <div className="rounded-[1.5rem] border border-border/70 bg-muted/45 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Preview
              </p>
              <p className="line-clamp-8 text-sm leading-7 text-foreground/90">
                {post.content}
              </p>
            </div>

            <GuidancePanel compact />
          </CardContent>

          <CardFooter className="flex flex-wrap gap-3 p-6 sm:p-7">
            <Link href={`/posts/${post.id}`} className={buttonVariants({ variant: "default" })}>
              Open detail
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <a
              href={post.link}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline" })}
            >
              Open LinkedIn
              <ExternalLink className="h-4 w-4" />
            </a>
          </CardFooter>
        </div>

        <div className="border-l border-border/70 bg-muted/45 p-3">
          {post.attachments.length > 0 ? (
            <AttachmentGallery
              attachments={post.attachments}
              title={post.title}
              compact
            />
          ) : (
            <div className="flex h-full min-h-64 flex-col justify-between rounded-[1.5rem] border border-dashed border-border/80 bg-card/70 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
                <ImageIcon className="h-5 w-5" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">
                  Text-first post
                </p>
                <p className="text-sm leading-6 text-muted-foreground">
                  This item has no attachment metadata in the RSS feed. The
                  dashboard keeps the content visible without inventing media.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
