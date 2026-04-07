# Epics and Tickets

## Current Assistant Epic

### Assistant Conversation State + Refinement Memory v2

- Status: implemented
- Goal:
  - keep the recommendation assistant grounded while making short follow-up turns feel stable and intentional
- Scope delivered:
  - one lightweight persisted assistant thread state per signed-in user
  - persisted current ask constraints such as media type, mood, runtime, preferred-service restriction, and unwatched-only
  - persisted source scope such as recommendations, watchlist, library, shared-current, or shared-household
  - persisted last recommendation title keys so explanation follow-ups like `Why those?` reuse the previous set
  - persisted rejected title keys so follow-ups like `Not those` and `Give me 3 different ones` can avoid immediately resurfacing the same titles
  - subtle current-ask summary strip on the assistant page
  - reset behavior that clears transcript plus current-ask memory together

### Acceptance Notes

- The assistant should preserve a current ask across short refinement turns instead of restarting from scratch
- Explanation follow-ups should stay anchored to the previous recommendation set
- Watchlist and Library scope-switch follow-ups should reuse the current ask where possible
- Solo and group context boundaries remain enforced by the existing recommendation-context layer

## Deferred Assistant Work

- longer-lived assistant memory beyond the current ask
- multiple conversation threads per user
- clarification-question loops for low-confidence recommendation asks
- richer comparison flows such as “option 2 vs option 3”
- more advanced assistant planning and orchestration beyond grounded recommendation help

## Related Ongoing Epics

- Trakt sync review and trust-building UI
- broader provider handoff coverage with honest fallback behavior
- local Netflix history sync and unresolved-import review
