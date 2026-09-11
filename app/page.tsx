import Link from "next/link";

import {
  filterLabels,
  queueFilters,
  type QueueFilter,
} from "~/lib/review-schema";
import {
  getSubmissionCounts,
  listSubmissions,
} from "~/services/submission-service";
import { ReviewQueue } from "~/review-queue";

/** The queue reads the database on every request, so it is never cached. */
export const dynamic = "force-dynamic";

function resolveFilter(value: string | string[] | undefined): QueueFilter {
  return queueFilters.includes(value as QueueFilter)
    ? (value as QueueFilter)
    : "all";
}

export default async function ReviewDeskPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const status = resolveFilter((await searchParams).status);

  const queue = listSubmissions(status === "all" ? {} : { status });
  const counts = getSubmissionCounts();

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link href="/" className="brand" aria-label="Creator Army review desk">
          <span className="brand-mark" aria-hidden="true">
            CA
          </span>
          <span>Creator Army</span>
        </Link>
        <span className="workspace-name">Campaign operations</span>
      </header>

      <div className="workspace">
        <aside className="queue-sidebar">
          <div>
            <h1>Review desk</h1>
            <p className="sidebar-copy">
              Approve creator content, or send it back with feedback on what to
              change.
            </p>
          </div>

          <nav className="queue-navigation" aria-label="Filter by status">
            <p className="nav-heading">Status</p>
            {queueFilters.map((filter) => (
              <Link
                key={filter}
                href={filter === "all" ? "/" : `/?status=${filter}`}
                className={status === filter ? "queue-link active" : "queue-link"}
                aria-current={status === filter ? "page" : undefined}
              >
                <span>{filterLabels[filter]}</span>
                <span className="queue-count">{counts[filter]}</span>
              </Link>
            ))}
          </nav>
        </aside>

        <section className="queue-content" aria-labelledby="queue-heading">
          <div className="queue-heading-row">
            <h2 id="queue-heading">{filterLabels[status]}</h2>
            <span className="result-count">
              {queue.length} {queue.length === 1 ? "submission" : "submissions"}
            </span>
          </div>

          <ReviewQueue queue={queue} status={status} />
        </section>
      </div>
    </main>
  );
}
