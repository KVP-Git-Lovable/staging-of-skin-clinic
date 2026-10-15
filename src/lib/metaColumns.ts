// The browser may not read token columns (access_token_enc, page_token_enc): column-level
// grants omit them, so `select("*")` on these tables is denied. Always list columns.
export const CONNECTION_COLUMNS =
  "id, platform, external_user_id, external_user_name, business_id, business_name, token_expires_at, scopes, default_page_id, default_instagram_id, default_ad_account_id, default_ad_instagram_id, default_ad_instagram_username, status, last_synced_at, connected_by, created_at, updated_at";

export const PAGE_COLUMNS =
  "id, platform, connection_id, page_id, page_name, category, picture_url, instagram_id, instagram_username, created_at, updated_at";
