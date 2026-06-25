// Supabase Edge Function: send-push-notification
// يستقبل: { title, body, targetUserIds: [1,2,3] أو null للكل }
// ويبعت إشعار push لكل اشتراك مفعّل مطابق

import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

webpush.setVapidDetails(
  "mailto:admin@krno.local",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

Deno.serve(async (req) => {
  try {
    const { title, body, targetUserIds } = await req.json();

    // Fetch matching enabled subscriptions
    let url = `${SUPABASE_URL}/rest/v1/wh_push_subscriptions?enabled=eq.true`;
    if (targetUserIds && targetUserIds.length) {
      url += `&user_id=in.(${targetUserIds.join(",")})`;
    }

    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    const subs = await res.json();

    const payload = JSON.stringify({ title, body });
    let sent = 0, failed = 0;

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload
        );
        sent++;
      } catch (e) {
        failed++;
        // Remove dead subscriptions (410 Gone / 404)
        if (e.statusCode === 410 || e.statusCode === 404) {
          await fetch(
            `${SUPABASE_URL}/rest/v1/wh_push_subscriptions?id=eq.${sub.id}`,
            {
              method: "DELETE",
              headers: {
                apikey: SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
            }
          );
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent, failed, total: subs.length }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
