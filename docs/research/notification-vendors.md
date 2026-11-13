# Research: Hosted notification vendors for Cadence

Ticket: [#2](https://github.com/jwevans/cohort-005-project/issues/2) (part of map [#1](https://github.com/jwevans/cohort-005-project/issues/1)).
Sources checked: **2026-11-13**. Pricing pages change often; re-check before signing up.

Scope: vendor comparison only. How browser web push works (support, service worker, permission prompt) is split out to ticket #7. Here we only note whether each vendor offers web push as a channel and whether it can fall back to email when an in-app Notification goes unread.

Firm filters: hosted (no self-hosting) and a free/dev tier so development costs nothing. All six vendors pass both.

## Comparison

| Vendor | Free tier (2026-11-13) | Next tier | In-app feed | Web push channel | Email | Unread → email fallback | Batching / digests | Preferences | Local / test story |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Knock** | 10,000 messages/mo (one message = one user on one channel), unlimited seats, workflows, channels. No hard cap: Knock contacts you to add billing if you go over. [1] | Starter $250/mo, 50k messages [1] | Prebuilt `@knocklabs/react` (feed popover, bell, cells), real-time sockets, plus `@knocklabs/client` JS SDK for custom UI; signed user token in enhanced security mode [3] | **No native web push.** Push providers are APNs, FCM (documented as Android), Expo, Amazon SNS, OneSignal. Web push would go through OneSignal [2] | Yes, bring your own provider (e.g. Postmark), billed separately [1] | **Yes, documented.** Message-status step condition, "Only send an email if an in-app notification was not previously read or seen", with a delay step before it [4] | Batch function on all tiers: windows, batch keys, max 90 days open [5] | All tiers, by channel, workflow, and category. Per-tenant preferences need Enterprise [1] | Development and production environments with separate API keys and data, plus branches and a CLI. No local emulator [6] |
| **Novu Cloud** | 10,000 workflow runs/mo, **max 5 workflows**, 3 team members, 2 environments (Dev and Prod), 24h activity-feed retention, digest window ≤ 1 day [7][8] | Pro from $30/mo, 30k runs, digest ≤ 7 days [7][8] | Prebuilt `<Inbox />` (`@novu/react`, React 18+) with a built-in Preferences component, plus headless hooks or `@novu/js`; HMAC `subscriberHash` [9] | Via providers: FCM (incl. web app), OneSignal, Pusher Beams, Pushpad, push webhook, and others. No native VAPID sender documented [10] | Yes, bring your own provider (Postmark supported) | **Yes, documented.** Step condition on `steps.<in-app-step>.read` / `.seen` after a Delay step [11] | Digest step: regular or scheduled windows, aggregation key; window capped by plan (1 day on Free) [8] | Built-in subscriber preferences per workflow and channel, with a UI in Inbox [9] | Dev environment on Free. Code-first `@novu/framework` workflows served from a bridge endpoint in your app (`npx novu init`) [12] |
| **MagicBell** | **1,000 deliveries/mo** (each channel counts separately), unlimited users, 1 project [13] | Startup $249/mo, 50k deliveries [13] | Prebuilt React components (FloatingInbox, Inbox, ContextProvider); no headless option documented on the in-app page [15] | **Native web push** with your VAPID keys; stores raw PushSubscription (`endpoint`, `p256dh`, `auth`) [14] | SES, Mailgun, SendGrid, SMTP (**no Postmark listed**) [16] | Not documented on channel pages ("Smart Delivery" is mentioned on pricing only) [13] | Not mentioned [13] | Per channel and per category [15] | JWT auth for project and user; no test mode found |
| **SuprSend** | 10,000 notifications/mo, unlimited channels and team members, in-app feed shows SuprSend branding. **Batching/digests and preferences not included** [17] | Essentials $100/mo (annual). Digests and preferences need Business at $250/mo [17] | `@suprsend/react` drop-in inbox plus headless option; signed JWT user tokens [18] | **Native web push** with a VAPID key auto-generated per account, SDK-provided service worker, and a React web-push SDK [19] | Bring your own provider | Smart Channel Routing stops later channels once a Notification is Seen or clicked, but inbox and the first outside channel fire together at T+0. Plan availability not stated [20] | **Not on Free** [17] | **Not on Free** [17] | Not researched in depth |
| **Courier** | 10,000 sends/mo (one template to one recipient, so a multi-channel send counts once); all SDKs, CLI, MCP server [21] | Pay as you go, $0.005/send [21] | `@trycourier/courier-react` `<CourierInbox />` with JWT sign-in [22]. Pricing page does not say whether Inbox is on the free tier | Via providers: FCM (web), Pusher Beams, OneSignal, NowPush, or a custom webhook. No native VAPID [23] | Yes, many providers incl. Postmark | Journeys support delay plus send conditions on prior message status. Courier's recipe checks a prior email's "OPENED". A condition on Inbox read status is not documented [24] | "Digest & batching" is listed but not tied to a tier [21] | Yes (hosted preference centre); tier not stated [21] | Test/production environments (not verified on a current page) |
| **OneSignal** | 10,000 email sends/mo; web push "10,000 free" (max 10k subscribers per send); in-app messaging free up to 1,000 MAU but **mobile only**; 3 journeys [25] | Growth from $19/mo; web push $0.004/subscriber [25] | **No web in-app inbox/feed**. In-app messages are mobile banners [25] | **Native web push**, its core product [25] | Yes (own email sending) | Journeys can branch, but there is no feed to be "unread" | Limited (journeys) | Subscription-level opt-in/out, not a per-type preference centre | n/a |

Not included: **NotificationAPI** (now rebranded as Pingram; the pricing page redirects to pingram.io), Engagespot, and Customer.io. These are possible fallbacks if the shortlist falls through. None was checked.

## Shortlist with trade-offs (non-binding; the decision is ticket #4)

1. **Knock**: strongest fit for the feed plus email core.
   - Pros: polished React feed with real-time updates, and a documented "email only if the in-app Notification wasn't read" condition. Batching and preferences are on Free. 10k messages/mo with no hard cutoff. Clean dev/prod environments. Works with Postmark.
   - Cons: **no native web push**. Browser push would need OneSignal as a second vendor. The next tier jumps to $250/mo.
2. **Novu Cloud**: the most generous all-in-one on Free.
   - Pros: Inbox with a built-in Preferences UI and headless hooks, read/seen step conditions, digest, and Dev/Prod environments. Code-first workflows can live in the repo. Pro tier is cheap ($30/mo).
   - Cons: **only 5 workflows on Free**, which may be fewer than the Notification catalogue (#3 decides that size). One workflow per Notification type would hit the cap fast. Digest window is limited to 1 day on Free. Web push only through FCM, OneSignal, or Pushpad. Activity log keeps 24 hours.
3. **MagicBell**: the only all-in-one with **native VAPID web push** and a prebuilt React inbox.
   - Pros: simplest web push story.
   - Cons: **1,000 deliveries/mo** on Free is tight for dev and seeded demo data. No digests documented. No documented unread-to-email fallback. Postmark is not in its email provider list. Next tier is $249/mo.

Dropped from the shortlist:

- **SuprSend**: native web push, but digests and preferences are not on Free (Business tier only), and its unread fallback can't hold email back behind the in-app feed.
- **Courier**: capable, but web push and Inbox-read fallback aren't first-class.
- **OneSignal**: no web in-app feed, which disqualifies it as the primary vendor. It remains useful as Knock's web push provider.

Key trade-off for #4: **Knock (+ OneSignal for push)** vs **Novu (watch the 5-workflow cap)** vs **MagicBell (native push, thin free quota)**. Whether web push is in the channel policy at all (see #7) largely decides between them.

## Sources (all checked 2026-11-13)

1. Knock pricing: https://knock.app/pricing
2. Knock push integrations: https://docs.knock.app/integrations/push/overview
3. Knock React feed: https://docs.knock.app/in-app-ui/react/feed
4. Knock step conditions (message status): https://docs.knock.app/designing-workflows/step-conditions
5. Knock batch function: https://docs.knock.app/send-notifications/designing-workflows/batch-function
6. Knock environments: https://docs.knock.app/concepts/environments
7. Novu pricing: https://novu.co/pricing
8. Novu digest step: https://docs.novu.co/platform/workflow/add-and-configure-steps/configure-action-steps/digest
9. Novu Inbox overview: https://docs.novu.co/platform/inbox/overview
10. Novu push integrations: https://docs.novu.co/platform/integrations/push
11. Novu step conditions: https://docs.novu.co/platform/workflow/add-and-configure-steps/step-conditions
12. Novu Framework: https://docs.novu.co/framework/overview
13. MagicBell pricing: https://www.magicbell.com/pricing
14. MagicBell web push channel: https://www.magicbell.com/docs/channels/web_push
15. MagicBell in-app channel: https://www.magicbell.com/docs/channels/in_app
16. MagicBell docs index (email integrations): https://www.magicbell.com/docs
17. SuprSend pricing: https://www.suprsend.com/pricing
18. SuprSend React inbox: https://docs.suprsend.com/docs/inbox-react
19. SuprSend web push setup: https://docs.suprsend.com/docs/web-push-vendor-integration, https://docs.suprsend.com/docs/js-webpush, https://docs.suprsend.com/docs/react-webpush
20. SuprSend Smart Channel Routing: https://docs.suprsend.com/docs/smart-delivery
21. Courier pricing: https://www.courier.com/pricing
22. Courier Inbox: https://www.courier.com/docs/platform/inbox/inbox-overview
23. Courier push integrations: https://www.courier.com/docs/integrations/push/overview, https://www.courier.com/docs/integrations/push/firebase-fcm
24. Courier recipe (delay + send condition): https://www.courier.com/recipes/welcome-email-sequence
25. OneSignal pricing: https://onesignal.com/pricing

Caveats: the Novu "unlimited subscribers" figure and Courier's free-tier Inbox/preferences coverage came from pricing tables that were hard to parse, so confirm both in the dashboard. Courier environments were not verified on a current docs page.
