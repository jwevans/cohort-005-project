# Research: How web push works for a browser-only app

Ticket: [#7](https://github.com/jwevans/cohort-005-project/issues/7), part of map [#1](https://github.com/jwevans/cohort-005-project/issues/1).
Sources checked: **2026-11-13**. This note covers platform facts only. It does not compare vendors (see #2) and does not set channel policy (see #5).

## TL;DR

- Web push uses three open standards: the Push API, the Notifications API and Service Workers. All current desktop browsers support it, and so does Android Chrome/Firefox. On **iOS/iPadOS 16.4+ it works only for a site that the user has added to the Home Screen**. A Safari tab gets no push, and in-app webviews get none either.
- Requirements: HTTPS, a registered service worker, a VAPID key pair (`applicationServerKey`), and `userVisibleOnly: true`. Every push must show a notification, so silent push is not available. The permission prompt must follow a user gesture. Ask in context, after a soft pre-prompt.
- Delivery is best-effort. The push service queues each message until its TTL runs out. Desktop Chrome and Firefox receive messages only while the browser process is running. macOS Safari and Android receive them even when the browser is closed. The protocol gives no "read" signal, so you have to build engagement tracking yourself.
- The standard email fallback has three cases. Use email when push is unsupported or denied, when the subscription has expired (404/410), and when the push was not clicked within a set window. The last case needs your own click tracking.

## 1. Browser support

From MDN browser-compat-data (`api/PushManager.json`, read 2026-11-13: https://github.com/mdn/browser-compat-data/blob/main/api/PushManager.json). MDN marks the Push API as **Baseline "Widely available" since March 2023** (https://developer.mozilla.org/en-US/docs/Web/API/Push_API).

| Platform | Push API since | Notes |
|---|---|---|
| Chrome desktop / Android | 42 | `applicationServerKey` (VAPID) required |
| Edge | 17 | `applicationServerKey` required |
| Firefox desktop | 44 | `subscribe()` needs a user gesture from 72 |
| Firefox Android | 48 | user gesture needed from 79 |
| Opera / Samsung Internet | mirror Chrome | |
| Safari macOS | 16 | macOS Ventura (13) or later only |
| Safari iOS/iPadOS | 16.4 | **only web apps saved to the Home Screen** |
| Android WebView, iOS WKWebView (in-app browsers) | not supported | |

### iOS / iPadOS details

- iOS/iPadOS 16.4 added Web Push for **Home Screen web apps**. The permission request must come "in response to direct user interaction". Notifications show on the Lock Screen, in Notification Center and on Apple Watch, and they respect Focus modes. The Badging API (`setAppBadge`) is available too. Delivery runs through the Apple Push Notification service, and no Apple Developer account is needed. If you allowlist endpoints, allow `*.push.apple.com`. (WebKit blog, 2023-02-16: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- Before iOS 26, the manifest had to set `display: standalone` or `fullscreen`, or the Home Screen icon was just a Safari bookmark (same source). The manifest `id` identifies the app across devices for Focus sync.
- **Safari 26 (iOS/iPadOS 26, fall 2025):** "By default, every website added to the Home Screen opens as a web app", with or without a manifest. Users can switch off "Open as Web App". (WebKit WWDC25 post: https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/). A manifest is still worth shipping for the icon, name, `id` and older iOS versions.
- **Declarative Web Push** (iOS/iPadOS 18.4, macOS 15.5): the push payload is a JSON notification that the browser shows itself, so no service worker is required. It is backward compatible with standard Web Push. (WebKit blog, 2025-03-27: https://webkit.org/blog/16535/meet-declarative-web-push/). This is optional; standard SW-based push works everywhere.
- In practice, an iPhone user reached through a Safari tab can't get push until they install the site to the Home Screen. Installation is a manual Share → Add to Home Screen step, and iOS has no install prompt API.

## 2. Mechanics: service worker, VAPID, subscription

Flow, per web.dev "Push notifications overview" (https://web.dev/articles/push-notifications-overview) and MDN Push API:

1. The page registers a service worker over HTTPS. Push and Notifications are secure-context only (MDN Notifications API: https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API).
2. After a user gesture, call `Notification.requestPermission()`, then `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`.
   - `applicationServerKey` is the VAPID **ECDSA P-256 public key**. Once it is set, every send must carry a VAPID JWT signed with the private key. Chrome and Edge require it, and they reject the subscription unless `userVisibleOnly` is `true`. (MDN `PushManager.subscribe`: https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe)
3. The resulting `PushSubscription` (an `endpoint` plus `p256dh`/`auth` keys) goes to the server and is stored **per user per device/browser**. The endpoint is a capability URL, so keep it secret, and protect the subscribe endpoint against CSRF (MDN Push API).
4. The server encrypts the payload with the subscription keys, signs a VAPID JWT, and POSTs to the endpoint. The push service (FCM for Chrome, Mozilla autopush, WNS for Edge, APNs for Safari) cannot read the payload (web.dev overview).
5. The browser wakes the service worker and fires `push`. The SW **must** call `showNotification()`. Apple: Web Push "is not an invitation for silent background runtime", and failing to show notifications gets the subscription revoked (WebKit "Meet Web Push", 2022-06-07: https://webkit.org/blog/12945/meet-web-push/).
6. `notificationclick` / `notificationclose` fire in the SW and open or focus the right page (MDN Notifications API). On mobile you **must** use SW ("persistent") notifications, because `new Notification()` throws on most mobile browsers (same source).
7. Handle `pushsubscriptionchange`, which fires when a subscription is invalidated or about to expire, and re-subscribe (MDN Push API).

Server-side response handling: **404/410 means the subscription is gone**, so delete it (web.dev "Sending messages with web push libraries": https://web.dev/articles/sending-messages-with-web-push-libraries). Push services must accept payloads of at least 4096 bytes (RFC 8030 §7.2), so send small payloads such as title, body and URL.

## 3. Permission prompt: rules and UX best practice

Hard browser rules:

- **Firefox 72+** shows no prompt without a user interaction. Instead it puts a small icon in the URL bar (Mozilla, 2019-11-04: https://blog.mozilla.org/futurereleases/2019/11/04/restricting-notification-permission-prompts-in-firefox/). Firefox Android 79+ has the same rule (MDN BCD).
- **Safari macOS/iOS** requires a user gesture before the request (WebKit sources above).
- **Chrome quiet UI** (Chrome 80, 2020) replaces the prompt with a small bell or chip for users who usually deny notifications and for **sites with very low accept rates**. Sites leave quiet UI once their accept rate improves. Abusive sites are blocked outright (Chromium blog, 2020-01-07: https://blog.chromium.org/2020/01/introducing-quieter-permission-ui-for.html). Prompting cold on page load therefore reduces reach for everyone who visits later.
- **Chrome auto-revocation** (announced 2025-10-10) removes notification permission from sites with very low engagement and high notification volume, on Android and desktop. **Installed web apps are excluded**. (https://blog.google/chromium/automatic-notification-permission/)
- **Chrome push rate limits** (rolling out from January 2026) limit "disruptive" sites to 1,000 messages/minute and return HTTP 429. Chrome scores this daily from pushes per time-on-site, prompts per time-on-site and engagement. Restrictions last 1, 7, then 14 days, and the count resets after 42 clean days. Most sites are unaffected. (Chrome for Developers, 2026-01-06: https://developer.chrome.com/blog/web-push-rate-limits)
- A `denied` permission can't be re-prompted from script. The page can only detect it (Permissions API) and show instructions for re-enabling it in browser settings (web.dev permissions best practices: https://web.dev/articles/permissions-best-practices).

Best practice (web.dev permissions best practices):

- Don't prompt on page load. Prompts with a signal of user intent were accepted about 30% of the time, against 12% without one.
- Ask **in context**, when the value is obvious, for example right after the user does something whose follow-ups they'd want to hear about.
- Show an in-page **pre-prompt** first, and call the browser prompt only if the user says yes there. This keeps a "not now" from turning into a permanent browser `denied`.
- **Offer email as the alternative** in the same pre-prompt ("updates can arrive as emails or notifications").

## 4. Delivery reliability

- **Best effort, store-and-forward.** If the device is offline, the push service holds the message until **TTL** runs out, then drops it. The `TTL` header is required. `TTL: 0` means deliver now or never. Services may cap the TTL and report the cap they applied. (RFC 8030 §5.2, §7.2: https://datatracker.ietf.org/doc/html/rfc8030; web.dev overview)
- **Urgency** (`very-low` / `low` / `normal` / `high`): a battery-saving device may accept only the higher urgencies, so lower ones wait until it is charging or on Wi-Fi. **Topic** collapses queued messages: a newer message with the same topic replaces the pending one, which is useful for messages like "3 new replies" (RFC 8030 §5.3–5.4).
- **Browser closed:**
  - Android: the OS wakes Chrome, so push arrives with the browser closed (web.dev Push FAQ: https://web.dev/articles/push-notifications-faq).
  - Desktop Chrome: messages arrive while the browser process runs, even with no windows open. "The only time a push won't be received is when the browser is completely closed". On Windows it's hard to tell whether Chrome is still running in the background (same FAQ). Queued messages arrive on next launch if they are still within TTL. The FAQ says other browsers "may do different things". Firefox desktop is generally understood to work like Chrome here, but **I found no first-party Mozilla statement**.
  - macOS Safari: "Safari doesn't even need to be running", because a system daemon (`webpushd`) handles delivery (WebKit "Meet Web Push").
  - iOS: delivered through APNs to the installed Home Screen app.
- **No delivery or read receipts in practice.** A successful 201 from the push service means "accepted", not "shown" or "seen". The only reliable engagement signals are your own: the SW can beacon the server from `push` (received) and `notificationclick` (opened). The OS or Focus mode can still suppress display.
- **Subscriptions decay.** Users clear data, revoke permission, or Chrome auto-revokes it. Expect 404/410 responses and `pushsubscriptionchange`, and prune stale subscriptions.
- MDN: Firefox puts a per-site quota on pushes that *don't* show a notification. The quota resets when the user visits. Chrome "has no limits" on this, though see the 2026 rate limits above for disruptive sites (MDN Push API).

## 5. Email fallback: how it's typically done

No standard defines this. It's an application pattern built from the facts above:

1. **Capability and permission gate (at subscribe time).** Feature-detect `'serviceWorker' in navigator && 'PushManager' in window`. If push is unsupported (e.g. an iOS Safari tab, an in-app webview, old Safari) or `Notification.permission === 'denied'`, the user is email-only. web.dev explicitly recommends offering email as the alternative in the pre-prompt.
2. **Per-device subscriptions.** A user can have zero or more push subscriptions, one per browser/device. "Push-reachable" means at least one live subscription.
3. **Send-time routing.** Send push to all live subscriptions. Delete any that return 404/410. If none remain, send email immediately.
4. **Unread escalation (delayed email).** Track `notificationclick`, or the user visiting the linked page, server-side. If the notification isn't acted on within a set window, send email (or roll it into a digest). Use `Topic` and a TTL roughly matching that window, so a stale push doesn't arrive after the email has gone.
5. **De-duplicate.** Mark the notification as read when it is clicked or when the underlying item is viewed in-app, and suppress the pending email.

## 6. Implications for Cadence (inputs to #5, not decisions)

- **Platform reach:** desktop students on Chrome, Edge, Firefox or macOS Safari can get push with no install step. Android Chrome works with no install step. **iPhone/iPad students need to install Cadence to the Home Screen** (iOS 16.4+) before push is possible, and Cadence can't prompt them to install. Mobile-heavy iOS audiences will therefore mostly be email-only unless Cadence adds an "Add to Home Screen" nudge.
- **Build pieces needed:** HTTPS (already true in prod), a service worker served from the site root (React Router SSR serves it from `public/`), a web app manifest (name, icons, `id`, `display: standalone`), VAPID keys in server env, a `push_subscriptions` table keyed per user and device, a send path that prunes 404/410, and SW handlers for `push`, `notificationclick` and `pushsubscriptionchange`.
- **Prompt placement matters:** prompting on load risks Chrome quiet UI for every later visitor. Natural in-context moments are things like enrolling in a course, or asking a question and wanting to hear about the answer, which tie to the events in #3/#4. Pair the pre-prompt with an email option.
- **Every push must be visible.** Push can't be used for silent background sync (e.g. prefetching lessons).
- **Push is best-effort and closed-desktop-browser-blind.** Anything that must reach the student (deadlines, cohort start, instructor replies) needs an email path, either always or via unread escalation. That requires click/receipt tracking that Cadence would build itself or get from a vendor (#2).
- **Volume discipline protects reach.** Chrome auto-revocation (2025) and push rate limits (2026) penalize high-volume, low-engagement senders, while installed PWAs are exempt from auto-revocation. That argues for fewer, high-value pushes and digests, which is an input to the preferences design.
