/**
 * The card's one stylesheet.
 *
 * Every part of the card -- the face, the dialog, each view -- renders into the
 * card's own shadow root (see `LightElement` in base.ts), so these rules reach
 * all of them and the theme variables need no threading through boundaries.
 * The view elements themselves are `display: contents`: the dialog's panel is
 * a flex column that its views' rows sit in directly, and the filter row is
 * held sticky against that panel.
 */

import { css } from "lit";

/** On a phone the dialog is the whole screen, as an app's page would be: the
 *  view scrolls at the top and the sections are a tab bar along the bottom,
 *  clear of the home indicator. Added last to both the card's styles and the
 *  badge's, so it wins over either's wide-screen layout. */
export const phoneDialogStyles = css`
  @media (max-width: 600px) {
    dialog:not(.picker) {
      width: 100vw;
      max-width: 100vw;
      height: 100vh;
      height: 100dvh;
      max-height: 100vh;
      max-height: 100dvh;
      margin: 0;
      border-radius: 0;
      box-shadow: none;
    }
    dialog:not(.picker)[open] { animation: sheet-in 0.22s ease-out; }
    .dialog-close { top: calc(6px + env(safe-area-inset-top, 0px)); }
    .panel { padding-top: calc(44px + env(safe-area-inset-top, 0px)); }
    .panel.tight { padding-top: calc(12px + env(safe-area-inset-top, 0px)); }
    /* The scoreboard has no line of its own to share with the close button,
       as a back button or a heading does, so it starts below it. */
    .panel > .scoreboard:first-child,
    .panel > hockey-game-view:first-child > .scoreboard:first-child { margin-top: 32px; }
    .section-switch { display: none; }
    .section-heading { display: block; }
    .dialog-nav {
      display: flex;
      order: 1;
      flex: none;
      flex-wrap: nowrap;
      gap: 0;
      padding: 4px 4px calc(6px + env(safe-area-inset-bottom, 0px));
      border-top: 1px solid var(--divider-color);
      background: var(--ha-card-background, var(--card-background-color, #fff));
    }
    .dialog-nav .bar-button {
      position: relative;
      flex: 1 1 0;
      min-width: 0;
      flex-direction: column;
      gap: 3px;
      padding: 6px 2px 4px;
      border-radius: 12px;
      background: none;
      font-size: 0.72em;
    }
    .dialog-nav .bar-button > span:not(.bar-badge) {
      max-width: 100%;
      /* The button's line-height of 1 clips descenders at this size. */
      line-height: 1.3;
    }
    .dialog-nav .bar-button ha-icon {
      --mdc-icon-size: 22px;
      padding: 3px 18px;
      border-radius: 14px;
      transition: background-color 0.15s ease;
    }
    .dialog-nav .bar-button.active { background: none; color: var(--primary-color); }
    .dialog-nav .bar-button.active ha-icon {
      background: color-mix(in srgb, var(--primary-color) 18%, transparent);
    }
    .dialog-nav .bar-badge {
      position: absolute;
      top: 2px;
      left: calc(50% + 10px);
      padding: 1px 5px;
      font-size: 0.85em;
      color: #fff;
      background: var(--error-color, #e53935);
    }
    /* The tab bar under the panel keeps clear of the home indicator. */
    .filter-bar { padding-bottom: 10px; }
    /* The club list comes up from the foot of the screen, as a phone's own
       pickers do, with the thumb already where its buttons are. */
    dialog.picker {
      width: 100vw;
      max-width: 100vw;
      max-height: 85vh;
      max-height: 85dvh;
      margin: auto 0 0;
      border-radius: 20px 20px 0 0;
    }
    dialog.picker[open] { animation: picker-up 0.26s cubic-bezier(0.2, 0.8, 0.3, 1); }
    .picker-foot { padding-bottom: calc(14px + env(safe-area-inset-bottom, 0px)); }
  }
  @keyframes sheet-in {
    from { transform: translateY(24px); opacity: 0; }
  }
  @keyframes picker-up {
    from { transform: translateY(100%); }
  }
  @media (prefers-reduced-motion: reduce) {
    dialog[open],
    dialog.picker[open] { animation: none; }
    .dialog-nav .bar-button ha-icon { transition: none; }
  }
`;

