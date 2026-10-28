alter table public.user_ai_settings
  add column if not exists encrypted_embedding_api_key text,
  add column if not exists embedding_base_url text;

update public.user_ai_settings
set embedding_base_url = base_url
where embedding_base_url is null;

alter table public.user_ai_settings
  alter column embedding_base_url set default 'https://api.jina.ai/v1';
