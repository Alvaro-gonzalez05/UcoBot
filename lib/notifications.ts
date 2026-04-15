import { createAdminClient } from "@/lib/supabase/server";
import webpush from "web-push";

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:soporte@ucobot.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

interface CreateNotificationParams {
  userId: string;
  title: string;
  message: string;
  type?: NotificationType;
  link?: string;
  metadata?: any;
}

async function sendPushToUser(userId: string, title: string, body: string, url?: string) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  try {
    const supabase = createAdminClient();
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', userId);

    if (!subscriptions || subscriptions.length === 0) return;

    const payload = JSON.stringify({
      title,
      body,
      url: url || '/dashboard',
      icon: '/favicon.png',
      tag: 'ucobot-' + Date.now(),
    });

    const expiredIds: string[] = [];

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          expiredIds.push(sub.id);
        }
      }
    }

    if (expiredIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', expiredIds);
    }
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
}

export async function createNotification({
  userId,
  title,
  message,
  type = 'info',
  link,
  metadata
}: CreateNotificationParams) {
  try {
    const supabase = createAdminClient();
    
    const { error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        title,
        message,
        type,
        link,
        metadata,
        read: false
      });

    if (error) {
      console.error('Error creating notification:', error);
      return false;
    }

    // Also send a Web Push notification
    await sendPushToUser(userId, title, message, link);

    return true;
  } catch (error) {
    console.error('Exception creating notification:', error);
    return false;
  }
}
