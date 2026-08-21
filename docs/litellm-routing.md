# Routing model calls through LiteLLM

Every model call in the OS used to go through the Lovable AI Gateway, except the
wording proposals, which went straight to Google's own Gemini endpoint. That was
two provider accounts, one runtime dependency to cut, and no way to use prompt
caching on either.

All of them now route through a self-hosted LiteLLM proxy when one is
configured, with OpenRouter behind it. Until it is configured, nothing changes:
the old paths still serve, and the connectors panel says which one is being
used.

## What to set

Two variables switch the whole estate over. Set them where the app's other
server secrets live, not in `.env` — that file is committed and holds only
public Supabase config.

| Variable | What it is |
| --- | --- |
| `LITELLM_BASE_URL` | Your proxy, e.g. `https://litellm.marky.systems`. The `/v1` suffix is added if you leave it off, and a trailing slash is fine. |
| `LITELLM_API_KEY` | A LiteLLM virtual key (`sk-…`). Required — without it the app keeps using the old route rather than sending an unauthenticated request, because a proxy reachable without a key is one anyone can spend your OpenRouter credit through. |

`LITELLM_PROXY_API_BASE` and `LITELLM_PROXY_API_KEY` are accepted as aliases, so
LiteLLM's own env names work unchanged.

### Optional

| Variable | Default | What it is |
| --- | --- | --- |
| `LITELLM_MODEL_REASONING` | `google/gemini-3.1-pro-preview` | The model for the agent composer and action prioritisation. |
| `LITELLM_MODEL_FAST` | `google/gemini-3.6-flash` | The model behind the composer's "Fast" choice. |
| `LITELLM_MODEL_WORDING` | `google/gemini-3.6-flash` | The model that writes title, H1 and meta description proposals. |
| `LITELLM_REFERER` | this repository | Sent as `HTTP-Referer`. OpenRouter attributes traffic by it on your dashboard. |
| `LITELLM_APP_TITLE` | `Marky` | Sent as `X-Title`, same purpose. |

The defaults are OpenRouter slugs. If your `config.yaml` names its models
something else, set the overrides rather than editing the code — the browser can
still only ever name a role (`auto`, `reasoning`, `fast`), never a model, so a
tampered request cannot reach an arbitrary model either way.

## Prompt caching

This is the reason to route through the proxy rather than around it.

Caching only ever applies to a prefix that is **byte-identical between calls**.
Every model request the app makes is built as a fixed system message followed by
whatever changes — the operator's conversation, or one page's evidence — so the
system message is marked with a `cache_control` breakpoint and nothing else is.
Marking a later message would move the breakpoint every turn and cache nothing.

Three things follow from that, and they are worth knowing before you change a
prompt:

- **Editing a system prompt invalidates its cache.** That is correct behaviour,
  not a bug, but it means a one-word tweak costs a full re-read on the next call.
- **A prefix under roughly a thousand tokens is not marked at all.** Providers
  refuse to cache below that, and a breakpoint there is billed as a write with
  no read to follow.
- **The wording call could not cache before this change**, because the system
  instructions and the page's evidence were concatenated into one string. They
  are now separate messages, which is what made the prefix stable.

What the cache actually saved comes back on the response, read from whichever
field the provider used — OpenAI's `prompt_tokens_details.cached_tokens` or
Anthropic's `cache_read_input_tokens`. A provider that reports neither yields
`null`, which is not a measured zero and is not shown as one.

The Lovable gateway exposes no cache-breakpoint field, so on that route the
breakpoint is not sent. Marking a prefix a gateway ignores would read on screen
as a saving that never happened.

## What this does not touch

`LOVABLE_API_KEY` is still required for **Google Search Console**. That is a data
gateway, not a model gateway — it proxies the Search Console API, and nothing
about LiteLLM replaces it. Cutting Lovable out of the runtime entirely needs a
direct Search Console credential, which is separate work.

`GEMINI_API_KEY` stays useful too: it serves the wording proposals until the
proxy is configured, and it is the credential behind embeddings, which do not
route through here.

## Checking it worked

The connectors panel lists **LiteLLM proxy** with its base URL and reasoning
model. Its probe calls the proxy's own `/v1/models`, which answers with the
models you configured and costs nothing upstream — so a green light there means
the proxy is reachable and the key is right, and nothing more. Configured is not
connected, and connected is not proven.

## The server side, as actually deployed (2026-08-21)

The proxy runs on the self-host box (`ssh selfhost`, 212.227.242.130), where
Caddy already terminates TLS for the other `marky.systems` services.

| Piece | Where | What it is |
| --- | --- | --- |
| Container | `/root/litellm/docker-compose.yml` | `ghcr.io/berriai/litellm:main-stable`, bound to `127.0.0.1:4000`, `restart: unless-stopped`. |
| Config | `/root/litellm/config.yaml` | A wildcard passthrough: the app's OpenRouter slugs go through unchanged (`model_name: "*"` → `openrouter/*`), so `cache_control` markers arrive at the provider as sent. |
| Secrets | `/root/litellm/.env` (root-only, never committed) | `LITELLM_MASTER_KEY` (generated on the box) and `OPENROUTER_API_KEY` (set by the operator). |
| TLS + hostname | `/etc/caddy/Caddyfile` (`litellm.marky.systems { reverse_proxy 127.0.0.1:4000 }`) | Caddy issues the certificate automatically once DNS resolves. Pre-change backup at `Caddyfile.bak-litellm`. |
| DNS | name.com, A record `litellm.marky.systems → 212.227.242.130` | Individual records, no wildcard — the record is the one manual step. |

**Stated simplification:** there is no database behind the proxy, so LiteLLM
virtual keys are unavailable; the app authenticates with the master key itself.
For a single-operator deployment that is the same trust boundary. If more keys,
per-key budgets, or key rotation are ever wanted, add LiteLLM's Postgres and
mint a virtual key — the app-side variables do not change shape.

Operations, all from `ssh selfhost`, working directory `/root/litellm`:
`docker compose restart` after editing `.env` · `docker logs litellm` for the
proxy's own account of a failing call · `curl -s http://127.0.0.1:4000/health/liveliness`
answers 200 without touching OpenRouter.