/** The card face, the dialog and every view in it. */
export const cardStyles = css`
      /* The parts the card is built from add no boxes of their own: their
         rows belong to the panel or the card they render into. */
      hockey-dialog,
      hockey-loading,
      hockey-team-picker,
      hockey-league-view,
      hockey-today-view,
      hockey-table-view,
      hockey-schedule-view,
      hockey-stats-view,
      hockey-team-view,
      hockey-recap-view,
      hockey-player-view,
      hockey-preview-view,
      hockey-game-view,
      hockey-events-view,
      hockey-results-view {
        display: contents;
      }
      ha-card { overflow: hidden; }
      .pad { padding: 16px; }
      .title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 12px 16px 0;
        font-size: 1.1em;
        font-weight: 500;
        color: var(--primary-text-color);
      }
      .view-toggle {
        flex: none;
        width: 32px;
        height: 32px;
        border: none;
        border-radius: 50%;
        background: none;
        color: var(--secondary-text-color);
        font-size: 1.5em;
        line-height: 1;
        cursor: pointer;
      }
      .view-toggle:hover {
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
      }
      .final {
        font-size: 0.72em;
        font-weight: 700;
        letter-spacing: 0.08em;
        color: var(--secondary-text-color);
        margin-bottom: 2px;
      }
      .final.won { color: var(--success-color, var(--green-color, #43a047)); }
      .final.lost { color: var(--secondary-text-color); }
      .card { position: relative; overflow: hidden; padding: 20px 16px; }
      .home-bg, .away-bg {
        position: absolute;
        top: -20%;
        width: 58%;
        opacity: 0.08;
        z-index: 0;
        pointer-events: none;
      }
      .home-bg { left: -20%; }
      .away-bg { right: -20%; }
      .content {
        position: relative;
        z-index: 5;
        display: flex;
        justify-content: space-evenly;
        align-items: center;
        text-align: center;
        gap: 8px;
      }
      .team { width: 33%; min-width: 0; }
      .team.tappable {
        cursor: pointer;
        border-radius: 12px;
        padding: 4px 2px;
        margin: -4px -2px;
        transition: background-color 0.15s ease;
      }
      .team.tappable:hover { background: rgba(127, 127, 127, 0.12); }
      .team.tappable:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 0;
      }
      @media (prefers-reduced-motion: reduce) {
        .team.tappable { transition: none; }
      }
      .crest { max-width: 88px; max-height: 80px; width: auto; }
      .placeholder { width: 88px; height: 80px; }
      .team-name {
        margin-top: 4px;
        font-size: 0.95em;
        color: var(--secondary-text-color);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .middle { min-width: 0; }
      .score {
        font-size: 2.6em;
        font-weight: 500;
        line-height: 1.1;
        color: var(--primary-text-color);
      }
      .period, .venue {
        font-size: 0.9em;
        color: var(--secondary-text-color);
      }
      .period { margin-top: 2px; }
      .venue { margin-top: 10px; }
      .tv {
        margin-top: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        font-size: 0.82em;
        color: var(--secondary-text-color);
        min-width: 0;
      }
      .tv span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .tv ha-icon,
      .fixture-tv ha-icon {
        --mdc-icon-size: 14px;
        flex: none;
      }
      .fixture-tv {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .live-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 0.72em;
        font-weight: 700;
        letter-spacing: 0.08em;
        color: var(--error-color, #e53935);
        margin-bottom: 2px;
      }
      .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: currentColor;
        animation: pulse 1.6s ease-in-out infinite;
      }
      @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
      @media (prefers-reduced-motion: reduce) { .dot { animation: none; } }
      .kickoff {
        font-size: 1.6em;
        line-height: 1.2;
        color: var(--primary-text-color);
      }
      .weekday { font-size: 1.15em; color: var(--primary-text-color); }
      .date { font-size: 0.9em; color: var(--secondary-text-color); }
      .shots {
        margin-top: 1px;
        font-size: 0.8em;
        font-variant-numeric: tabular-nums;
        color: var(--secondary-text-color);
        white-space: nowrap;
      }
      .footer {
        position: relative;
        z-index: 5;
        margin-top: 14px;
        padding-top: 10px;
        border-top: 1px solid var(--divider-color);
        text-align: center;
      }
      .footer-line {
        display: flex;
        justify-content: center;
        gap: 8px;
        font-size: 0.95em;
        color: var(--primary-text-color);
      }
      .clock { color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
      .strength {
        color: var(--secondary-text-color);
        font-weight: 600;
        letter-spacing: 0.02em;
      }
      .assists {
        margin-top: 2px;
        font-size: 0.82em;
        color: var(--secondary-text-color);
      }
      .pp {
        margin-top: 6px;
        display: inline-block;
        padding: 3px 10px;
        border-radius: 10px;
        font-size: 0.78em;
        font-weight: 700;
        letter-spacing: 0.04em;
        /* The chip is amber in both themes, so the ink on it has to be pinned
           as well: --primary-text-color goes near-white in the dark theme and
           leaves the badge unreadable against the amber. */
        color: #241a00;
        background: var(--amber-color, #ffc107);
      }
      .footer-bar {
        position: relative;
        z-index: 5;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-top: 1px solid var(--divider-color);
      }
      .bar-group { display: flex; gap: 6px; min-width: 0; }
      .bar-button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 14px;
        border: none;
        border-radius: 18px;
        background: var(--secondary-background-color);
        color: var(--secondary-text-color);
        font: inherit;
        font-size: 0.85em;
        font-weight: 500;
        line-height: 1;
        cursor: pointer;
        transition: background-color 0.15s ease, color 0.15s ease;
      }
      .bar-button:hover { color: var(--primary-text-color); }
      .bar-button.active {
        background: color-mix(in srgb, var(--primary-color) 18%, transparent);
        color: var(--primary-color);
      }
      .bar-button ha-icon { --mdc-icon-size: 18px; flex: none; }
      .bar-button > span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .bar-badge {
        flex: none;
        padding: 1px 6px;
        border-radius: 9px;
        background: rgba(127, 127, 127, 0.28);
        font-size: 0.86em;
        font-variant-numeric: tabular-nums;
      }
      @media (prefers-reduced-motion: reduce) { .bar-button { transition: none; } }
      dialog:not(.picker) {
        /* No position of its own: a modal dialog is centred in the viewport by
           the browser with inset: 0 and margin: auto, and anything set here
           drops it back into the flow of the page, beside whatever the card
           happened to be scrolled to. It is a positioned element already, so
           the close button still anchors to it. */
        width: min(520px, calc(100vw - 32px));
        max-height: min(78vh, 720px);
        padding: 0;
        border: none;
        border-radius: 16px;
        background: var(--ha-card-background, var(--card-background-color, #fff));
        color: var(--primary-text-color);
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.32);
        overflow: hidden;
      }
      dialog[open] { display: flex; flex-direction: column; }
      dialog::backdrop {
        background: rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(2px);
      }
      /* No title bar: each view heads itself, so the close button floats over
         the corner and the content starts at the top of the dialog. */
      .dialog-close {
        position: absolute;
        top: 6px;
        right: 6px;
        z-index: 2;
        flex: none;
        width: 36px;
        height: 36px;
        border: none;
        border-radius: 50%;
        background: none;
        color: var(--secondary-text-color);
        font-size: 1em;
        line-height: 1;
        cursor: pointer;
      }
      .dialog-close:hover {
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
      }
      .panel {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        /* Clear of the floating close button, which nothing else is holding a
           place for now that the title bar is gone. */
        padding: 44px 20px 18px;
        overscroll-behavior: contain;
      }
      /* A view that opens with its own back button or heading shares the
         close button's line and can start at the top. */
      .panel.tight { padding-top: 12px; }
      /* Only the badge shows the sections in the dialog on a wide screen;
         the card has them on its face. */
      .dialog-nav { display: none; }
      /* Shown instead of the switch wherever the tab bar is. */
      .section-heading { display: none; }
      .view-heading {
        padding-right: 36px;
        margin-bottom: 6px;
        font-size: 1.05em;
        font-weight: 500;
        color: var(--primary-text-color);
      }
      .table { display: flex; flex-direction: column; }
      /* Each stretch between two cuts is marked down the left edge, so where
         a club stands reads without counting rows. */
      .table-row {
        --zone: transparent;
        position: relative;
        display: grid;
        /* Form is as wide in every row - five pips or the word heading it -
           since each row lays out its own grid. */
        grid-template-columns: 2.4em minmax(0, 1fr) 2em 2.6em 2.2em 4.4em;
        gap: 6px;
        align-items: center;
        min-height: 40px;
        padding: 0 8px 0 10px;
        border-radius: 8px;
        font-size: 0.92em;
        font-variant-numeric: tabular-nums;
      }
      .table-row:not(.head)::before {
        content: '';
        position: absolute;
        left: 0;
        top: 6px;
        bottom: 6px;
        width: 3px;
        border-radius: 2px;
        background: var(--zone);
      }
      .table-row.zone-0 { --zone: var(--success-color, var(--green-color, #43a047)); }
      .table-row.zone-1 { --zone: var(--info-color, var(--primary-color)); }
      .table-row.zone-3 { --zone: var(--error-color, #e53935); }
      .table-row:not(.head):nth-child(odd) {
        background: color-mix(in srgb, var(--primary-text-color) 3%, transparent);
      }
      /* Rank and club read as a list; the numbers past them sit under their
         own headings. */
      .table-row > span:nth-child(n + 3) { text-align: center; }
      /* The columns are sized in em, so the heading row keeps the rows' own
         type size and only its labels are set smaller - a smaller row would
         get narrower columns, and the labels would sit off their figures. */
      .table-row.head {
        min-height: 28px;
        color: var(--secondary-text-color);
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .table-row.head > span { font-size: 0.78em; }
      .table-row.tappable { cursor: pointer; }
      .table-row.tappable:hover { background: var(--secondary-background-color); }
      .table-row.tappable:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: -2px;
      }
      .hero {
        /* Held at its height in the scrolling panel, as the scoreboard is. */
        flex: none;
        position: relative;
        overflow: hidden;
        margin: 0 -8px 10px;
        padding: 14px 14px 10px;
        border-radius: 14px;
        border: 1px solid color-mix(in srgb, var(--club, var(--primary-color)) 35%, var(--divider-color));
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--club, var(--primary-color)) 24%, transparent),
          color-mix(in srgb, var(--primary-text-color) 3%, transparent) 70%
        );
      }
      .hero-bg {
        position: absolute;
        right: -12%;
        top: 50%;
        width: 55%;
        transform: translateY(-50%);
        opacity: 0.08;
        pointer-events: none;
      }
      .hero-bg.placeholder { display: none; }
      .hero-jersey {
        position: absolute;
        right: 10px;
        top: -0.12em;
        font-size: 6.5em;
        font-weight: 800;
        line-height: 1;
        font-variant-numeric: tabular-nums;
        color: var(--primary-text-color);
        opacity: 0.07;
        pointer-events: none;
      }
      .hero-main {
        position: relative;
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .hero-crest {
        flex: none;
        width: 68px;
        height: 68px;
        object-fit: contain;
        filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.3));
      }
      .hero-crest.placeholder { border-radius: 50%; background: var(--divider-color); }
      .hero-titles {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        flex: 1;
      }
      .hero-kicker {
        font-size: 0.72em;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--club, var(--primary-color));
      }
      /* "1:a" is not a word to shout: capitals would make it "1:A". */
      .hero-kicker.as-written {
        text-transform: none;
        letter-spacing: 0.02em;
        font-size: 0.8em;
      }
      .hero-title {
        font-size: 1.45em;
        font-weight: 700;
        line-height: 1.15;
        color: var(--primary-text-color);
        overflow-wrap: anywhere;
      }
      .hero-sub {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 0.88em;
        color: var(--secondary-text-color);
      }
      .hero-mini-crest { width: 18px; height: 18px; object-fit: contain; }
      .hero-form { display: inline-flex; gap: 4px; margin-top: 4px; }
      .hero-big {
        flex: none;
        display: flex;
        flex-direction: column;
        align-items: center;
        line-height: 1;
      }
      .hero-big-value {
        font-size: 2.4em;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
        color: var(--primary-text-color);
      }
      .hero-big-label {
        margin-top: 2px;
        font-size: 0.7em;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .hero-photo {
        flex: none;
        width: 84px;
        height: 84px;
        border-radius: 50%;
        object-fit: cover;
        object-position: top center;
        background: var(--secondary-background-color);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--club, var(--primary-color)) 70%, transparent);
        cursor: zoom-in;
      }
      .hero-shirt {
        display: grid;
        place-items: center;
        font-size: 1.8em;
        font-weight: 800;
        cursor: default;
      }
      .hero-stats {
        position: relative;
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 6px;
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid color-mix(in srgb, var(--primary-text-color) 10%, transparent);
        text-align: center;
      }
      .hero-stats .stat-value { font-size: 1.2em; font-weight: 700; }
      .hero-headline { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .hero-headline .stat-value { font-size: 1.7em; font-weight: 800; }
      .team-head {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 2px 0 10px;
      }
      .team-logo { width: 46px; height: 46px; object-fit: contain; flex: none; }
      .team-titles { display: flex; flex-direction: column; min-width: 0; }
      .team-title {
        font-size: 1.15em;
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .team-sub { font-size: 0.85em; color: var(--secondary-text-color); }
      .player-link { cursor: pointer; text-decoration: underline dotted; }
      .player-link:hover { color: var(--primary-color); }
      .player-link:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
        border-radius: 3px;
      }
      .photo-overlay {
        position: absolute;
        inset: 0;
        z-index: 3;
        display: grid;
        place-items: center;
        padding: 16px;
        background: rgba(0, 0, 0, 0.78);
        cursor: zoom-out;
      }
      .photo-overlay img {
        max-width: 100%;
        max-height: 100%;
        border-radius: 12px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
      }
      .player-photo {
        cursor: zoom-in;
        flex: none;
        width: 64px;
        height: 64px;
        border-radius: 50%;
        object-fit: cover;
        object-position: top center;
        background: var(--secondary-background-color);
      }
      .player-facts {
        margin-top: 2px;
        font-size: 0.82em;
        color: var(--secondary-text-color);
      }
      .player-youth {
        padding-bottom: 8px;
        font-size: 0.82em;
        color: var(--secondary-text-color);
      }
      .player-jersey {
        flex: none;
        display: grid;
        place-items: center;
        width: 46px;
        height: 46px;
        border-radius: 50%;
        background: var(--secondary-background-color);
        font-size: 1.1em;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .roster-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 2.2em 2.6em 2.2em 2.4em;
        gap: 6px;
        align-items: baseline;
        padding: 5px 0;
        border-top: 1px solid var(--divider-color);
        font-size: 0.88em;
        font-variant-numeric: tabular-nums;
        text-align: center;
      }
      .roster-row.head {
        color: var(--secondary-text-color);
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .roster-row.head > span { font-size: 0.84em; }
      .roster-name {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        text-align: left;
        overflow: hidden;
        white-space: nowrap;
      }
      .roster-photo {
        flex: none;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        object-fit: cover;
        object-position: top center;
        background: var(--secondary-background-color);
      }
      .roster-photo.empty {
        display: grid;
        place-items: center;
        font-size: 0.62em;
        font-weight: 700;
        color: var(--secondary-text-color);
      }
      .roster-position {
        flex: none;
        display: grid;
        place-items: center;
        min-width: 1.5em;
        height: 1.5em;
        padding: 0 3px;
        border-radius: 5px;
        background: var(--secondary-background-color);
        font-size: 0.72em;
        font-weight: 700;
        letter-spacing: 0.02em;
        color: var(--secondary-text-color);
      }
      .roster-position.gk { background: rgba(255, 167, 38, 0.25); }
      .roster-position.d { background: rgba(66, 165, 245, 0.25); }
      .roster-position.f { background: rgba(102, 187, 106, 0.25); }
      .roster-number {
        flex: none;
        min-width: 1.5em;
        text-align: right;
        color: var(--secondary-text-color);
      }
      .roster-name .player-link {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .roster-sort { cursor: pointer; white-space: nowrap; }
      .roster-sort:hover { color: var(--primary-text-color); }
      .roster-sort.active { color: var(--primary-color); }
      .roster-sort:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }
      .roster-points { font-weight: 600; }
      .roster-goalie { font-variant-numeric: tabular-nums; }

      /* Top right of the game, where a highlights reel belongs. */
      .highlight-corner {
        position: relative;
        flex: none;
        display: block;
        width: 104px;
        border-radius: 10px;
        overflow: hidden;
        text-decoration: none;
        background: var(--secondary-background-color);
      }
      .highlight-thumb {
        display: block;
        width: 104px;
        height: 59px;
        object-fit: cover;
      }
      .highlight-play {
        position: absolute;
        top: 16px;
        left: 0;
        right: 0;
        text-align: center;
        font-size: 1.2em;
        color: #fff;
        text-shadow: 0 1px 6px rgba(0, 0, 0, 0.7);
        pointer-events: none;
      }
      .highlight-caption {
        display: block;
        padding: 3px 6px;
        font-size: 0.72em;
        text-align: center;
        color: var(--primary-text-color);
      }
      .highlight-corner:hover .highlight-caption { color: var(--primary-color); }
      @media (max-width: 420px) {
        .highlight-corner, .highlight-thumb { width: 84px; }
        .highlight-thumb { height: 47px; }
      }
      .player-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      @media (max-width: 420px) {
        .player-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      .team-stats {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 6px;
        padding: 10px 0;
        border-top: 1px solid var(--divider-color);
        border-bottom: 1px solid var(--divider-color);
        text-align: center;
      }
      .stat { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .stat-value {
        font-size: 1.05em;
        font-variant-numeric: tabular-nums;
        color: var(--primary-text-color);
      }
      .stat-label {
        font-size: 0.7em;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      /* A game is a small block of its own: the time down the left, a line
         for each side with its goals at the end, and where and on what
         underneath. */
      .fixture-row {
        display: grid;
        grid-template-columns: 3.4em minmax(0, 1fr) auto;
        grid-template-areas:
          'when home home-goals'
          'when away away-goals'
          '.    meta meta';
        column-gap: 12px;
        row-gap: 3px;
        align-items: center;
        margin-top: 6px;
        padding: 10px 12px;
        border-radius: 12px;
        background: var(--secondary-background-color);
        font-size: 0.92em;
      }
      .fixture-when {
        grid-area: when;
        align-self: center;
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: var(--primary-text-color);
        white-space: nowrap;
      }
      .fixture-live {
        display: inline-flex;
        align-items: center;
        color: var(--error-color, #e53935);
      }
      .fixture-side {
        min-width: 0;
        display: flex;
        color: var(--primary-text-color);
      }
      .fixture-side.home { grid-area: home; }
      .fixture-side.away { grid-area: away; }
      .fixture-goals {
        min-width: 1.4em;
        text-align: right;
        font-size: 1.05em;
        font-variant-numeric: tabular-nums;
        color: var(--secondary-text-color);
      }
      .fixture-goals.home { grid-area: home-goals; }
      .fixture-goals.away { grid-area: away-goals; }
      .fixture-goals.lead { font-weight: 700; color: var(--primary-text-color); }
      .fixture-goals.lead.won { color: var(--success-color, var(--green-color, #43a047)); }
      .fixture-goals.lead.lost { color: var(--error-color, #e53935); }
      .fixture-side.lead { font-weight: 600; }
      .fixture-meta {
        grid-area: meta;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-width: 0;
        padding-top: 2px;
        font-size: 0.8em;
        color: var(--secondary-text-color);
      }
      .fixture-detail {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        column-gap: 10px;
        min-width: 0;
      }
      .fixture-extra {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-weight: 600;
        white-space: nowrap;
      }
      .fixture-team {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .fixture-team.tappable { cursor: pointer; border-radius: 4px; }
      .fixture-team.tappable:hover { color: var(--primary-color); }
      .fixture-team.tappable:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 1px;
      }
      .fixture-logo { width: 22px; height: 22px; object-fit: contain; flex: none; }
      .fixture-clock { font-weight: 400; color: var(--secondary-text-color); }
      .live-updated {
        padding-top: 10px;
        font-size: 0.76em;
        color: var(--secondary-text-color);
      }
      .schedule-back {
        align-self: flex-start;
        margin: 0 0 4px -6px;
        padding: 4px 6px;
        border: none;
        border-radius: 12px;
        background: none;
        color: var(--secondary-text-color);
        font: inherit;
        font-size: 0.85em;
        cursor: pointer;
      }
      .schedule-back:hover { color: var(--primary-text-color); }
      /* A view's filters, held at the foot of the panel while the list
         scrolls under them. The gap takes whatever room a short list
         leaves, so the row is at the foot of the screen either way. */
      .filter-gap { flex: 1 0 12px; }
      .filter-bar {
        /* Flush with the panel's foot, over its bottom padding. */
        position: sticky;
        bottom: -18px;
        z-index: 2;
        flex: none;
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 0 -20px -18px;
        padding: 10px 20px calc(10px + env(safe-area-inset-bottom, 0px));
        overflow-x: auto;
        scrollbar-width: none;
        background-color: var(--card-background-color, var(--ha-card-background, #1c1c1c));
        border-top: 1px solid var(--divider-color);
      }
      .filter-bar::-webkit-scrollbar { display: none; }
      /* Read again with the old figures on show: a line runs along the top
         edge. Drawn as the row's own background, so it neither scrolls with
         the chips nor widens what they scroll across. */
      .filter-bar.busy,
      .day-bar.busy {
        background-image: linear-gradient(
          90deg,
          transparent,
          var(--primary-color),
          transparent
        );
        background-size: 40% 2px;
        background-repeat: no-repeat;
        background-position: -70% 0;
        animation: busy-slide 1.2s ease-in-out infinite;
      }
      .day-bar.busy { background-position-y: 100%; }
      @keyframes busy-slide {
        from { background-position-x: -70%; }
        to { background-position-x: 170%; }
      }
      .filter-chip {
        flex: none;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 34px;
        box-sizing: border-box;
        padding: 0 11px;
        border: 1px solid var(--divider-color);
        border-radius: 17px;
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
        font: inherit;
        font-size: 0.85em;
        white-space: nowrap;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: background-color 0.15s ease, border-color 0.15s ease;
      }
      .filter-chip ha-icon {
        --mdc-icon-size: 18px;
        flex: none;
        color: var(--secondary-text-color);
      }
      .filter-chip.active {
        border-color: var(--primary-color);
        background: color-mix(in srgb, var(--primary-color) 22%, var(--secondary-background-color));
        font-weight: 600;
      }
      .filter-chip.active ha-icon { color: var(--primary-color); }
      .filter-chip:focus-visible,
      .filter-select:has(select:focus-visible) {
        outline: 2px solid var(--primary-color);
        outline-offset: 1px;
      }
      /* A chip saying what is chosen, with the browser's own select over it
         unseen: a tap opens the phone's own picker. */
      .filter-select {
        position: relative;
        padding-right: 7px;
      }
      .filter-select ha-icon { margin-left: -2px; }
      .filter-select select {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        margin: 0;
        opacity: 0;
        border: none;
        /* What the opened list is drawn in, on a desktop. */
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color);
        /* Anything smaller and iOS zooms the page in on a tap. */
        font-size: 16px;
        cursor: pointer;
        appearance: none;
        -webkit-appearance: none;
      }
      .team-pick { max-width: min(60vw, 260px); padding-right: 7px; }
      .team-pick-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
      .team-pick > ha-icon:first-child { margin-left: -2px; }
      .crest-stack { display: inline-flex; flex: none; }
      .crest-stack > img,
      .crest-stack > .crest-blank {
        width: 22px;
        height: 22px;
        box-sizing: border-box;
        padding: 1px;
        border-radius: 50%;
        object-fit: contain;
        background: var(--card-background-color, var(--ha-card-background, #fff));
      }
      .crest-stack > * + * { margin-left: -7px; }
      .live-dot {
        flex: none;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--secondary-text-color);
      }
      .live-chip.active {
        border-color: var(--error-color, #e53935);
        background: color-mix(in srgb, var(--error-color, #e53935) 16%, var(--secondary-background-color));
        color: var(--error-color, #e53935);
      }
      .live-chip.active .live-dot {
        background: var(--error-color, #e53935);
        animation: pulse 1.6s ease-in-out infinite;
      }

      /* ---- The club list ---- */
      dialog.picker {
        width: min(400px, calc(100vw - 32px));
        max-width: none;
        max-height: min(80vh, 640px);
        padding: 0;
        border: none;
        border-radius: 18px;
        background: var(--ha-card-background, var(--card-background-color, #fff));
        color: var(--primary-text-color);
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
        overflow: hidden;
      }
      dialog.picker[open] { animation: picker-in 0.18s ease-out; }
      @keyframes picker-in {
        from { transform: scale(0.96); opacity: 0; }
      }
      .picker-head {
        flex: none;
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 18px 20px 10px;
      }
      .picker-title { font-size: 1.1em; font-weight: 600; }
      .picker-count { font-size: 0.8em; color: var(--secondary-text-color); }
      .picker-list {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: 0 10px 8px;
      }
      .picker-row {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        min-height: 48px;
        padding: 6px 10px;
        border: none;
        border-radius: 12px;
        background: none;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: background-color 0.12s ease;
      }
      .picker-row:hover { background: var(--secondary-background-color); }
      .picker-row.on {
        background: color-mix(in srgb, var(--primary-color) 13%, transparent);
        font-weight: 600;
      }
      .picker-row:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: -2px;
      }
      .picker-crest { width: 28px; height: 28px; flex: none; object-fit: contain; }
      .picker-name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .picker-ours {
        flex: none;
        padding: 2px 7px;
        border-radius: 8px;
        background: var(--secondary-background-color);
        color: var(--secondary-text-color);
        font-size: 0.72em;
        font-weight: 600;
      }
      .picker-check {
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        box-sizing: border-box;
        border: 2px solid var(--divider-color);
        border-radius: 50%;
        color: transparent;
        --mdc-icon-size: 16px;
        transition: background-color 0.12s ease, border-color 0.12s ease;
      }
      .picker-row.on .picker-check {
        border-color: var(--primary-color);
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
      }
      .picker-foot {
        flex: none;
        display: flex;
        gap: 10px;
        padding: 12px 16px 14px;
        border-top: 1px solid var(--divider-color);
      }
      .picker-foot button {
        flex: 1;
        padding: 11px 16px;
        border: none;
        border-radius: 22px;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      .picker-clear {
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
      }
      .picker-clear[disabled] { opacity: 0.45; cursor: default; }
      .picker-done {
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
      }
      .picker-foot button:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }

      /* ---- Loading ---- */
      .loading { flex: none; display: flex; flex-direction: column; gap: 6px; }
      .loading-label {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 6px 0 4px;
        font-size: 0.82em;
        color: var(--secondary-text-color);
      }
      .spinner {
        flex: none;
        width: 14px;
        height: 14px;
        box-sizing: border-box;
        border: 2px solid color-mix(in srgb, var(--primary-color) 22%, transparent);
        border-top-color: var(--primary-color);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      /* The shape of what is coming, fading out down the panel. */
      .skeleton {
        display: flex;
        flex-direction: column;
        -webkit-mask-image: linear-gradient(#000 45%, transparent);
        mask-image: linear-gradient(#000 45%, transparent);
      }
      .sk {
        display: block;
        height: 11px;
        border-radius: 6px;
        background: linear-gradient(
          90deg,
          color-mix(in srgb, var(--primary-text-color) 7%, transparent) 30%,
          color-mix(in srgb, var(--primary-text-color) 15%, transparent) 50%,
          color-mix(in srgb, var(--primary-text-color) 7%, transparent) 70%
        );
        background-size: 300% 100%;
        animation: shimmer 1.6s ease-in-out infinite;
      }
      @keyframes shimmer {
        from { background-position: 100% 0; }
        to { background-position: 0 0; }
      }
      .sk-heading { width: 32%; height: 9px; margin: 16px 0 6px; }
      .sk-crest { flex: none; width: 22px; height: 22px; border-radius: 50%; }
      .sk-avatar { flex: none; width: 40px; height: 40px; border-radius: 50%; }
      .sk-line { flex: none; }
      .sk-num { height: 10px; }
      .sk-block { height: 120px; border-radius: 14px; }
      .sk-block.sk-ours { margin-top: 4px; }
      .sk-block.sk-hero { height: 150px; margin-bottom: 10px; }
      .sk-side { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .sk-fixture {
        display: grid;
        grid-template-columns: 3.4em minmax(0, 1fr);
        column-gap: 12px;
        row-gap: 8px;
        align-items: center;
        margin-top: 6px;
        padding: 12px;
        border-radius: 12px;
        background: var(--secondary-background-color);
      }
      .sk-when { grid-row: 1 / span 2; height: 13px; width: 85%; }
      .sk-row {
        display: grid;
        grid-template-columns: 1.4em 22px minmax(0, 1fr) 1.8em 1.8em 1.8em;
        gap: 10px;
        align-items: center;
        min-height: 40px;
        padding: 0 8px;
      }
      .sk-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .sk-card {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px;
        border-radius: 14px;
        background: var(--secondary-background-color);
      }
      @media (prefers-reduced-motion: reduce) {
        .sk,
        .spinner,
        .filter-bar.busy,
        .day-bar.busy,
        .live-chip.active .live-dot { animation: none; }
        .filter-bar.busy,
        .day-bar.busy { background-position-x: 50%; }
        .filter-chip,
        .picker-row,
        .picker-check { transition: none; }
      }
      .fixture-row.tappable { cursor: pointer; }
      .fixture-row.tappable:hover {
        background: color-mix(in srgb, var(--primary-text-color) 8%, var(--secondary-background-color));
      }
      .fixture-row.tappable:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: -2px;
      }
      .fixture-row.next { box-shadow: inset 3px 0 0 var(--primary-color); }
      .team-tabs { padding-top: 12px; }
      .recap-score { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .recap-figures { font-variant-numeric: tabular-nums; }
      .recap-score .fixture-logo { width: 22px; height: 22px; }
      .fixture-row.self {
        background: color-mix(in srgb, var(--primary-color) 14%, var(--secondary-background-color));
      }
      .fixture-row.self .fixture-side { font-weight: 600; }
      .fixture-clip {
        display: inline-flex;
        color: var(--secondary-text-color);
        text-decoration: none;
        --mdc-icon-size: 18px;
      }
      .fixture-clip:hover { color: var(--primary-color); }
      .team-section {
        padding: 12px 0 4px;
        font-size: 0.74em;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .table-row.self,
      .table-row.self:nth-child(odd) {
        font-weight: 700;
        background: color-mix(in srgb, var(--primary-color) 16%, transparent);
      }
      .table-row.self .table-name { color: var(--primary-color); }
      /* A little air at each cut, and a faint line across it. */
      .table-row.cut { margin-top: 7px; }
      .table-row.cut::after {
        content: '';
        position: absolute;
        left: 10px;
        right: 8px;
        top: -4px;
        border-top: 1px dashed var(--divider-color);
      }
      .table-rank { color: var(--secondary-text-color); font-weight: 500; }
      .table-row.self .table-rank { color: var(--primary-color); }
      .table-rank { display: flex; align-items: baseline; gap: 2px; }
      .move { font-size: 0.62em; line-height: 1; }
      .move.up { color: var(--success-color, var(--green-color, #43a047)); }
      .move.down { color: var(--error-color, #e53935); }
      .playing {
        display: inline-block;
        width: 6px;
        height: 6px;
        margin-right: 5px;
        border-radius: 50%;
        background: var(--error-color, #e53935);
        animation: pulse 1.6s ease-in-out infinite;
      }
      .switch {
        display: flex;
        gap: 4px;
        padding: 8px 0 6px;
      }
      .switch button {
        flex: 1;
        padding: 5px 10px;
        border: none;
        border-radius: 14px;
        background: var(--secondary-background-color);
        color: var(--secondary-text-color);
        font: inherit;
        font-size: 0.82em;
        line-height: 1;
        cursor: pointer;
      }
      /* Where the switch is the way between the views, it stays at the top
         of the panel as the long schedule scrolls, beside the close button. */
      .switch.section-switch {
        position: sticky;
        top: -44px;
        z-index: 1;
        flex: none;
        margin: 0 -20px;
        padding: 6px 48px 8px 20px;
        background: var(--card-background-color, var(--ha-card-background, #1c1c1c));
      }
      .switch button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
      }
      .switch-badge {
        min-width: 15px;
        padding: 1px 4px;
        border-radius: 8px;
        background: var(--error-color, #db4437);
        color: #fff;
        font-size: 0.85em;
        font-weight: 600;
        line-height: 1.3;
      }
      .switch button.active .switch-badge {
        background: var(--text-primary-color, #fff);
        color: var(--primary-color);
      }
      .switch button.active {
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
        font-weight: 600;
      }
      .table-team {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .table-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .table-logo { width: 22px; height: 22px; object-fit: contain; flex: none; }
      .table-team .playing { flex: none; margin: 0; }
      .table-form {
        display: flex;
        align-items: center;
        gap: 3px;
        justify-content: center;
      }
      .form-pip {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--disabled-color, #9e9e9e);
      }
      .form-pip.win { background: var(--success-color, var(--green-color, #43a047)); }
      .form-pip.otwin {
        background: var(--success-color, var(--green-color, #43a047));
        opacity: 0.5;
      }
      .form-pip.otloss { background: var(--warning-color, #ffa726); }
      .form-pip.loss { background: var(--error-color, #e53935); }
      @media (max-width: 460px) {
        /* Form stays on a phone; the row tightens around it instead. */
        .table-row {
          grid-template-columns: 2.1em minmax(0, 1fr) 1.8em 2.3em 2em 4.2em;
          gap: 4px;
          padding: 0 6px 0 8px;
          font-size: 0.88em;
        }
        .table-team { gap: 8px; }
        .table-logo { width: 20px; height: 20px; }
        .table-form { gap: 3px; }
        .form-pip { width: 7px; height: 7px; }
      }
      .table-points { font-weight: 700; font-size: 1.05em; }
      .log-row {
        display: grid;
        grid-template-columns: auto auto minmax(0, 1fr);
        gap: 8px;
        align-items: baseline;
        padding: 5px 0;
        border-top: 1px solid var(--divider-color);
        font-size: 0.88em;
      }
      .log-row:first-child { border-top: none; }
      .team-section.cut {
        margin-top: 4px;
        border-top: 2px solid var(--secondary-text-color);
      }
      .log-row.goal .log-main { font-weight: 600; }
      .log-row.tappable {
        grid-template-columns: auto auto minmax(0, 1fr) auto;
        cursor: pointer;
      }
      .log-row.tappable:hover { background: var(--secondary-background-color); }
      .log-row.tappable:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: -2px;
      }
      .chevron {
        color: var(--secondary-text-color);
        font-size: 1.1em;
        line-height: 1;
      }
      .recap-live {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        margin-top: 2px;
        font-size: 0.8em;
        font-weight: 600;
        color: var(--error-color, #db4437);
      }
      /* A pill, so it reads as something to press rather than a caption. */
      .recap-back {
        /* The panel is a scrolling flex column, which would squash it. */
        flex: none;
        align-self: flex-start;
        display: inline-flex;
        line-height: 20px;
        align-items: center;
        gap: 2px;
        max-width: calc(100% - 48px);
        margin: 0 36px 10px 0;
        padding: 6px 14px 6px 6px;
        border: none;
        border-radius: 18px;
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
        font: inherit;
        font-size: 0.88em;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        cursor: pointer;
      }
      .recap-back ha-icon { --mdc-icon-size: 20px; flex: none; }
      .recap-back:hover {
        background: color-mix(in srgb, var(--primary-text-color) 10%, var(--secondary-background-color));
      }
      .recap-back:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }
      .recap-note {
        padding: 6px 0;
        font-size: 0.88em;
        color: var(--secondary-text-color);
      }
      .scoreboard {
        /* The panel is a scrolling flex column; without this the header is
           what gives way once the match log outgrows the screen. */
        flex: none;
        position: relative;
        overflow: hidden;
        margin: 0 -8px 4px;
        padding: 16px 10px 12px;
        border-radius: 14px;
        background: linear-gradient(
          180deg,
          color-mix(in srgb, var(--primary-text-color) 7%, transparent),
          color-mix(in srgb, var(--primary-text-color) 2%, transparent)
        );
        border: 1px solid var(--divider-color);
      }
      .scoreboard.playing-now {
        border-color: color-mix(in srgb, var(--error-color, #e53935) 45%, transparent);
      }
      .sb-bg {
        position: absolute;
        top: 50%;
        width: 46%;
        transform: translateY(-50%);
        opacity: 0.07;
        pointer-events: none;
      }
      .sb-bg.home { left: -14%; }
      .sb-bg.away { right: -14%; }
      .sb-bg.placeholder { display: none; }
      .sb-row {
        position: relative;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
        align-items: center;
        gap: 8px;
      }
      .sb-team {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        min-width: 0;
        text-align: center;
        color: var(--secondary-text-color);
      }
      .sb-team.lead { color: var(--primary-text-color); }
      .sb-team.tappable { cursor: pointer; }
      .sb-team.tappable:hover .sb-name { text-decoration: underline; }
      .sb-crest { width: 56px; height: 56px; object-fit: contain; }
      .sb-crest.placeholder { border-radius: 50%; background: var(--divider-color); }
      .sb-name {
        max-width: 100%;
        font-size: 0.9em;
        font-weight: 600;
        line-height: 1.2;
        overflow-wrap: anywhere;
      }
      .sb-centre {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }
      .sb-status {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 0.72em;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .playing-now .sb-status { color: var(--error-color, #e53935); }
      .sb-score {
        display: flex;
        align-items: baseline;
        gap: 6px;
        font-size: 2.6em;
        font-weight: 700;
        line-height: 1.1;
        font-variant-numeric: tabular-nums;
        color: var(--secondary-text-color);
      }
      .sb-score .lead { color: var(--primary-text-color); }
      .sb-dash { font-weight: 400; opacity: 0.6; }
      .scoreboard.won {
        border-color: color-mix(in srgb, var(--success-color, #43a047) 45%, transparent);
      }
      .scoreboard.won .sb-status { color: var(--success-color, #43a047); }
      .scoreboard.lost .sb-status { color: var(--error-color, #e53935); }
      .sb-meta {
        margin: 2px 0 6px;
        text-align: center;
      }
      .recap-highlight {
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 4px 0 6px;
        padding: 8px;
        border-radius: 12px;
        background: var(--secondary-background-color);
        color: inherit;
        text-decoration: none;
      }
      .recap-highlight:hover .recap-highlight-title { color: var(--primary-color); }
      .recap-highlight > .highlight-play {
        position: static;
        color: var(--primary-color);
        text-shadow: none;
      }
      .recap-highlight-thumb .highlight-play { top: 50%; transform: translateY(-50%); }
      .recap-highlight-thumb {
        position: relative;
        flex: none;
        width: 96px;
        aspect-ratio: 16 / 9;
        border-radius: 8px;
        overflow: hidden;
        background: #000;
      }
      .recap-highlight-thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .recap-highlight-text { display: flex; flex-direction: column; min-width: 0; }
      .recap-highlight-title { font-weight: 600; }
      .sb-periods {
        margin-top: 2px;
        font-size: 0.75em;
        letter-spacing: 0.02em;
        font-variant-numeric: tabular-nums;
        color: var(--secondary-text-color);
        white-space: nowrap;
      }
      .sb-clock {
        font-size: 0.85em;
        font-variant-numeric: tabular-nums;
        color: var(--secondary-text-color);
      }
      .sb-pp {
        position: relative;
        width: fit-content;
        margin: 10px auto 0;
        padding: 3px 10px;
        border-radius: 999px;
        font-size: 0.78em;
        font-weight: 600;
        color: #3a2a00;
        background: var(--amber-color, #ffc107);
      }
      .scoreboard .tv {
        position: relative;
        justify-content: center;
        margin-top: 8px;
      }
      .recap-head {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding-bottom: 10px;
        border-bottom: 1px solid var(--divider-color);
      }
      .recap-summary {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        flex: 1 1 auto;
      }
      .recap-score {
        font-size: 1.05em;
        font-weight: 600;
        color: var(--primary-text-color);
      }
      .recap-score.won { color: var(--success-color, var(--green-color, #43a047)); }
      .recap-score.lost { color: var(--error-color, #e53935); }
      .recap-meta { font-size: 0.82em; color: var(--secondary-text-color); }
      .stats {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px 0 6px;
      }
      .day-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0 0 6px;
      }
      .day-title {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 0;
        font-size: 1.05em;
        font-weight: 500;
        color: var(--primary-text-color);
      }
      /* The date over the day's name, as an app's page title puts it. */
      .day-sub {
        order: -1;
        font-size: 0.75em;
        font-weight: normal;
        color: var(--secondary-text-color);
      }
      .day-step {
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border: none;
        border-radius: 50%;
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
        cursor: pointer;
      }
      .day-step ha-icon { --mdc-icon-size: 22px; }
      /* Tall enough to swipe on even when the day has nothing in it; up and
         down stays with the page. */
      .day-body {
        min-height: 50vh;
        touch-action: pan-y;
      }
      .stats-more {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        align-self: center;
        padding: 6px 14px;
        border: none;
        border-radius: 16px;
        background: var(--secondary-background-color);
        color: var(--secondary-text-color);
        font: inherit;
        font-size: 0.85em;
        cursor: pointer;
      }
      .stats-more:hover { color: var(--primary-text-color); }
      .stats-more ha-icon { --mdc-icon-size: 18px; }
      .stat-values {
        display: flex;
        justify-content: space-between;
        font-size: 0.95em;
        font-variant-numeric: tabular-nums;
        color: var(--secondary-text-color);
      }
      .stat-value.lead { color: var(--primary-text-color); font-weight: 700; }
      /* Two bars meeting in the middle: home grows out to the left, away to
         the right, so which way a game went is a glance rather than a sum. */
      .bar-track { display: flex; height: 7px; gap: 2px; margin: 3px 0; }
      .bar-side {
        flex: 1 1 50%;
        display: flex;
        background: rgba(127, 127, 127, 0.16);
      }
      .bar-side.home { justify-content: flex-end; border-radius: 4px 0 0 4px; }
      .bar-side.away { justify-content: flex-start; border-radius: 0 4px 4px 0; }
      .bar-fill { height: 100%; border-radius: 4px; }
      .stat-foot {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
        align-items: baseline;
        gap: 8px;
        font-size: 0.78em;
        color: var(--secondary-text-color);
      }
      .stat-label { text-align: center; }
      .stat-foot > .stat-detail:last-child { text-align: right; }
      .log-time {
        color: var(--secondary-text-color);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .log-icon { line-height: 1; }
      .log-text { min-width: 0; display: flex; flex-direction: column; }
      .log-main {
        color: var(--primary-text-color);
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .log-detail { font-size: 0.86em; color: var(--secondary-text-color); }
      .log-team {
        font-weight: 700;
        letter-spacing: 0.02em;
        margin-right: 5px;
      }
      .pip {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        display: inline-block;
        flex: none;
        background: var(--disabled-color, #9e9e9e);
      }
      .pip.win { background: var(--success-color, var(--green-color, #43a047)); }
      .pip.loss { background: var(--error-color, #e53935); }
      .pip.draw { background: var(--warning-color, #ffa726); }
      /* ---- Statistik ---- */
      /* The statistics' own sections as a segmented control, so they do not
         read as a second row of the dialog's tabs. */
      .switch.st-sections {
        flex: none;
        gap: 2px;
        margin: 0 0 8px;
        padding: 3px;
        border-radius: 12px;
        background: var(--secondary-background-color);
      }
      .switch.st-sections button {
        padding: 7px 6px;
        border-radius: 9px;
        background: none;
        font-size: 0.84em;
      }
      .switch.st-sections button.active {
        background: var(--card-background-color, var(--ha-card-background, #1c1c1c));
        color: var(--primary-color);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
      }
      /* When the figures were read, and the league's own pages. */
      .st-foot {
        flex: none;
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        align-items: center;
        gap: 4px 14px;
        margin-top: 14px;
        font-size: 0.78em;
        color: var(--secondary-text-color);
      }
      .st-source {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: var(--secondary-text-color);
        text-decoration: none;
        --mdc-icon-size: 14px;
      }
      .st-source:hover { color: var(--primary-color); }
      /* A place in the league: green near the top, red near the foot. */
      .st-place {
        font-size: 0.72em;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: var(--secondary-text-color);
        white-space: nowrap;
      }
      .st-place.top { color: var(--success-color, var(--green-color, #43a047)); }
      .st-place.bottom { color: var(--error-color, #e53935); }
      /* The followed club, as the league sees it. */
      .st-ours {
        flex: none;
        position: relative;
        overflow: hidden;
        margin: 4px -8px 2px;
        padding: 10px 12px 10px;
        border-radius: 14px;
        border: 1px solid color-mix(in srgb, var(--club, var(--primary-color)) 35%, var(--divider-color));
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--club, var(--primary-color)) 22%, transparent),
          color-mix(in srgb, var(--primary-text-color) 3%, transparent) 70%
        );
        cursor: pointer;
      }
      .st-ours:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
      .st-ours-head {
        position: relative;
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
      }
      .st-ours-head ha-icon { margin-left: auto; color: var(--secondary-text-color); }
      .st-ours-crest { width: 26px; height: 26px; object-fit: contain; }
      .st-ours-crest.placeholder { display: none; }
      .st-ours-tiles {
        position: relative;
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 4px;
        margin-top: 8px;
        text-align: center;
      }
      .st-ours-tile { display: flex; flex-direction: column; align-items: center; min-width: 0; }
      .st-ours-value {
        font-size: 0.98em;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .st-ours-label {
        font-size: 0.66em;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .st-ours-foot {
        position: relative;
        margin-top: 8px;
        padding-top: 6px;
        border-top: 1px solid color-mix(in srgb, var(--primary-text-color) 10%, transparent);
        font-size: 0.8em;
        color: var(--secondary-text-color);
      }
      @media (max-width: 460px) {
        .st-ours-tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); row-gap: 8px; }
      }
      /* Leaders: a row of cards per kind that scrolls sideways, each card
         snapping into place, the next one peeking in at the edge. */
      .lb-head {
        flex: none;
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
      }
      .lb-arrows { display: flex; gap: 4px; padding-bottom: 2px; }
      .lb-arrow {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        padding: 0;
        border: none;
        border-radius: 50%;
        background: var(--secondary-background-color);
        color: var(--secondary-text-color);
        cursor: pointer;
        --mdc-icon-size: 20px;
      }
      .lb-arrow:hover { color: var(--primary-text-color); }
      @media (hover: none) and (pointer: coarse) { .lb-arrows { display: none; } }
      .lb-track {
        flex: none;
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: calc((100% - 50px) / 2);
        gap: 10px;
        margin: 0 -20px;
        padding: 2px 20px 8px;
        overflow-x: auto;
        overscroll-behavior-x: contain;
        scroll-snap-type: x mandatory;
        scroll-padding-inline: 20px;
        scrollbar-width: none;
      }
      .lb-track::-webkit-scrollbar { display: none; }
      @media (max-width: 600px) {
        .lb-track { grid-auto-columns: 82%; }
      }
      .lb-card {
        scroll-snap-align: start;
        display: flex;
        flex-direction: column;
        min-width: 0;
        padding: 8px 12px 8px;
        border-radius: 14px;
        background: var(--secondary-background-color);
      }
      .lb-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 4px;
        padding: 2px 0 6px;
        border: none;
        background: none;
        color: var(--secondary-text-color);
        font: inherit;
        font-size: 0.72em;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        text-align: left;
        cursor: pointer;
        --mdc-icon-size: 16px;
      }
      .lb-title:hover { color: var(--primary-color); }
      .lb-top {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
        padding: 4px 6px 8px;
        margin: 0 -6px 2px;
        border-radius: 10px;
      }
      .lb-photo {
        width: 46px;
        height: 46px;
        border-radius: 50%;
        object-fit: cover;
        object-position: top center;
        background: var(--card-background-color, rgba(127, 127, 127, 0.2));
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--club, var(--primary-color)) 70%, transparent);
      }
      .lb-photo.crest {
        object-fit: contain;
        background: none;
        box-shadow: none;
        border-radius: 0;
      }
      .lb-top-text { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
      /* The leader's name is the one worth reading in full, so it may take
         a second line rather than be cut short. */
      .lb-top-name {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        font-weight: 600;
        line-height: 1.2;
        overflow-wrap: anywhere;
      }
      .lb-top-team {
        display: flex;
        align-items: center;
        gap: 4px;
        min-width: 0;
        font-size: 0.78em;
        color: var(--secondary-text-color);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .lb-mini { width: 14px; height: 14px; object-fit: contain; flex: none; }
      .lb-top-value {
        font-size: 1.45em;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .lb-unit { margin-left: 2px; font-size: 0.6em; font-weight: 700; }
      .lb-row {
        display: grid;
        grid-template-columns: 1.4em 18px minmax(0, 1fr) auto;
        align-items: center;
        gap: 6px;
        min-height: 28px;
        padding: 0 6px;
        margin: 0 -6px;
        border-top: 1px solid var(--divider-color);
        border-radius: 6px;
        font-size: 0.86em;
      }
      .lb-rank {
        color: var(--secondary-text-color);
        font-variant-numeric: tabular-nums;
      }
      .lb-crest { width: 18px; height: 18px; object-fit: contain; }
      .lb-name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .lb-value {
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .lb-top.self,
      .lb-row.self,
      .st-row.self {
        background: color-mix(in srgb, var(--primary-color) 16%, transparent);
      }
      .lb-row.self .lb-name,
      .st-row.self .st-name { font-weight: 600; }
      /* A long name has a short form, for where a column is narrow. */
      .short-name { display: none; }
      /* A list of names is a list of links; underlining every one of them
         is noise, so they say so on hover instead. */
      .lb-card .player-link,
      .st-table .player-link,
      .ts-board .player-link { text-decoration: none; }
      .lb-card .player-link:hover,
      .st-table .player-link:hover,
      .ts-board .player-link:hover { text-decoration: underline; }
      /* Tables: rank and name, then a handful of figures under headings
         that sort. */
      .st-groups {
        flex: none;
        display: flex;
        gap: 6px;
        padding: 2px 0 8px;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .st-groups::-webkit-scrollbar { display: none; }
      .st-groups .filter-chip { height: 30px; padding: 0 10px; font-size: 0.8em; }
      .st-table { display: flex; flex-direction: column; }
      .st-row {
        display: grid;
        gap: 4px;
        align-items: center;
        min-height: 34px;
        padding: 0 4px;
        border-top: 1px solid var(--divider-color);
        border-radius: 6px;
        font-size: 0.86em;
        font-variant-numeric: tabular-nums;
      }
      .st-row > span:nth-child(n + 3) { text-align: right; white-space: nowrap; }
      /* Not held at the top while the list scrolls: there it would slide
         under the close button and the dialog's own switch. */
      .st-row.head {
        min-height: 28px;
        border-top: none;
        border-radius: 0;
        color: var(--secondary-text-color);
        text-transform: uppercase;
      }
      .st-row .sorted { font-weight: 700; }
      .st-row.head > span { font-size: 0.8em; letter-spacing: 0; }
      .st-arrow { font-size: 0.75em; margin-left: 1px; }
      .st-row.unranked { opacity: 0.6; }
      .st-rank { color: var(--secondary-text-color); font-size: 0.92em; }
      .st-name {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
      }
      .st-name .player-link { overflow: hidden; text-overflow: ellipsis; }
      .st-crest { width: 18px; height: 18px; flex: none; object-fit: contain; }
      .st-short {
        padding: 10px 4px 4px;
        font-size: 0.74em;
        color: var(--secondary-text-color);
      }
      .st-more { margin-top: 10px; flex: none; }
      .st-legend {
        padding-top: 10px;
        font-size: 0.72em;
        line-height: 1.5;
        color: var(--secondary-text-color);
      }
      @media (max-width: 460px) {
        .st-row { gap: 3px; padding: 0 2px; font-size: 0.82em; }
        .st-crest { width: 16px; height: 16px; }
        .st-name { gap: 4px; }
        .st-name .full-name { display: none; }
        .st-name .short-name { display: inline; }
      }
      /* A club's figures, each with a bar from the league's worst to its
         best and the average marked across it. */
      .ts-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto 2.6em;
        grid-template-areas:
          'label value place'
          'track track track';
        align-items: baseline;
        column-gap: 10px;
        row-gap: 4px;
        padding: 7px 0 6px;
        border-top: 1px solid var(--divider-color);
        font-size: 0.88em;
      }
      .ts-label { grid-area: label; min-width: 0; color: var(--primary-text-color); }
      .ts-value {
        grid-area: value;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .ts-row .st-place { grid-area: place; text-align: right; }
      .ts-track {
        grid-area: track;
        position: relative;
        height: 5px;
        border-radius: 3px;
        background: rgba(127, 127, 127, 0.18);
      }
      .ts-fill {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        border-radius: 3px;
      }
      .ts-mean {
        position: absolute;
        top: -3px;
        bottom: -3px;
        width: 2px;
        margin-left: -1px;
        border-radius: 1px;
        background: var(--primary-text-color);
        opacity: 0.55;
      }
      .ts-leaders {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        padding-top: 4px;
      }
      @media (max-width: 420px) {
        .ts-leaders { grid-template-columns: minmax(0, 1fr); }
      }
      .ts-board {
        display: flex;
        flex-direction: column;
        min-width: 0;
        padding: 8px 10px;
        border-radius: 12px;
        background: var(--secondary-background-color);
      }
      .ts-board-title {
        padding-bottom: 4px;
        font-size: 0.7em;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .ts-board-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto 2.4em;
        gap: 6px;
        align-items: baseline;
        padding: 3px 0;
        font-size: 0.84em;
      }
      .ts-board-place {
        text-align: right;
        font-size: 0.82em;
        color: var(--secondary-text-color);
        font-variant-numeric: tabular-nums;
      }
      /* ---- Odds ---- */
      .odds {
        display: inline-flex;
        align-items: baseline;
        gap: 4px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        color: var(--secondary-text-color);
      }
      .odds-mark {
        font-size: 0.8em;
        font-weight: 600;
        color: var(--secondary-text-color);
        opacity: 0.7;
      }
      .odds .odds-mark:not(:first-child) { margin-left: 6px; }
      .face-odds { margin-top: 4px; font-size: 0.8em; }
      .pv-odds {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
        flex: none;
        margin-top: 4px;
      }
      .pv-odds-tile {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        min-width: 0;
        padding: 8px 6px;
        border-radius: 12px;
        background: var(--secondary-background-color);
        border: 1px solid transparent;
      }
      .pv-odds-tile.favourite {
        border-color: color-mix(in srgb, var(--primary-color) 45%, transparent);
      }
      .pv-odds-label {
        display: flex;
        gap: 5px;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.78em;
        color: var(--secondary-text-color);
      }
      .pv-odds-price {
        font-size: 1.35em;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        color: var(--primary-text-color);
      }
      .pv-odds-chance {
        font-size: 0.75em;
        font-variant-numeric: tabular-nums;
        color: var(--secondary-text-color);
      }

      /* ---- A game ahead ---- */
      /* Between games the face's middle opens the next game's preview. */
      .middle.tappable { cursor: pointer; border-radius: 10px; }
      .middle.tappable:hover .kickoff { color: var(--primary-color); }
      .middle.tappable:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }
      .scoreboard.upcoming .sb-team { color: var(--primary-text-color); }
      .scoreboard.upcoming .sb-score { color: var(--primary-text-color); }
      /* The time is the score's size, a little smaller: it is not a result. */
      .sb-score.pv-time { font-size: 2.2em; letter-spacing: 0.01em; }
      .pv-subhead {
        padding: 10px 0 0;
        font-size: 0.78em;
        font-weight: 600;
        color: var(--secondary-text-color);
      }
      .pv-source {
        padding-top: 6px;
        font-size: 0.74em;
        color: var(--secondary-text-color);
      }
      .pv-h2h { padding: 4px 0 2px; }
      .pv-history-toggle { margin-top: 10px; flex: none; }
      /* The table, club against club: the better figure lit, a label between. */
      .pv-vs { display: flex; flex-direction: column; flex: none; }
      .pv-vs-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
        align-items: baseline;
        gap: 10px;
        padding: 6px 4px;
        border-top: 1px solid var(--divider-color);
        font-variant-numeric: tabular-nums;
      }
      .pv-vs-row:first-child { border-top: none; }
      .pv-vs-value { font-size: 1.02em; color: var(--secondary-text-color); }
      .pv-vs-value.away { text-align: right; }
      .pv-vs-value.lead { color: var(--primary-text-color); font-weight: 700; }
      .pv-vs-label {
        font-size: 0.72em;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        text-align: center;
        color: var(--secondary-text-color);
      }
      /* Form: a card for each club, its edge in the club's colour. */
      .pv-teams {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        flex: none;
      }
      .pv-team {
        display: flex;
        flex-direction: column;
        gap: 9px;
        min-width: 0;
        padding: 10px 12px 12px;
        border-radius: 12px;
        border-top: 3px solid var(--club, var(--primary-color));
        background: var(--secondary-background-color);
      }
      .pv-team-head {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        font-weight: 600;
      }
      .pv-crest { width: 24px; height: 24px; flex: none; object-fit: contain; }
      .pv-crest.placeholder { border-radius: 50%; background: var(--divider-color); }
      .pv-team-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pv-fact { display: flex; flex-direction: column; gap: 3px; min-width: 0; font-size: 0.86em; }
      .pv-fact-label {
        font-size: 0.74em;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .pv-fact-value {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 8px;
        color: var(--primary-text-color);
        font-variant-numeric: tabular-nums;
      }
      .pv-fact-value.warn { color: var(--warning-color, #ffa726); }
      .pv-form { display: inline-flex; gap: 4px; }
      .pv-form .form-pip { width: 12px; height: 12px; }
      .pv-record { color: var(--secondary-text-color); }
      @media (max-width: 340px) {
        .pv-teams { grid-template-columns: minmax(0, 1fr); }
      }
      /* A player's figures with where each puts him in the league. */
      .lr-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
      }
      @media (max-width: 420px) {
        .lr-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      .lr-tile {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1px;
        min-width: 0;
        padding: 8px 4px;
        border-radius: 10px;
        background: var(--secondary-background-color);
        text-align: center;
      }
      .lr-value {
        font-size: 1.1em;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .lr-label {
        font-size: 0.68em;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      @media (max-width: 420px) {
        .crest, .placeholder { max-width: 62px; max-height: 58px; }
        .placeholder { width: 62px; height: 58px; }
        .score { font-size: 2.1em; }
      }
`;

