import { utcTimestamp } from "@/lib/display";

import { Activity } from "lucide-react";
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

export default async function AuditPage() {
  const supabase = createAdminSupabaseClient();
  const { data: events } = await supabase
    .from("admin_audit_logs")
    .select("id, actor_email, action, details, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  return (
    <main className="space-y-6 p-4 sm:p-6">
      <section>
        <Badge variant="secondary">
          <Activity />
          Activity log
        </Badge>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          Operator actions, recorded.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your team’s administrative actions: profile changes, store updates,
          and operational decisions.
        </p>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Recent changes</CardTitle>
          <CardDescription>
            Secrets and credentials are intentionally omitted from audit detail.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {events?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Action</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead className="pr-6">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="pl-6 font-medium">
                      {event.action.replaceAll("_", " ")}
                    </TableCell>
                    <TableCell>{event.actor_email}</TableCell>
                    <TableCell className="max-w-96 truncate text-muted-foreground">
                      {JSON.stringify(event.details)}
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
                title="No activity yet"
                description="Store and routing changes will be recorded here as your team operates the router."
              />
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
