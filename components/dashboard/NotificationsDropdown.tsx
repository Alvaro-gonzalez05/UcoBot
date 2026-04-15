"use client";

import { useState, useEffect, useRef } from "react";
import { Bell, Check, Clock, Settings, Trash2, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useIntersectionObserver } from "@/hooks/use-intersection-observer";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  title: string;
  message: string;
  created_at: string;
  read: boolean;
  type: 'info' | 'success' | 'warning' | 'error';
  link?: string;
  metadata?: any;
}

const PAGE_SIZE = 10;

interface NotificationsDropdownProps {
  position?: 'sidebar' | 'header';
}

export default function NotificationsDropdown({ position = 'sidebar' }: NotificationsDropdownProps) {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  
  const supabase = createClient();
  const router = useRouter();
  
  // Intersection observer for infinite scroll
  const { ref: loadMoreRef, isIntersecting } = useIntersectionObserver({
    threshold: 0.1,
    triggerOnce: false
  });

  const playNotificationSound = () => {
    try {
      const audio = new Audio('/sounds/notification.mp3');
      audio.play().catch(error => console.log("Audio play failed (user interaction required):", error));
    } catch (e) {
      console.error("Error initializing audio:", e);
    }
  };

  useEffect(() => {
    console.log("🔔 NotificationsDropdown mounted");
    setMounted(true);
    
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        fetchNotifications(0, user.id);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!userId) return;

    console.log("🔔 Subscribing to notifications for user:", userId);

    // Subscribe to realtime changes
    const channel = supabase
      .channel(`notifications_user_${userId}`)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        }, 
        (payload) => {
          console.log("🔔 Notification received:", payload);
          if (payload.eventType === 'INSERT') {
            const newNotification = payload.new as Notification;
            
            // Play notification sound
            playNotificationSound();

            setNotifications(prev => {
              // Avoid duplicates
              if (prev.some(n => n.id === newNotification.id)) return prev;
              return [newNotification, ...prev];
            });
            
            // Only show toast if it's NOT a handover request (to avoid double alerting)
            // or if the user specifically requested to hide it
            if (newNotification.title !== "Solicitud de Humano" && newNotification.title !== "Solicitud de Humano (IA)") {
               toast.info(newNotification.title, {
                description: newNotification.message,
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            setNotifications(prev => prev.map(n => 
              n.id === payload.new.id ? { ...n, ...payload.new } : n
            ));
          } else if (payload.eventType === 'DELETE') {
            setNotifications(prev => prev.filter(n => n.id !== payload.old.id));
          }
        }
      )
      .subscribe((status) => {
        console.log("🔔 Subscription status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Load more when scrolling to bottom
  useEffect(() => {
    if (isIntersecting && hasMore && !isLoading && !isLoadingMore && isOpen) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchNotifications(nextPage);
    }
  }, [isIntersecting, isOpen]);

  const fetchNotifications = async (pageNumber: number, specificUserId?: string) => {
    try {
      if (pageNumber === 0) setIsLoading(true);
      else setIsLoadingMore(true);

      let targetUserId = specificUserId;
      
      if (!targetUserId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        targetUserId = user.id;
        if (!userId) setUserId(user.id);
      }

      const from = pageNumber * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      
      const newNotifications = data || [];
      
      setNotifications(prev => {
        if (pageNumber === 0) return newNotifications;
        
        // Filter out duplicates that might have been added via realtime or offset shifts
        const existingIds = new Set(prev.map(n => n.id));
        const uniqueNewNotifications = newNotifications.filter(n => !existingIds.has(n.id));
        
        return [...prev, ...uniqueNewNotifications];
      });

      if (newNotifications.length < PAGE_SIZE) {
        setHasMore(false);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  if (!mounted) {
    return null;
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = async (id: string) => {
    // Optimistic update
    setNotifications(notifications.map(n => 
      n.id === id ? { ...n, read: true } : n
    ));

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      // Revert on error
      fetchNotifications(0);
    }
  };

  const markAllAsRead = async () => {
    // Optimistic update
    setNotifications(notifications.map(n => ({ ...n, read: true })));

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false);

      if (error) throw error;
    } catch (error) {
      console.error('Error marking all as read:', error);
      fetchNotifications(0);
    }
  };

  const deleteNotification = async (id: string) => {
    // Optimistic update
    setNotifications(notifications.filter(n => n.id !== id));

    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting notification:', error);
      fetchNotifications(0);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);
    setIsOpen(false);
    
    if (notification.link) {
      router.push(notification.link);
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'success': return 'bg-green-500';
      case 'error': return 'bg-red-500';
      case 'warning': return 'bg-yellow-500';
      default: return 'bg-blue-500';
    }
  };

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors duration-200"
      >
        <Bell className="h-5 w-5 text-white" />
        {unreadCount > 0 && (
          <motion.span 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Overlay */}
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setIsOpen(false)}
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, ...(position === 'sidebar' ? { x: -10 } : { y: -10 }) }}
              animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, ...(position === 'sidebar' ? { x: -10 } : { y: -10 }) }}
              transition={{ duration: 0.2 }}
              className={cn(
                "absolute z-50 w-80 sm:w-96 max-h-[80vh] overflow-y-auto rounded-xl sm:rounded-2xl bg-white shadow-2xl dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 [&::-webkit-scrollbar]:hidden",
                position === 'sidebar'
                  ? "left-full bottom-0 ml-3"
                  : "right-0 top-full mt-2"
              )}
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {/* Header */}
              <div className="p-3 sm:p-4 border-b border-neutral-200 dark:border-neutral-700">
                <div className="flex items-center justify-between">
                  <h3 className="text-base sm:text-lg font-semibold text-neutral-900 dark:text-white">
                    Centro de Notificaciones
                  </h3>
                  <div className="flex items-center space-x-1 sm:space-x-2">
                    <button
                      onClick={markAllAsRead}
                      className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                    >
                      <span className="hidden sm:inline">Marcar todas como leídas</span>
                      <span className="sm:hidden">Marcar todas</span>
                    </button>
                    <button className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors">
                      <Settings className="h-3 w-3 sm:h-4 sm:w-4 text-neutral-500 dark:text-neutral-400" />
                    </button>
                  </div>
                </div>
                {unreadCount > 0 && (
                  <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                    Tienes {unreadCount} notificación{unreadCount !== 1 ? 'es' : ''} sin leer
                  </p>
                )}
              </div>

              {/* Notifications List */}
              <div className="max-h-96 overflow-y-auto">
                {isLoading ? (
                  <div className="p-8 text-center text-neutral-500">Cargando...</div>
                ) : notifications.length > 0 ? (
                  notifications.map((notification) => (
                    <motion.div
                      key={notification.id}
                      className={`p-3 sm:p-4 border-b border-neutral-100 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors cursor-pointer ${
                        !notification.read ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''
                      }`}
                      onClick={() => handleNotificationClick(notification)}
                      whileHover={{ x: 4 }}
                      transition={{ type: "spring", stiffness: 400, damping: 17 }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 mr-3">
                          <div className="flex items-center space-x-2 mb-1">
                            <div className={`w-2 h-2 rounded-full ${getTypeColor(notification.type)}`} />
                            <h4 className={`text-xs sm:text-sm font-medium ${
                              !notification.read 
                                ? 'text-neutral-900 dark:text-white' 
                                : 'text-neutral-600 dark:text-neutral-300'
                            }`}>
                              {notification.title}
                            </h4>
                            {!notification.read && (
                              <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-500 rounded-full" />
                            )}
                          </div>
                          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mb-2">
                            {notification.message}
                          </p>
                          <div className="flex items-center text-xs text-neutral-400 dark:text-neutral-500">
                            <Clock className="w-3 h-3 mr-1" />
                            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: es })}
                          </div>
                        </div>
                        <div className="flex items-center space-x-1">
                          {!notification.read && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                markAsRead(notification.id);
                              }}
                              className="p-1 rounded-full hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                              title="Marcar como leída"
                            >
                              <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNotification(notification.id);
                            }}
                            className="p-1 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                            title="Eliminar notificación"
                          >
                            <Trash2 className="w-3 h-3 text-red-500 dark:text-red-400" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="p-8 text-center">
                    <Bell className="w-12 h-12 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
                    <p className="text-neutral-500 dark:text-neutral-400">
                      No tienes notificaciones
                    </p>
                  </div>
                )}
                
                {/* Loader for infinite scroll */}
                {hasMore && !isLoading && notifications.length > 0 && (
                  <div ref={loadMoreRef} className="p-4 flex justify-center">
                    {isLoadingMore ? (
                      <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
                    ) : (
                      <div className="h-1 w-full" /> // Invisible trigger
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              {notifications.length > 0 && (
                <div className="p-4 border-t border-neutral-200 dark:border-neutral-700 text-center">
                  <button className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors font-medium">
                    Ver todas las notificaciones
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}