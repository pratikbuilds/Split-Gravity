import { env } from '../../../config/env';

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export class ExpoPushNotifier {
  async send(messages: ExpoMessage[]) {
    if (!env.EXPO_PUSH_ACCESS_TOKEN || messages.length === 0) return;

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.EXPO_PUSH_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(messages),
    });
  }
}
