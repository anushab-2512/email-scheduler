import { env } from '../config/env';
import { logger } from '../utils/logger';

const SLACK_AUTH_URL = 'https://slack.com/oauth/v2/authorize';
const SLACK_TOKEN_URL = 'https://slack.com/api/oauth.v2.access';

export function getSlackAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    scope: 'incoming-webhook,chat:write',
    redirect_uri: env.SLACK_REDIRECT_URL,
    state,
  });
  return `${SLACK_AUTH_URL}?${params.toString()}`;
}

export async function exchangeSlackCode(code: string): Promise<{
  teamId: string;
  teamName: string;
  accessToken: string;
  webhookUrl: string;
}> {
  const res = await fetch(SLACK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      redirect_uri: env.SLACK_REDIRECT_URL,
    }),
  });

  const data = await res.json() as any;

  if (!data.ok) {
    logger.error('SLACK', 'OAuth token exchange failed', { error: data.error });
    throw new Error(`Slack OAuth failed: ${data.error}`);
  }

  return {
    teamId: data.team?.id || '',
    teamName: data.team?.name || '',
    accessToken: data.access_token || '',
    webhookUrl: data.incoming_webhook?.url || '',
  };
}

export async function sendSlackMessage(webhookUrl: string, message: string): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: message,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: message,
          },
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error('SLACK', 'Failed to send message', { status: res.status, body: text });
    throw new Error('Failed to send Slack message');
  }

  logger.info('SLACK', 'Message sent successfully');
}
