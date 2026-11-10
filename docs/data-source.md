# Data source

Checked Nov 10, 2026.

## Chosen path: the public Sessionize API (no scraping needed)

The LF schedule page is a WordPress block (`sessionize-blocks/sessionize-schedule`) that carries its config in a `data-sched-config` attribute:

```json
{
  "sessionizeAllDataUrl": "https://sessionize.com/api/v2/svi82w6c/view/All",
  "sessionizeApiCode": "svi82w6c",
  "sessionizePublicSlug": "kubecon-cloudnativecon-north-america-2026",
  "primaryColorOverrides": { "Security": "#26d0d9", "...": "..." },
  "hiddenFilterCategories": ["Session Format", "PLT Project", "Lightning Talk Topic", "Subtopic", "CNCF Projects", "Is Sponsored Keynote"]
}
```

- **Endpoint:** `GET https://sessionize.com/api/v2/svi82w6c/view/All`. It is the public, documented, unauthenticated API: about 2 MB of JSON with `sessions`, `speakers`, `questions`, `categories` and `rooms`. Responses carry `Access-Control-Allow-Origin: *` and `Cache-Control: public, max-age=162`.
- **Session count:** 601 sessions, all `status: "Accepted"`. The LF HTML holds the same 601 `data-session-id` blocks.
- **Stable IDs: yes.** Every session has a numeric Sessionize `id` (for example `1367757`), the same one the LF page uses in `?id=`. The title+day hash in `scraper/src/ids.ts` is only a fallback.
- **Times:** `startsAt` and `endsAt` are venue wall time with no offset (`2026-11-10T09:33:00`). The scraper adds the America/Denver offset (`-07:00` in November).
- **Speakers:** structured records with `Company`, `Speaker Title` and `Company Override` question answers, so the ambiguous HTML speaker line never needs parsing. One session-level answer, `Speaker Name Display`, overrides the card's speaker text (used on 2 sessions).
- **Category colours:** not in the API. They come from the LF page's `primaryColorOverrides`, copied into `events/kccncna2026.json`.
- **Fixture:** `scraper/fixtures/sessionize-all-2026-11-10.json.gz`.

## Facets and URL slugs

The LF page builds its filters on the client from the API's category groups, and it builds two more groups itself (Date and Location). It writes them to the URL as `slug(groupTitle)=slug(item)|slug(item)`, where `slug` lowercases the text, turns `+` into `plus` and `&` into `and`, and replaces every other run of non-alphanumerics with `-`. `shared/slug.ts` is a copy of that function.

| URL key | Source | Notes |
| --- | --- | --- |
| `all-sessions` | Category group "All Sessions" (30 items) | Coloured chips |
| `audience-level` | "Audience Level" | Beginner, Advanced, Any Level |
| `cncf-projects` | "CNCF Projects" (104 items) | Hidden on the LF page; shown here as Project |
| `subtopic` | "SubTopic" (21 items) | Hidden on LF; shown as Tags (BoF, Network Nook, Cloud Native University, ...) |
| `end-user-programming` | "End User Programming" | End User Talk |
| `solutions-showcase-programming` | "Solutions Showcase Programming" | Learning Lounge |
| `sponsored` | "Is Sponsored Keynote", plus any session whose abstract had the sponsor data-sharing disclosure | The disclosure is stripped from the abstract |
| `date` | Derived: `wed-nov-11` | Matches the LF Date filter |
| `venue` | Derived: first part of the room name | |
| `location` | Derived: the full room path | The LF Location slugs are unverified (its options were collapsed) |
| `slides` | `uploaded` when a Presentation Slides answer exists | Same as LF `slides=uploaded` |

The LF page uses `search` for free text and `id` for the open session, and spellbook uses the same names, so a URL works on both sites. This replaces the `q` and `s` placeholders in DESIGN.md.

## Fallbacks

- The HTML scrape (path 2) is not built. The API is the same data the LF page renders, so if the API breaks, the page breaks with it.
- The server never replaces `schedule.json` with one holding fewer than 80% of the previous run's sessions, and it keeps `schedule.last-good.json` (path 3).
