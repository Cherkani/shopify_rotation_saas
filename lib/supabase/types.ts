export type Store = {
  id: string;
  name: string;
  shop_domain: string;
  checkout_url: string;
  webhook_secret_hint?: string | null;
  rotation_position: number;
  current_order_count: number;
  enabled: boolean;
  daily_revenue_target?: number;
  daily_revenue_cap?: number | null;
  pause_at_target?: boolean;
  traffic_weight?: number;
  accepting_traffic?: boolean;
  health_status?: "healthy" | "degraded" | "unavailable";
};
