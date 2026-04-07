-- Enable Realtime for orders table

-- Add table to the supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
