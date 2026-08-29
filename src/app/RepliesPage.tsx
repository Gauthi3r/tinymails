import { Inbox } from "lucide-react";
import { useEffect, useState } from "react";
import { NoticeStrip } from "../components/notice-strip";
import { SquircleSurface } from "../components/squircle-card";
import type { Reply } from "../domain/types";
import type { AppApi } from "./api";
import { PageFrame } from "./CampaignsPage";

export function RepliesPage({ api }: { api: AppApi }) {
  const [replies, setReplies] = useState<Reply[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void api
      .getReplies()
      .then((records) => {
        if (active) setReplies(records);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [api]);

  return (
    <PageFrame
      eyebrow="Inbox work queue"
      title="Replies"
      description="Replies and bounces appear here only after optional inbox tracking is enabled."
    >
      {error ? <NoticeStrip claim="Replies are unavailable.">Check the local Gmail connection.</NoticeStrip> : null}
      {replies === null ? <div className="h-48 animate-pulse rounded-[26px] bg-card" aria-label="Loading replies" /> : null}
      {replies?.length === 0 ? (
        <SquircleSurface className="items-center border border-border px-6 py-16 text-center shadow-[var(--shadow-resting)]">
          <span className="mb-5 grid size-11 place-items-center rounded-2xl bg-secondary text-muted-foreground">
            <Inbox className="size-5" aria-hidden="true" />
          </span>
          <h2 className="text-lg font-semibold">Inbox tracking is optional</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Send-only access keeps Gmail permissions narrow. You can enable broader inbox access later if reply and bounce tracking is useful.
          </p>
        </SquircleSurface>
      ) : null}
      {replies && replies.length > 0 ? (
        <SquircleSurface className="divide-y divide-border overflow-hidden border border-border shadow-[var(--shadow-resting)]">
          {replies.map((reply) => (
            <article key={reply.id} className="px-5 py-4 hover:bg-accent">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-medium">{reply.subject}</h2>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{reply.snippet}</p>
                </div>
                <span className="shrink-0 text-xs capitalize text-muted-foreground">{reply.kind}</span>
              </div>
            </article>
          ))}
        </SquircleSurface>
      ) : null}
    </PageFrame>
  );
}
