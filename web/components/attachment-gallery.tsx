import { ExternalLink, FileText, PlayCircle } from "lucide-react";

import type { NormalizedAttachment } from "@/lib/feed";
import { cn } from "@/lib/utils";

type AttachmentGalleryProps = {
  attachments: NormalizedAttachment[];
  title: string;
  compact?: boolean;
};

export function AttachmentGallery({
  attachments,
  title,
  compact = false
}: AttachmentGalleryProps) {
  if (attachments.length === 0) {
    return null;
  }

  const visibleAttachments = compact ? attachments.slice(0, 4) : attachments;
  const remainingCount = compact ? attachments.length - visibleAttachments.length : 0;

  return (
    <div
      className={cn(
        "grid gap-3",
        compact
          ? visibleAttachments.length === 1
            ? "grid-cols-1"
            : "grid-cols-2"
          : "sm:grid-cols-2"
      )}
    >
      {visibleAttachments.map((attachment, index) => (
        <AttachmentTile
          key={`${attachment.type}-${attachment.url || attachment.thumbnailUrl || index}`}
          attachment={attachment}
          postTitle={title}
          compact={compact}
          overlayCount={remainingCount > 0 && index === visibleAttachments.length - 1 ? remainingCount : 0}
        />
      ))}
    </div>
  );
}

function AttachmentTile({
  attachment,
  postTitle,
  compact,
  overlayCount
}: {
  attachment: NormalizedAttachment;
  postTitle: string;
  compact: boolean;
  overlayCount: number;
}) {
  const label = attachment.title || defaultAttachmentLabel(attachment.type, postTitle);
  const href = attachment.url || attachment.thumbnailUrl || undefined;
  const content = (
    <div
      className={cn(
        "group relative overflow-hidden rounded-[1.5rem] border border-border/70 bg-card/75",
        compact ? "min-h-40" : "min-h-56"
      )}
    >
      {renderAttachmentBody(attachment, label, compact)}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent p-3 text-white">
        <div className="flex items-center justify-between gap-3">
          <span className={cn("font-medium", compact ? "line-clamp-2 text-xs" : "line-clamp-2 text-sm")}>
            {label}
          </span>
          {href ? <ExternalLink className="h-4 w-4 shrink-0 opacity-90" /> : null}
        </div>
      </div>
      {overlayCount > 0 ? (
        <div className="absolute right-3 top-3 rounded-full bg-black/75 px-3 py-1 text-xs font-semibold text-white">
          +{overlayCount}
        </div>
      ) : null}
    </div>
  );

  if (!href) {
    return content;
  }

  return (
    <a href={href} target="_blank" rel="noreferrer" className="block">
      {content}
    </a>
  );
}

function renderAttachmentBody(
  attachment: NormalizedAttachment,
  label: string,
  compact: boolean
) {
  if (attachment.type === "image") {
    return (
      <img
        src={attachment.thumbnailUrl || attachment.url || ""}
        alt={label}
        className={cn(
          "h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]",
          compact ? "min-h-40" : "min-h-56"
        )}
      />
    );
  }

  if (attachment.type === "video") {
    if (attachment.thumbnailUrl) {
      return (
        <>
          <img
            src={attachment.thumbnailUrl}
            alt={label}
            className={cn(
              "h-full w-full object-cover",
              compact ? "min-h-40" : "min-h-56"
            )}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur">
              <PlayCircle className="h-7 w-7" />
            </div>
          </div>
        </>
      );
    }

    return (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center gap-3 bg-muted/50 p-6 text-center text-foreground",
          compact ? "min-h-40" : "min-h-56"
        )}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-card text-foreground shadow-sm">
          <PlayCircle className="h-7 w-7" />
        </div>
        <p className={cn(compact ? "text-xs" : "text-sm", "font-medium")}>{label}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full flex-col justify-between bg-muted/45 p-5",
        compact ? "min-h-40" : "min-h-56"
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-card text-foreground shadow-sm">
        <FileText className="h-6 w-6" />
      </div>
      <div className="space-y-2">
        <p className={cn(compact ? "text-xs" : "text-sm", "font-semibold text-foreground")}>
          {label}
        </p>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          Document
        </div>
      </div>
    </div>
  );
}

function defaultAttachmentLabel(type: NormalizedAttachment["type"], postTitle: string) {
  if (type === "image") {
    return `${postTitle} image`;
  }

  if (type === "video") {
    return `${postTitle} video`;
  }

  return `${postTitle} document`;
}
