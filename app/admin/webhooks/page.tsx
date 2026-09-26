import { utcTimestamp } from "@/lib/display";

import { Webhook } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/admin/empty-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function WebhooksPage() {
  const supabase = createAdminSupabaseClient();
  const [{ data: events }, { data: stores }] = await Promise.all([
    supabase
      .from("webhook_events")
      .select(
        "id, store_id, topic, status, error_message, created_at, processed_at",
      )
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("stores").select("id, name"),
  ]);
  const names = new Map((stores ?? []).map((store) => [store.id, store.name]));
  const processed = (events ?? []).filter(
    (event) => event.status === "processed",
  ).length;
  const failed = (events ?? []).filter(
    (event) => event.status === "failed",
  ).length;
  return (
    <main className="space-y-6 p-4 sm:p-6">
      <section>
        <Badge variant="secondary">
          <Webhook />
          Webhooks
        </Badge>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          Shopify event health.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Integration events received from Shopify: delivery, signature
          verification, and order processing.
        </p>
      </section>
      <section className="grid gap-4 sm:grid-cols-3">
        <Summary
          label="Recent events"
          value={(events?.length ?? 0).toString()}
        />
        <Summary label="Processed" value={processed.toString()} />
        <Summary
          label="Needs attention"
          value={failed.toString()}
          danger={failed > 0}
        />
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Event stream</CardTitle>
          <CardDescription>
            Webhook signatures are validated before processing. Payloads are not
            displayed here.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {events?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Topic</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="pr-6">Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="pl-6 font-medium">
                      {event.topic}
                    </TableCell>
                    <TableCell>
                      {names.get(event.store_id) ?? "Unknown"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          event.status === "failed"
                            ? "destructive"
                            : event.status === "processed"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {event.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-56 truncate text-muted-foreground">
                      {event.error_message ?? "—"}
                    </TableCell>
                    <TableCell className="pr-6 text-muted-foreground">
                      {utcTimestamp(event.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-4">
              <EmptyState
                title="No events received"
                description="Verified Shopify events will appear here once a store webhook starts sending orders."
              />
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function Summary({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p
          className={`mt-1 text-2xl font-semibold tabular-nums ${danger ? "text-red-300" : ""}`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
