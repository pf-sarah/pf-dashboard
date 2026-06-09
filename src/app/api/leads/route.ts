// app/api/leads/route.ts
// ------------------------------------------------------------
// Receives lead form submissions from pressedfloral.com and
// posts them to Slack via an Incoming Webhook.
//
// SETUP (one-time):
// 1. Create the Slack webhook (see chat instructions).
// 2. In Vercel → your ops-dashboard project → Settings →
//    Environment Variables, add:
//      SLACK_LEAD_WEBHOOK_URL = https://hooks.slack.com/services/XXX/YYY/ZZZ
// 3. Drop this file at app/api/leads/route.ts and deploy.
// ------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGINS = new Set([
  "https://pressedfloral.com",
  "https://www.pressedfloral.com",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://pressedfloral.com";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req.headers.get("origin"));

  try {
    const body = await req.json();

    // Honeypot: bots fill the hidden field. Pretend success so they move on.
    if (body._gotcha) {
      return NextResponse.json({ ok: true }, { headers });
    }

    const fields: Record<string, string> =
      body.fields && typeof body.fields === "object" ? body.fields : {};

    // Require at least one real value
    const entries = Object.entries(fields).filter(([, v]) => typeof v === "string" && v.trim());
    if (entries.length === 0) {
      return NextResponse.json({ ok: false, error: "Empty submission" }, { status: 400, headers });
    }

    // Pull out name / phone / email heuristically for the headline + call link
    const findValue = (match: RegExp) =>
      entries.find(([label]) => match.test(label))?.[1] ?? null;

    const firstName = findValue(/first\s*name/i) ?? findValue(/^name$/i);
    const lastName = findValue(/last\s*name/i);
    const name = [firstName, lastName].filter(Boolean).join(" ") || "New lead";
    const phone = findValue(/phone/i);
    const email = findValue(/e-?mail/i);

    // Build a tap-to-call link for Slack
    const phoneDigits = phone ? phone.replace(/\D/g, "") : null;
    const telLink =
      phoneDigits && phoneDigits.length >= 10
        ? `<tel:+1${phoneDigits.slice(-10)}|${phone}>`
        : phone;

    // Slack Block Kit message
    const detailLines = entries
      .filter(([label]) => !/phone/i.test(label)) // phone gets its own prominent line
      .map(([label, value]) => `*${label}:* ${value}`)
      .join("\n");

    const blocks: unknown[] = [
      {
        type: "header",
        text: { type: "plain_text", text: `🌸 New lead: ${name}`, emoji: true },
      },
      ...(telLink
        ? [
            {
              type: "section",
              text: { type: "mrkdwn", text: `📞 *Call now:* ${telLink}` },
            },
          ]
        : []),
      {
        type: "section",
        text: { type: "mrkdwn", text: detailLines || "_No additional details_" },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Submitted from ${body.page ?? "pressedfloral.com"} · ${new Date().toLocaleString(
              "en-US",
              { timeZone: "America/Denver", dateStyle: "medium", timeStyle: "short" }
            )} MT`,
          },
        ],
      },
    ];

    const webhookUrl = process.env.SLACK_LEAD_WEBHOOK_URL;
    if (!webhookUrl) {
      console.error("SLACK_LEAD_WEBHOOK_URL is not set");
      return NextResponse.json({ ok: false, error: "Not configured" }, { status: 500, headers });
    }

    const slackRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `🌸 New lead: ${name}${phone ? ` — ${phone}` : ""}`, // fallback for notifications
        blocks,
      }),
    });

    if (!slackRes.ok) {
      console.error("Slack webhook failed:", slackRes.status, await slackRes.text());
      return NextResponse.json({ ok: false, error: "Notification failed" }, { status: 502, headers });
    }

    return NextResponse.json({ ok: true }, { headers });
  } catch (err) {
    console.error("Lead submission error:", err);
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400, headers });
  }
}