/** The badge: the same parts, behind a chip in the row of badges. */
export const badgeStyles = css`
        :host { display: inline-block; }
        /* The look of Home Assistant's own entity badge, so the chip sits in
           the row of badges as one of them. */
        .chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          box-sizing: border-box;
          height: var(--ha-badge-size, 36px);
          min-width: var(--ha-badge-size, 36px);
          padding: 0 12px 0 8px;
          border-radius: var(--ha-badge-border-radius, 18px);
          border: var(--ha-card-border-width, 1px) solid
            var(--ha-card-border-color, var(--divider-color, #e0e0e0));
          background: var(--ha-card-background, var(--card-background-color, #fff));
          box-shadow: var(--ha-card-box-shadow, none);
          -webkit-backdrop-filter: var(--ha-card-backdrop-filter, none);
          backdrop-filter: var(--ha-card-backdrop-filter, none);
          color: var(--primary-text-color);
          font-size: var(--ha-font-size-s, 12px);
          font-weight: 500;
          line-height: 1;
          white-space: nowrap;
          cursor: pointer;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
        .chip:focus-visible {
          outline: 2px solid var(--primary-color);
          outline-offset: 2px;
        }
        .chip.is-live {
          border-color: color-mix(in srgb, var(--red-color, #f44336) 55%, transparent);
        }
        .chip.empty { color: var(--secondary-text-color); }
        .chip ha-icon { --mdc-icon-size: 18px; color: var(--secondary-text-color); }
        .chip-crest { width: 20px; height: 20px; object-fit: contain; flex: none; }
        .chip-text { display: inline-flex; align-items: center; gap: 5px; }
        .chip-score {
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }
        .chip-detail {
          color: var(--secondary-text-color);
          font-variant-numeric: tabular-nums;
        }
        .chip-detail.won { color: var(--green-color, #4caf50); }
        .chip-detail.lost { color: var(--red-color, #f44336); }
        .chip-dot {
          width: 8px;
          height: 8px;
          flex: none;
          border-radius: 50%;
          background: var(--red-color, #f44336);
          animation: chip-pulse 1.6s ease-in-out infinite;
        }
        @keyframes chip-pulse { 50% { opacity: 0.35; } }
        @media (prefers-reduced-motion: reduce) { .chip-dot { animation: none; } }
        /* The badge row sets a small type size; the dialog is read like the
           card's, so it is put back. */
        dialog {
          font-size: var(--ha-font-size-m, 14px);
          font-weight: normal;
          line-height: normal;
          white-space: normal;
        }
        /* The badge's sections head the dialog on a wide screen; the nav
           comes after the view in the markup, for the phone's tab bar. */
        .dialog-nav {
          display: flex;
          order: -1;
          flex-wrap: wrap;
          flex: none;
          gap: 6px;
          /* Clear of the floating close button in the corner. */
          padding: 10px 52px 6px 14px;
        }
        .panel,
        .panel.tight { padding-top: 8px; }
        /* The tabs choose the view, so the table's own switch gives way to a
           heading. */
        .section-switch { display: none; }
        .section-heading { display: block; }
`;
