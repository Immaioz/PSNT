interface ImportMetaEnv {
  readonly BASE_URL: string
  readonly VITE_API_URL?: string
  readonly VITE_ASSET_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
