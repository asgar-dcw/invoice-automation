export type PaymentMethod = 'bank' | 'credit_card' | 'both';

export interface EmailConfigRecord {
  company_name: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  message: string;
  manual_attachment: string;
}

export interface ClientRow {
  client_name: string;
  ar_email: string;
  payment_method: PaymentMethod;
  manual_attachment: string;
  selected: boolean;
  emailConfig?: EmailConfigRecord;
  hasDuplicateWarning?: boolean;
}

export interface WebhookPayload {
  trigger: 'manual';
  month: string;
  triggered_by: string;
  clients: WebhookClient[];
}

export interface WebhookClient {
  client_name: string;
  payment_method: string;
  ar_email: string;
  manual_attachment: 'yes' | 'no';
}

export type ClientProcessingStep =
  | 'pending'
  | 'finding_qb'
  | 'sending_ar'
  | 'draft_created'
  | 'skipped'
  | 'new_client_needs_harvest_copy'
  | 'error';

export interface ProgressRow {
  client_name: string;
  step: 'processing' | 'draft_created' | 'skipped' | 'new_client_needs_harvest_copy';
  updated_at: string;
}

export interface ClientProcessingStatus {
  client_name: string;
  step: ClientProcessingStep;
  message: string;
  error?: string;
}

export interface RunHistoryRecord {
  date: string;
  month: string;
  triggered_by: string;
  clients_processed: string;
  client_count: number;
  total_amount: number;
  status: string;
  execution_id: string;
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}
