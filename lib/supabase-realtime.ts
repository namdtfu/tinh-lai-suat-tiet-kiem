import { createClient, RealtimeChannel } from "@supabase/supabase-js";
import { CloudSession, CloudStateRow } from "@/lib/supabase-rest";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

export type CloudRealtimeStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

type RealtimeCloudRow<T> = CloudStateRow<T> & {
  user_id: string;
};

type SubscribeCloudStateOptions<T> = {
  onChange: (row: CloudStateRow<T>) => void;
  onStatus: (status: CloudRealtimeStatus) => void;
  session: CloudSession;
};

export function subscribeToCloudState<T>({
  onChange,
  onStatus,
  session,
}: SubscribeCloudStateOptions<T>) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    onStatus("error");
    return () => undefined;
  }

  const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  let channel: RealtimeChannel | null = null;
  let disposed = false;

  onStatus("connecting");
  void client.realtime
    .setAuth(session.accessToken)
    .then(() => {
      if (disposed) return;

      channel = client
        .channel(`user-app-state-${session.user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            filter: `user_id=eq.${session.user.id}`,
            schema: "public",
            table: "user_app_state",
          },
          (payload) => {
            const row = payload.new as Partial<RealtimeCloudRow<T>>;
            if (
              row.user_id !== session.user.id ||
              typeof row.updated_at !== "string" ||
              !("data" in row)
            ) {
              return;
            }
            onChange({ data: row.data as T, updated_at: row.updated_at });
          },
        )
        .subscribe((status) => {
          if (disposed) return;
          if (status === "SUBSCRIBED") onStatus("connected");
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            onStatus("error");
          } else if (status === "CLOSED") {
            onStatus("disconnected");
          }
        });
    })
    .catch(() => {
      if (!disposed) onStatus("error");
    });

  return () => {
    disposed = true;
    if (channel) void client.removeChannel(channel);
  };
}
