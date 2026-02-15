# Strategic Bets Evaluation: Federation vs Bandcamp

## Context

Two potential directions for NJ beyond the current single-instance model. Evaluated Feb 15, 2026.

## Option 1: Federated NJ Network + ATProto

**Pitch:** DJs and labels run their own NJ instances, users roam between them with a single ATProto identity.

**Strengths:**
- Philosophically aligned — NJ is already about owning your music, federation extends that to owning your infrastructure
- Each instance is self-sustaining (host pays for their own Navidrome/server)
- Unique positioning — nobody is doing "federated listening parties"
- ATProto's identity portability is genuinely useful (one login, many rooms)

**Weaknesses:**
- The core problem it solves is unclear. NJ rooms work great as single-instance. Federation helps when you want to discover strangers' rooms, which is a fundamentally different product (music social network vs. listening with friends)
- Audio streams from Navidrome — users need credentials on each instance. ATProto gives identity but not music access. Guest streaming protocol would raise licensing questions
- DJs and labels don't want to run servers. The overlap of "Navidrome hosters" and "professional DJs/labels" is approximately zero
- ATProto is designed for social data (posts, follows, repos), not real-time media sync — fighting the protocol rather than leveraging it
- Massive technical surface area — cross-instance room discovery, relay infrastructure, identity resolution, permission models

**Key question:** Who needs to be in rooms across multiple NJ instances? Friends are already on the same instance. Strangers discovering music is a much bigger product with much bigger legal exposure.

**Verdict:** Strong vision, premature. Only becomes valuable at a scale NJ hasn't reached, and the technical/legal costs are enormous.

## Option 2: Bandcamp Integration

**Pitch:** Labels and producers use NJ to host listening parties for their releases, with direct Bandcamp links for purchasing.

**Strengths:**
- Natural audience overlap — Bandcamp users and NJ users are the same people (indie, FLAC, own-your-music)
- No licensing conflict — most Bandcamp records can already be streamed for free. Payment is for downloading files or physical copies. NJ doesn't change the economics, it just makes listening social
- Social listening drives more sales than solo browsing — group enthusiasm is contagious. Someone in a listening party saying "this track is insane" converts better than a lone browser tab
- Labels control the promotional window — keep the album on their Navidrome for days/weeks after release, remove it when they want. Fans who want to keep listening buy on Bandcamp
- Clear value exchange — labels get a better promotional tool than posting a link on Twitter, users get social discovery, Bandcamp gets sales
- "Listening party for a new release" is an organic use case that already exists on Twitter/Discord — NJ just does it better with synchronized playback, queue, reactions

**Weaknesses:**
- Bandcamp's API is extremely limited (basically nonexistent for catalog access)
- Bandcamp was acquired by Songtradr (2023), future direction uncertain
- Labels need their own Navidrome instance with the album loaded — that's friction
- The partnership pitch to Bandcamp requires demonstrating NJ drives meaningful sales, which requires scale NJ doesn't have yet
- Bandcamp already launched their own listening party feature — labels that care about promotion may already use that

**Key opportunity:** The strongest version would make Navidrome setup trivially easy for labels — a one-click "launch a listening room for this album" that provisions a temporary Navidrome + NJ instance, auto-loads the tracks, and self-destructs after the label's chosen window. That's closer to a managed platform than what NJ is today.

**Verdict:** Cleaner bet than federation. Lower technical complexity, clearer value proposition, no licensing conflicts. Main challenge is reducing setup friction for labels.

## Recommendation

Bandcamp integration is the stronger near-term bet. Federation is a long-term vision that only makes sense after significant user growth.

Immediate low-effort step: detect if a track exists on Bandcamp and show a purchase link in the NJ UI. No partnership needed, hours of work, nice touch.

Larger strategic step: make it trivially easy for a label to spin up a Navidrome + NJ instance for a release listening party, with Bandcamp links baked in.
