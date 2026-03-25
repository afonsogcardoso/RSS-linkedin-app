import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded-[2rem] border border-border/60 bg-card/85 p-8 shadow-panel backdrop-blur">
        <Skeleton className="mb-4 h-6 w-40 rounded-full" />
        <Skeleton className="mb-3 h-14 w-full max-w-3xl rounded-3xl" />
        <Skeleton className="h-6 w-full max-w-2xl rounded-2xl" />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index} className="border-border/70 bg-card/80 backdrop-blur">
            <CardHeader>
              <Skeleton className="h-4 w-24 rounded-full" />
              <Skeleton className="h-10 w-28 rounded-2xl" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-40 rounded-full" />
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card
              key={index}
              className="overflow-hidden border-border/70 bg-card/85 backdrop-blur"
            >
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="p-6">
                  <Skeleton className="mb-4 h-4 w-36 rounded-full" />
                  <Skeleton className="mb-4 h-8 w-full max-w-2xl rounded-2xl" />
                  <Skeleton className="mb-3 h-4 w-full rounded-full" />
                  <Skeleton className="mb-3 h-4 w-full rounded-full" />
                  <Skeleton className="mb-3 h-4 w-4/5 rounded-full" />
                  <Skeleton className="mt-6 h-10 w-40 rounded-2xl" />
                </div>
                <Skeleton className="min-h-64 rounded-none lg:min-h-full" />
              </div>
            </Card>
          ))}
        </div>

        <Card className="h-fit border-border/70 bg-card/80 backdrop-blur">
          <CardHeader>
            <Skeleton className="h-6 w-40 rounded-full" />
            <Skeleton className="h-4 w-full rounded-full" />
            <Skeleton className="h-4 w-5/6 rounded-full" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full rounded-2xl" />
            ))}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
