import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, sessionUserStore } from "@/api/client";
import { QueryError } from "@/components/QueryError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canAccess } from "@/lib/permissions";

type Thread = {
  _id: string;
  orderId: string;
  orderNumber: string;
  customer: { name: string; email: string };
  status: string;
  lastMessageAt: string;
  lastExcerpt: string;
  unreadCount: number;
};
type Message = {
  _id: string;
  sequence: number;
  bodyText: string;
  quotedText?: string;
  hasAttachments?: boolean;
  direction: string;
  senderKind: string;
  senderName?: string;
  deliveryState: string;
  createdAt: string;
};
type History = {
  items: Message[];
  nextCursor: number | null;
  configured: boolean;
  order: {
    _id: string;
    orderNumber: string;
    customer: { name: string; email: string };
    status: string;
  };
};
type Settings = {
  enabled: boolean;
  configured: boolean;
  provider: string;
  canConfigure: boolean;
  recipient: { id: string; name: string; email: string } | null;
  candidates: { id: string; name: string; email: string }[];
};
const timestamp = (date: string) =>
  new Date(date).toLocaleString("en-PH", { dateStyle: "short", timeStyle: "short" });

export function OrderEmailInbox({
  visible,
  initialOrderId,
  onViewOrder,
}: {
  visible: boolean;
  initialOrderId?: string;
  onViewOrder: (id: string) => void;
}) {
  const user = sessionUserStore.get();
  const scope = user?.id ?? "anonymous";
  const canSend = canAccess(user, "orders", "edit");
  const client = useQueryClient();
  const [orderId, setOrderId] = useState(initialOrderId ?? "");
  const [search, setSearch] = useState("");
  const [unread, setUnread] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { text: string; key: string }>>({});
  const [recipientId, setRecipientId] = useState("");
  const [recipientDirty, setRecipientDirty] = useState(false);
  const [height, setHeight] = useState<number>();
  const scrollPane = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const savedHeight = useRef(0);
  const lastRead = useRef("");
  const previousScope = useRef(scope);
  useEffect(() => {
    if (initialOrderId) setOrderId(initialOrderId);
  }, [initialOrderId]);
  useEffect(() => {
    if (previousScope.current !== scope) {
      setDrafts({});
      setOrderId("");
      lastRead.current = "";
      previousScope.current = scope;
    }
  }, [scope]);
  useEffect(() => {
    const changed = () => {
      setDrafts({});
      setOrderId("");
      client.removeQueries({ queryKey: ["order-inbox"] });
      client.removeQueries({ queryKey: ["order-messages"] });
    };
    window.addEventListener("miss-v-session-changed", changed);
    return () => window.removeEventListener("miss-v-session-changed", changed);
  }, [client]);
  useEffect(() => {
    const resize = () => setHeight(window.visualViewport?.height);
    resize();
    window.visualViewport?.addEventListener("resize", resize);
    return () => window.visualViewport?.removeEventListener("resize", resize);
  }, []);
  const inbox = useInfiniteQuery({
    queryKey: ["order-inbox", scope, search, unread],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api<{ items: Thread[]; nextCursor: string | null }>(
        `/orders/inbox?${new URLSearchParams({ search, unread: String(unread), ...(pageParam ? { cursor: pageParam } : {}) })}`,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: visible,
    refetchInterval: (query) => (query.state.error ? 60000 : 15000),
    refetchIntervalInBackground: false,
  });
  const settings = useQuery({
    queryKey: ["order-email-settings", scope],
    queryFn: ({ signal }) => api<Settings>("/orders/email-settings", { signal }),
    enabled: visible,
  });
  const history = useInfiniteQuery({
    queryKey: ["order-messages", scope, orderId],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api<History>(`/orders/${orderId}/messages${pageParam ? `?before=${pageParam}` : ""}`, {
        signal,
      }),
    getNextPageParam: (page) => (page.nextCursor ? String(page.nextCursor) : undefined),
    enabled: visible && Boolean(orderId),
    refetchInterval: (query) => (query.state.error ? 60000 : 15000),
    refetchIntervalInBackground: false,
  });
  const messages =
    history.data?.pages
      .flatMap((page) => page.items)
      .sort((a, b) => a.sequence - b.sequence)
      .filter(
        (message, index, all) => all.findIndex((other) => other._id === message._id) === index,
      ) ?? [];
  const order = history.data?.pages[0]?.order;
  const latest = messages.at(-1)?._id;
  const messageCount = messages.length;
  useEffect(() => {
    nearBottom.current = true;
    lastRead.current = `thread:${orderId}`;
  }, [orderId]);
  useEffect(() => {
    const pane = scrollPane.current;
    if (!pane || !messageCount) return;
    if (savedHeight.current) {
      pane.scrollTop += pane.scrollHeight - savedHeight.current;
      savedHeight.current = 0;
    } else if (nearBottom.current) pane.scrollTop = pane.scrollHeight;
    if (
      visible &&
      latest &&
      lastRead.current !== latest &&
      document.visibilityState === "visible"
    ) {
      lastRead.current = latest;
      void api(`/orders/${orderId}/messages/read`, {
        method: "PATCH",
        body: JSON.stringify({ lastReadMessageId: latest }),
      })
        .then(() => client.invalidateQueries({ queryKey: ["order-inbox", scope] }))
        .catch(() => {
          lastRead.current = "";
        });
    }
  }, [latest, messageCount, visible, orderId, client, scope]);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["order-messages", scope, orderId] });
    void client.invalidateQueries({ queryKey: ["order-inbox", scope] });
  };
  const send = useMutation({
    mutationFn: ({ id, text, key }: { id: string; text: string; key: string }) =>
      api<Message>(`/orders/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ bodyText: text, clientMessageId: key }),
      }),
    onSuccess: (_message, request) => {
      setDrafts((current) => ({
        ...current,
        [request.id]: { text: "", key: crypto.randomUUID() },
      }));
      nearBottom.current = true;
      void client.invalidateQueries({ queryKey: ["order-messages", scope, request.id] });
      void client.invalidateQueries({ queryKey: ["order-inbox", scope] });
    },
    onError: (error) => toast.error(error.message),
  });
  const retry = useMutation({
    mutationFn: (id: string) => api(`/orders/${orderId}/messages/${id}/retry`, { method: "POST" }),
    onSuccess: refresh,
    onError: (error) => toast.error(error.message),
  });
  const saveSettings = useMutation({
    mutationFn: () =>
      api("/orders/email-settings", {
        method: "PATCH",
        body: JSON.stringify({ recipientUserId: recipientId || null }),
      }),
    onSuccess: () => {
      setRecipientDirty(false);
      void settings.refetch();
      toast.success("Email notification recipient saved");
    },
    onError: (error) => toast.error(error.message),
  });
  const draft = drafts[orderId] ?? { text: "", key: "" };
  const configured = history.data?.pages[0]?.configured && settings.data?.configured;
  return (
    <section hidden={!visible} aria-label="Order email inbox" className="space-y-4">
      {settings.isError && (
        <QueryError message={settings.error.message} retry={() => void settings.refetch()} />
      )}
      {settings.data &&
        (!settings.data.enabled ||
          !settings.data.configured ||
          !settings.data.recipient ||
          settings.data.provider === "console") && (
          <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
            {!settings.data.enabled || !settings.data.configured
              ? "Email messaging needs activation and a receiving domain before messages can be sent."
              : settings.data.provider === "console"
                ? "Development only — messages are recorded, but no email is delivered."
                : "Choose a verified business recipient to receive customer messages by email. The app inbox remains available."}
          </div>
        )}
      {settings.data?.canConfigure && (
        <details className="rounded-xl border bg-white p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            Email notification recipient
          </summary>
          <p className="mt-2 text-xs text-stone-600">
            Notify an active, verified business user who can send order messages. They can reply
            using their email client.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <select
              aria-label="Email notification recipient"
              className="h-10 min-w-0 flex-1 rounded-lg border px-2 text-sm"
              value={recipientDirty ? recipientId : (settings.data.recipient?.id ?? "")}
              onChange={(event) => {
                setRecipientDirty(true);
                setRecipientId(event.target.value);
              }}
            >
              <option value="">Use business owner when eligible</option>
              {settings.data.candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name} · {candidate.email}
                </option>
              ))}
            </select>
            <Button
              onClick={() => saveSettings.mutate()}
              disabled={!recipientDirty || saveSettings.isPending}
            >
              Save recipient
            </Button>
          </div>
        </details>
      )}
      <div
        className="grid min-h-[28rem] overflow-hidden rounded-2xl border bg-white md:grid-cols-[19rem_1fr]"
        style={{
          height: height ? Math.max(300, height - 230) : "min(42rem, calc(100dvh - 15rem))",
        }}
      >
        <div className={`${orderId ? "hidden md:flex" : "flex"} min-h-0 flex-col border-r`}>
          <div className="space-y-2 border-b p-3">
            <Input
              aria-label="Search conversations"
              placeholder="Order, customer or email"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={unread}
                onChange={(event) => setUnread(event.target.checked)}
              />
              Unread only
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {inbox.isPending && (
              <p className="p-4 text-sm" role="status">
                Loading conversations…
              </p>
            )}
            {inbox.isError && (
              <QueryError message={inbox.error.message} retry={() => void inbox.refetch()} />
            )}
            {inbox.data?.pages
              .flatMap((page) => page.items)
              .map((thread) => (
                <button
                  type="button"
                  key={thread._id}
                  className={`w-full border-b p-4 text-left transition hover:bg-pink-50 ${orderId === thread.orderId ? "bg-pink-50" : ""}`}
                  onClick={() => setOrderId(thread.orderId)}
                >
                  <div className="flex justify-between gap-2">
                    <span className="truncate font-semibold">{thread.customer.name}</span>
                    {thread.unreadCount > 0 && (
                      <span
                        role="img"
                        className="rounded-full bg-pink-700 px-2 text-xs leading-5 text-white"
                        aria-label={`${thread.unreadCount} unread messages`}
                      >
                        {thread.unreadCount}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-pink-700">{thread.orderNumber}</p>
                  <p className="mt-1 truncate text-sm text-stone-600">
                    {thread.lastExcerpt || "No messages yet"}
                  </p>
                  <p className="mt-1 text-[11px] text-stone-600">
                    {timestamp(thread.lastMessageAt)}
                  </p>
                </button>
              ))}
            {inbox.isSuccess && !inbox.data.pages.some((page) => page.items.length) && (
              <p className="p-4 text-sm text-stone-600">No matching conversations.</p>
            )}
            {inbox.hasNextPage && (
              <Button
                className="m-3"
                variant="outline"
                onClick={() => void inbox.fetchNextPage()}
                disabled={inbox.isFetchingNextPage}
              >
                More conversations
              </Button>
            )}
          </div>
        </div>
        <div className={`${orderId ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-col`}>
          {!orderId ? (
            <p className="m-auto p-6 text-center text-stone-600">
              Select a conversation to view messages.
            </p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2 border-b p-3">
                <div className="min-w-0">
                  <button
                    type="button"
                    className="mb-1 text-sm text-pink-700 md:hidden"
                    onClick={() => setOrderId("")}
                  >
                    ← Conversations
                  </button>
                  <h3 className="truncate font-semibold">
                    {order?.customer.name ?? "Loading conversation…"}
                  </h3>
                  <p className="break-all text-xs text-stone-600">
                    {order?.orderNumber} · {order?.status} · {order?.customer.email}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => onViewOrder(orderId)}>
                  View order
                </Button>
              </div>
              <div
                ref={scrollPane}
                // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to focus and scroll message history.
                tabIndex={0}
                role="log"
                aria-label="Order message history"
                aria-live="polite"
                className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-stone-50 p-3 sm:p-5"
                onScroll={(event) => {
                  const el = event.currentTarget;
                  nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                }}
              >
                {history.isPending && <p role="status">Loading messages…</p>}
                {history.isError && (
                  <QueryError
                    message={history.error.message}
                    retry={() => void history.refetch()}
                  />
                )}
                {history.hasNextPage && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={history.isFetchingNextPage}
                    onClick={() => {
                      savedHeight.current = scrollPane.current?.scrollHeight ?? 0;
                      void history.fetchNextPage();
                    }}
                  >
                    Load earlier messages
                  </Button>
                )}
                {history.isSuccess && !messages.length && (
                  <p className="p-6 text-center text-sm text-stone-600">
                    No messages yet. Send an email to start this order conversation.
                  </p>
                )}
                {messages.map((message) => (
                  <article
                    key={message._id}
                    className={`max-w-[90%] rounded-2xl p-3 text-sm sm:max-w-[80%] ${message.direction === "INBOUND" ? "mr-auto border bg-white" : "ml-auto bg-pink-100"}`}
                  >
                    <p className="mb-1 text-xs font-semibold text-stone-600">
                      {message.senderName ||
                        (message.senderKind === "CUSTOMER"
                          ? order?.customer.name
                          : message.senderKind === "SYSTEM"
                            ? "Order acknowledgement"
                            : "Business")}
                    </p>
                    <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                      {message.bodyText}
                    </p>
                    {message.quotedText && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs">Show quoted text</summary>
                        <p className="mt-1 whitespace-pre-wrap break-words text-xs text-stone-600">
                          {message.quotedText}
                        </p>
                      </details>
                    )}
                    {message.hasAttachments && (
                      <p className="mt-2 text-xs">
                        Attachment received; viewing is not available here.
                      </p>
                    )}
                    <p className="mt-2 text-[10px] text-stone-600">
                      {timestamp(message.createdAt)} ·{" "}
                      {message.deliveryState === "DEVELOPMENT"
                        ? "Development only — no email sent"
                        : message.deliveryState.toLowerCase()}
                    </p>
                    {canSend && message.deliveryState === "FAILED" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        disabled={retry.isPending}
                        onClick={() => retry.mutate(message._id)}
                      >
                        Retry sending
                      </Button>
                    )}
                  </article>
                ))}
              </div>
              <form
                className="space-y-2 border-t bg-white p-3"
                style={{ paddingBottom: "max(.75rem, env(safe-area-inset-bottom))" }}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (draft.text.trim() && !send.isPending)
                    send.mutate({ id: orderId, text: draft.text, key: draft.key });
                }}
              >
                {!order?.customer.email && history.isSuccess && (
                  <p className="text-xs text-amber-800">
                    Email messaging unavailable — no customer email was supplied.
                  </p>
                )}
                {!canSend && (
                  <p className="text-xs text-stone-600">
                    Your role can view messages. Sending requires order edit access.
                  </p>
                )}
                <label htmlFor="order-email-message" className="sr-only">
                  Email message
                </label>
                <textarea
                  id="order-email-message"
                  rows={2}
                  maxLength={10000}
                  className="block max-h-32 w-full resize-y rounded-xl border p-3 text-base"
                  placeholder="Write an email message…"
                  disabled={!canSend || !order?.customer.email || !configured || send.isPending}
                  value={draft.text}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [orderId]: {
                        text: event.target.value,
                        key: current[orderId]?.key || crypto.randomUUID(),
                      },
                    }))
                  }
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-stone-600">
                    Delivered by email · {draft.text.length}/10,000
                  </span>
                  <Button
                    type="submit"
                    disabled={
                      !canSend ||
                      !configured ||
                      !order?.customer.email ||
                      !draft.text.trim() ||
                      send.isPending
                    }
                  >
                    {send.isPending ? "Sending…" : "Send message"}
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
