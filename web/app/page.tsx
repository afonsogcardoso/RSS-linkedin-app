import { FeedDashboard } from "@/components/feed-dashboard";
import { loadFeed } from "@/lib/feed";

export const revalidate = 900;

export default async function HomePage() {
  const feed = await loadFeed();

  return <FeedDashboard feed={feed} />;
}
