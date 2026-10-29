# ribbon-plus

A fork of [ribbon](https://github.com/robonuggets/ribbon) by Jay E (MIT, see `LICENSE`).

A usage band above the prompt. It shows how much of your 7-day and 5-hour usage is left, what Claude has been doing lately, and, when opened all the way, what the session costs and how fast it burns.

It has three sizes. The arrows on the right move between them, and `/ribbon-plus` cycles through them. The size you pick is remembered across sessions.

## Tiny

One quiet row: bars for each window, the cache countdown, and an activity strip that fills the rest of the row. `▲` opens mid.

![Tiny: one row of bars, the cache countdown and an activity strip](assets/tiny.png)

## Mid

A card for each window with the percent left, a bar and the reset time, plus a card of recent activity. `▼` goes back to tiny, `▲` opens large.

![Mid: cards for 7 day and 5 hour usage, and recent activity](assets/mid.png)

## Large

The mid cards over a full-width panel: how long the cache has been idle, how much context it holds, and what the next message costs on each model (yours is marked YOU). On the right are the session's figures: cost so far, session length, and how fast the 5-hour window is burning. When the pane is wide enough, a second column adds context fill over time, the warm-cache streak, and the current turn's tool calls. `▼` goes back to mid.

![Large: the cards over a panel with the cache, next-message costs and session stats](assets/large.png)

## Notes

- Bars run from green to red as a window drains. A window under 15% is marked LOW.
- Every size follows the pane's width.
- The drawings are sized for the Claude desktop app. The terminal gets the text form of tiny and mid.
- Turn the original ribbon off before installing this, so two bands don't show.

The embedded font is [Outfit](https://github.com/Outfitio/Outfit-Fonts), under the SIL Open Font License 1.1.
