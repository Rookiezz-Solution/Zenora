export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  channel: string;
  readAt: string | null;
  createdAt: string;
}
