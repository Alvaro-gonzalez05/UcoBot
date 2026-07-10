-- Índices para claves foráneas sin cobertura (46 detectadas por el Performance
-- Advisor de Supabase). Sin índice, filtrar/joinear por estas columnas hace
-- scans completos → lento y peor a medida que crecen los datos.
-- Todos IF NOT EXISTS para poder re-correr sin problema.

-- Core (CRM / POS / chat / reservas / automatizaciones)
CREATE INDEX IF NOT EXISTS idx_automation_logs_automation_id ON public.automation_logs (automation_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_scheduled_message_id ON public.automation_logs (scheduled_message_id);
CREATE INDEX IF NOT EXISTS idx_conversations_client_id ON public.conversations (client_id);
CREATE INDEX IF NOT EXISTS idx_demo_sessions_claimed_by_user_id ON public.demo_sessions (claimed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_client_id ON public.form_submissions (client_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_user_id ON public.form_submissions (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_client_id ON public.orders (client_id);
CREATE INDEX IF NOT EXISTS idx_orders_conversation_id ON public.orders (conversation_id);
CREATE INDEX IF NOT EXISTS idx_reservations_client_id ON public.reservations (client_id);
CREATE INDEX IF NOT EXISTS idx_reservations_conversation_id ON public.reservations (conversation_id);
CREATE INDEX IF NOT EXISTS idx_reservations_service_id ON public.reservations (service_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_automation_id ON public.scheduled_messages (automation_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_bot_id ON public.scheduled_messages (bot_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_client_id ON public.scheduled_messages (client_id);
CREATE INDEX IF NOT EXISTS idx_templates_bot_id ON public.templates (bot_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON public.usage_logs (user_id);

-- Kit de transporte
CREATE INDEX IF NOT EXISTS idx_transport_containers_crt_id ON public.transport_containers (crt_id);
CREATE INDEX IF NOT EXISTS idx_transport_containers_user_id ON public.transport_containers (user_id);
CREATE INDEX IF NOT EXISTS idx_transport_crts_consignatario_client_id ON public.transport_crts (consignatario_client_id);
CREATE INDEX IF NOT EXISTS idx_transport_crts_destinatario_client_id ON public.transport_crts (destinatario_client_id);
CREATE INDEX IF NOT EXISTS idx_transport_crts_notificar_client_id ON public.transport_crts (notificar_client_id);
CREATE INDEX IF NOT EXISTS idx_transport_crts_permit_id ON public.transport_crts (permit_id);
CREATE INDEX IF NOT EXISTS idx_transport_crts_remitente_client_id ON public.transport_crts (remitente_client_id);
CREATE INDEX IF NOT EXISTS idx_transport_packages_container_id ON public.transport_packages (container_id);
CREATE INDEX IF NOT EXISTS idx_transport_packages_crt_id ON public.transport_packages (crt_id);
CREATE INDEX IF NOT EXISTS idx_transport_packages_trip_id ON public.transport_packages (trip_id);
CREATE INDEX IF NOT EXISTS idx_transport_packages_user_id ON public.transport_packages (user_id);
CREATE INDEX IF NOT EXISTS idx_transport_permit_items_user_id ON public.transport_permit_items (user_id);
CREATE INDEX IF NOT EXISTS idx_transport_seals_container_id ON public.transport_seals (container_id);
CREATE INDEX IF NOT EXISTS idx_transport_seals_trip_id ON public.transport_seals (trip_id);
CREATE INDEX IF NOT EXISTS idx_transport_seals_user_id ON public.transport_seals (user_id);
CREATE INDEX IF NOT EXISTS idx_transport_settings_default_carrier_id ON public.transport_settings (default_carrier_id);
CREATE INDEX IF NOT EXISTS idx_transport_settings_default_corridor_id ON public.transport_settings (default_corridor_id);
CREATE INDEX IF NOT EXISTS idx_transport_settings_default_driver_id ON public.transport_settings (default_driver_id);
CREATE INDEX IF NOT EXISTS idx_transport_settings_default_semi_id ON public.transport_settings (default_semi_id);
CREATE INDEX IF NOT EXISTS idx_transport_settings_default_tractor_id ON public.transport_settings (default_tractor_id);
CREATE INDEX IF NOT EXISTS idx_transport_shipping_permits_document_id ON public.transport_shipping_permits (document_id);
CREATE INDEX IF NOT EXISTS idx_transport_shipping_permits_exporter_client_id ON public.transport_shipping_permits (exporter_client_id);
CREATE INDEX IF NOT EXISTS idx_transport_trip_events_user_id ON public.transport_trip_events (user_id);
CREATE INDEX IF NOT EXISTS idx_transport_trips_carrier_id ON public.transport_trips (carrier_id);
CREATE INDEX IF NOT EXISTS idx_transport_trips_corridor_id ON public.transport_trips (corridor_id);
CREATE INDEX IF NOT EXISTS idx_transport_trips_driver2_id ON public.transport_trips (driver2_id);
CREATE INDEX IF NOT EXISTS idx_transport_trips_driver_id ON public.transport_trips (driver_id);
CREATE INDEX IF NOT EXISTS idx_transport_trips_semi_id ON public.transport_trips (semi_id);
CREATE INDEX IF NOT EXISTS idx_transport_trips_tractor_id ON public.transport_trips (tractor_id);
CREATE INDEX IF NOT EXISTS idx_transport_vehicles_carrier_id ON public.transport_vehicles (carrier_id);
