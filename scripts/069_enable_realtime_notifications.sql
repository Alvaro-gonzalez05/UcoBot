-- Enable Realtime for notifications table
-- This fixes the CHANNEL_ERROR when subscribing to notification changes

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
