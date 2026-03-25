import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-4 py-16 sm:px-6 lg:px-8">
      <Card className="w-full border-border/70 bg-card/90 shadow-panel backdrop-blur">
        <CardHeader className="space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
            <SearchX className="h-6 w-6" />
          </div>
          <CardTitle className="font-[family-name:var(--font-display)] text-3xl">
            Post not found
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 text-sm text-muted-foreground">
          <p>
            The requested post is not present in the current RSS feed snapshot.
            It may have been rotated out of the latest items.
          </p>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
