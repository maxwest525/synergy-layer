UPDATE public.tool_systems
   SET enabled_state = 'enabled',
       implemented_state = 'implemented',
       verification_state = 'live_proven',
       aoos_connection_state = 'callable'
 WHERE stable_key IN ('api.firecrawl','api.perplexity');

UPDATE public.tool_systems
   SET aoos_connection_state = 'not_connected'
 WHERE aoos_connection_state = 'queued';