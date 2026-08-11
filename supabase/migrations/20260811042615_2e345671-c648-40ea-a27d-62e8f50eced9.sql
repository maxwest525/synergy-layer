UPDATE public.assets
   SET external_ref = 'https://trumoveinc.com'
 WHERE kind = 'website'
   AND name = 'Primary marketing site'
   AND external_ref = 'https://example.com';

UPDATE public.assets
   SET name = 'trumoveinc.com'
 WHERE kind = 'domain'
   AND name = 'example.com';