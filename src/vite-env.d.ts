/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_N8N_WEBHOOK_URL?: string;
  readonly VITE_N8N_BASE_URL?: string;
  readonly VITE_N8N_API_KEY?: string;
  readonly VITE_GOOGLE_SHEETS_API_KEY?: string;
  readonly VITE_HARVEST_API_TOKEN?: string;
  readonly VITE_HARVEST_ACCOUNT_ID?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
