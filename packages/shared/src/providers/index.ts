// @mapgis/shared — Provider abstractions (vendor-independent interfaces)

// ── Payment ──
export interface PaymentProvider {
  createCheckout(userId: string, planType: string): Promise<{ url: string }>;
  handleWebhook(payload: unknown): Promise<{ success: boolean }>;
  getSubscription(userId: string): Promise<{ active: boolean; plan?: string } | null>;
}

// ── Email ──
export interface EmailProvider {
  sendWelcome(email: string, name: string): Promise<void>;
  sendNotification(email: string, subject: string, body: string): Promise<void>;
}

// ── Analytics ──
export interface AnalyticsProvider {
  track(event: string, properties?: Record<string, unknown>): void;
  identify(userId: string, traits?: Record<string, unknown>): void;
  group(orgId: string, traits?: Record<string, unknown>): void;
}

// ── Map (React component interface) ──
export interface MapViewProps {
  center: [number, number]; // [lat, lng]
  zoom: number;
  children?: unknown;
  onViewportChange?: (center: [number, number], zoom: number) => void;
}
