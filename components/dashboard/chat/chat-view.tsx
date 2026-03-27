"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { motion, useMotionValue, useTransform, PanInfo } from "framer-motion"
import { useIsMobile } from "@/hooks/use-mobile"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Search, Send, Phone, MoreVertical, Paperclip, Smile, CheckCheck, PauseCircle, PlayCircle, RefreshCw, Loader2, MapPin, Reply, X, ArrowLeft, Star, ShoppingBag, StickyNote } from "lucide-react"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { useIntersectionObserver } from "@/hooks/use-intersection-observer"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

interface Conversation {
  id: string
  client_name: string
  client_phone: string
  client_instagram_id?: string
  platform: string
  last_message_at: string
  status: string
  bot_id: string
  client_id?: string
  unread_count?: number // Virtual field
  last_message?: string // Virtual field
  paused_until?: string | null
  needs_attention?: boolean
}

interface Message {
  id: string
  content: string
  sender_type: 'client' | 'bot'
  created_at: string
  message_type: string
  metadata?: any
  is_read?: boolean
}

interface ClientProfile {
  id: string
  name: string
  phone?: string | null
  instagram_username?: string | null
  points?: number | null
  total_purchases?: number | null
  last_purchase_date?: string | null
}

interface ClientOrder {
  id: string
  status: string
  total_amount: number
  created_at: string
}

function ReplyMessage({ 
  replyId, 
  initialMessage, 
  isClient, 
  clientName,
  onScrollToMessage 
}: { 
  replyId: string
  initialMessage?: Message
  isClient: boolean
  clientName: string
  onScrollToMessage: (id: string) => void
}) {
  const [message, setMessage] = useState<Message | undefined>(initialMessage)
  const [loading, setLoading] = useState(!initialMessage)
  const supabase = createClient()

  useEffect(() => {
    if (initialMessage) {
        setMessage(initialMessage)
        setLoading(false)
        return
    }

    const fetchMessage = async () => {
      setLoading(true)
      // Try to find by whatsapp_message_id, platform_message_id or internal id
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`metadata->>whatsapp_message_id.eq.${replyId},metadata->>platform_message_id.eq.${replyId},id.eq.${replyId}`)
        .maybeSingle()
      
      if (data) {
        setMessage(data)
      }
      setLoading(false)
    }

    fetchMessage()
  }, [replyId, initialMessage]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="text-xs opacity-50 mb-2">Cargando mensaje original...</div>
  
  const senderName = message 
    ? (message.sender_type === 'client' ? clientName : 'Nosotros')
    : 'Mensaje no disponible'

  return (
    <div className={cn(
      "text-xs border-l-4 pl-2 mb-2 rounded p-2 cursor-pointer transition-colors",
      isClient 
        ? "bg-muted/50 border-primary/50 hover:bg-muted/70" 
        : "bg-black/10 border-white/50 hover:bg-black/20"
    )}
    onClick={(e) => {
      e.stopPropagation()
      if (message?.id) {
        onScrollToMessage(message.id)
      }
    }}
    >
      <p className={cn(
        "font-bold text-[10px] mb-0.5",
        isClient ? "text-primary" : "text-white/90"
      )}>
        {senderName}
      </p>
      <p className={cn(
        "line-clamp-2 max-w-[300px]",
        isClient ? "text-muted-foreground" : "text-white/80"
      )}>
        {message?.content || "No se pudo cargar el mensaje original"}
      </p>
    </div>
  )
}

interface ChatViewProps {
  userId: string
}

const SwipeableMessage = ({ 
  children, 
  onReply, 
  isClient 
}: { 
  children: React.ReactNode
  onReply: () => void
  isClient: boolean 
}) => {
  const x = useMotionValue(0)
  const opacity = useTransform(x, [0, 30, 60], [0, 0.5, 1])
  const scale = useTransform(x, [0, 60], [0.5, 1])
  
  // Enable drag on all devices
  const dragProps = {
    drag: "x" as const,
    dragConstraints: { left: 0, right: 0 },
    dragElastic: { right: 0.3, left: 0 },
    onDragEnd: (e: any, info: PanInfo) => {
      if (info.offset.x > 60) {
        onReply()
      }
    }
  }

  return (
    <div className={cn("relative flex items-center w-full", isClient ? "justify-start" : "justify-end")}>
       <motion.div 
         style={{ opacity, scale }} 
         className="absolute left-2 z-0 flex items-center justify-center text-muted-foreground"
       >
         <div className="bg-background/80 rounded-full p-2 shadow-sm border">
           <Reply className="h-4 w-4" />
         </div>
       </motion.div>

       <motion.div
         {...dragProps}
         style={{ x }}
         className={cn("relative z-10 max-w-[85%] md:max-w-[70%]", isClient ? "mr-auto" : "ml-auto")}
       >
         {children}
       </motion.div>
    </div>
  )
}

export function ChatView({ userId }: ChatViewProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [messagesPage, setMessagesPage] = useState(0)
  const [hasMoreMessages, setHasMoreMessages] = useState(true)
  const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false)
  const MESSAGES_PAGE_SIZE = 20
  const shouldScrollToBottomRef = useRef(true)
  const previousScrollHeightRef = useRef(0)

  const [searchTerm, setSearchTerm] = useState("")
  const [newMessage, setNewMessage] = useState("")
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [isPauseDialogOpen, setIsPauseDialogOpen] = useState(false)
  const [pauseDuration, setPauseDuration] = useState("indefinite")
  const [isSending, setIsSending] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState<string>("")
  const [pendingPause, setPendingPause] = useState<{ duration: string | null } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [isClientDetailsOpen, setIsClientDetailsOpen] = useState(false)
  const [isLoadingClientDetails, setIsLoadingClientDetails] = useState(false)
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null)
  const [clientOrders, setClientOrders] = useState<ClientOrder[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  
  // Pagination state
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const PAGE_SIZE = 15

  const { ref: loadMoreRef, isIntersecting } = useIntersectionObserver({
    threshold: 0.1,
    rootMargin: '100px',
    triggerOnce: false
  })

  const fetchConversations = async (pageNumber: number) => {
    if (pageNumber === 0) setIsLoading(true)
    else setIsLoadingMore(true)
    
    try {
      const from = pageNumber * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      // Get conversations for user's bots
      // Note: Fetching all messages for each conversation is heavy, but needed for last_message and unread_count
      // Ideally this should be optimized with a DB view or function
      let query = supabase
        .from("conversations")
        .select(`
          *,
          messages:messages(content, created_at, sender_type, is_read)
        `)
        .eq("user_id", userId)
        .order("last_message_at", { ascending: false })
        .range(from, to)
      
      // If search term exists, we might need to adjust query or handle it differently
      // For now, let's assume search is client-side or we reset pagination on search
      // Implementing server-side search would require more changes
      
      const { data, error } = await query

      if (error) throw error

      // Process conversations to get last message
      const processedConversations = data.map((conv: any) => {
        // Sort messages to get the last one
        const sortedMessages = conv.messages?.sort((a: any, b: any) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        
        const lastMsg = sortedMessages?.[0]
        
        // Calculate unread count
        const unreadCount = conv.messages?.filter((m: any) => 
          m.sender_type === 'client' && m.is_read === false
        ).length || 0
        
        return {
          ...conv,
          last_message: lastMsg?.content || "Sin mensajes",
          unread_count: unreadCount
        }
      })

      setConversations(prev => {
        if (pageNumber === 0) return processedConversations
        
        // Filter duplicates
        const existingIds = new Set(prev.map(c => c.id))
        const newConvs = processedConversations.filter((c: any) => !existingIds.has(c.id))
        
        return [...prev, ...newConvs]
      })
      
      if (data.length < PAGE_SIZE) {
        setHasMore(false)
      }
    } catch (error) {
      console.error("Error fetching conversations:", error)
    } finally {
      setIsLoading(false)
      setIsLoadingMore(false)
    }
  }

  // Initial fetch
  useEffect(() => {
    fetchConversations(0)
  }, [userId])

  // Load more on scroll
  useEffect(() => {
    if (isIntersecting && hasMore && !isLoading && !isLoadingMore) {
      const nextPage = page + 1
      setPage(nextPage)
      fetchConversations(nextPage)
    }
  }, [isIntersecting, hasMore, isLoading, isLoadingMore])

  // Realtime subscription for new conversations
  useEffect(() => {
    const channel = supabase
      .channel('conversations_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'conversations', filter: `user_id=eq.${userId}` }, 
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            // Fetch the new conversation with its messages
            const { data, error } = await supabase
              .from("conversations")
              .select(`
                *,
                messages:messages(content, created_at, sender_type, is_read)
              `)
              .eq("id", payload.new.id)
              .single()
              
            if (!error && data) {
              const processedConv = {
                ...data,
                last_message: "Nuevo chat", // Simplified
                unread_count: 0
              }
              
              setConversations(prev => [processedConv, ...prev])
            }
          } else if (payload.eventType === 'UPDATE') {
            setConversations(prev => {
              const updatedList = prev.map(c => 
                c.id === payload.new.id ? { ...c, ...payload.new } : c
              )
              
              // If last_message_at changed, re-sort
              return updatedList.sort((a, b) => 
                new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
              )
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, supabase])

  const loadOlderMessages = async () => {
    if (isLoadingMoreMessages || !hasMoreMessages || !selectedConversation) return
    
    setIsLoadingMoreMessages(true)
    shouldScrollToBottomRef.current = false
    
    if (scrollRef.current) {
      previousScrollHeightRef.current = scrollRef.current.scrollHeight
    }

    try {
      const nextPage = messagesPage + 1
      const from = nextPage * MESSAGES_PAGE_SIZE
      const to = from + MESSAGES_PAGE_SIZE - 1

      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", selectedConversation.id)
        .order("created_at", { ascending: false })
        .range(from, to)

      if (error) throw error

      if (data.length < MESSAGES_PAGE_SIZE) {
        setHasMoreMessages(false)
      }

      const olderMessages = data.reverse()
      setMessages(prev => [...olderMessages, ...prev])
      setMessagesPage(nextPage)
    } catch (error) {
      console.error("Error loading older messages:", error)
    } finally {
      setIsLoadingMoreMessages(false)
    }
  }

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop } = e.currentTarget
    if (scrollTop === 0 && hasMoreMessages && !isLoadingMoreMessages) {
      loadOlderMessages()
    }
  }

  const handleJumpToMessage = async (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'transition-all', 'duration-500')
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'transition-all', 'duration-500')
      }, 2000)
      return
    }

    // Message not loaded, fetch history
    if (!selectedConversation || isLoadingMoreMessages) return

    const toastId = toast.loading("Cargando historial de mensajes...")
    setIsLoadingMoreMessages(true)
    shouldScrollToBottomRef.current = false
    
    if (scrollRef.current) {
      previousScrollHeightRef.current = scrollRef.current.scrollHeight
    }

    try {
      // 1. Get the target message to know its timestamp
      const { data: targetMsg, error: targetError } = await supabase
        .from('messages')
        .select('created_at, id')
        .eq('id', messageId)
        .single()

      if (targetError || !targetMsg) {
        toast.error("Mensaje no encontrado", { id: toastId })
        return
      }

      const oldestCurrentMsg = messages[0]
      if (!oldestCurrentMsg) return 

      // 2. Fetch all messages between target and oldest current
      // We want messages OLDER than oldestCurrentMsg AND NEWER OR EQUAL to targetMsg
      const { data: gapMessages, error: gapError } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', selectedConversation.id)
        .lt('created_at', oldestCurrentMsg.created_at)
        .gte('created_at', targetMsg.created_at)
        .order('created_at', { ascending: true }) // Get them in chronological order

      if (gapError) throw gapError

      if (gapMessages && gapMessages.length > 0) {
        setMessages(prev => [...gapMessages, ...prev])
        
        // Update pagination count
        const pagesLoaded = Math.ceil(gapMessages.length / MESSAGES_PAGE_SIZE)
        setMessagesPage(prev => prev + pagesLoaded)
        
        toast.success("Historial cargado", { id: toastId })
        
        // Scroll after render
        setTimeout(() => {
          const el = document.getElementById(`msg-${messageId}`)
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            el.classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'transition-all', 'duration-500')
            setTimeout(() => {
              el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'transition-all', 'duration-500')
            }, 2000)
          }
        }, 300)
      } else {
         toast.info("El mensaje debería estar visible", { id: toastId })
      }

    } catch (error) {
      console.error("Error jumping to message:", error)
      toast.error("Error cargando historial", { id: toastId })
    } finally {
      setIsLoadingMoreMessages(false)
    }
  }

  // Fetch messages when conversation is selected
  useEffect(() => {
    if (!selectedConversation) return

    const fetchMessages = async () => {
      setIsLoadingMessages(true)
      setMessagesPage(0)
      setHasMoreMessages(true)
      shouldScrollToBottomRef.current = true
      
      try {
        // Mark messages as read
        await supabase
          .from("messages")
          .update({ is_read: true })
          .eq("conversation_id", selectedConversation.id)
          .eq("sender_type", "client")
          .eq("is_read", false)

        // Update local conversation state to clear unread count
        setConversations(prev => prev.map(c => 
          c.id === selectedConversation.id ? { ...c, unread_count: 0 } : c
        ))

        const { data, error } = await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", selectedConversation.id)
          .order("created_at", { ascending: false })
          .range(0, MESSAGES_PAGE_SIZE - 1)

        if (error) throw error
        
        if (data.length < MESSAGES_PAGE_SIZE) {
          setHasMoreMessages(false)
        }

        setMessages(data.reverse() || [])
      } catch (error) {
        console.error("Error fetching messages:", error)
      } finally {
        setIsLoadingMessages(false)
      }
    }

    fetchMessages()

    // Realtime subscription for new messages
    const channel = supabase
      .channel(`messages_${selectedConversation.id}`)
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedConversation.id}` }, 
        async (payload) => {
          const newMessage = payload.new as Message
          
          // If message is from client and we are viewing it, mark as read immediately
          if (newMessage.sender_type === 'client') {
             await supabase
              .from("messages")
              .update({ is_read: true })
              .eq("id", newMessage.id)
          }

          setMessages(prev => {
            // Check if message already exists
            if (prev.some(m => m.id === newMessage.id)) return prev
            
            shouldScrollToBottomRef.current = true
            
            // Remove optimistic message if it matches content and is recent (simple heuristic)
            // We assume the optimistic message is at the end
            const filtered = prev.filter(m => {
              if (m.id.startsWith('temp-') && m.content === newMessage.content && m.sender_type === newMessage.sender_type) {
                return false
              }
              return true
            })
            
            return [...filtered, newMessage]
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${selectedConversation.id}`
        },
        (payload) => {
          const updatedMessage = payload.new as Message
          setMessages(prev => prev.map(m => 
            m.id === updatedMessage.id ? updatedMessage : m
          ))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedConversation, supabase, refreshKey])

  // Fetch client details and recent orders for right-side panel
  useEffect(() => {
    if (!selectedConversation) {
      setClientProfile(null)
      setClientOrders([])
      setIsClientDetailsOpen(false)
      return
    }

    let isCancelled = false

    const fetchClientDetails = async () => {
      setIsLoadingClientDetails(true)

      try {
        let foundClient: ClientProfile | null = null

        if (selectedConversation.client_id) {
          const { data } = await supabase
            .from("clients")
            .select("id, name, phone, instagram_username, points, total_purchases, last_purchase_date")
            .eq("id", selectedConversation.client_id)
            .maybeSingle()

          foundClient = (data as ClientProfile | null) ?? null
        }

        if (!foundClient && selectedConversation.platform === "whatsapp" && selectedConversation.client_phone) {
          const { data } = await supabase
            .from("clients")
            .select("id, name, phone, instagram_username, points, total_purchases, last_purchase_date")
            .eq("phone", selectedConversation.client_phone)
            .maybeSingle()

          foundClient = (data as ClientProfile | null) ?? null
        }

        if (!foundClient && selectedConversation.platform === "instagram" && selectedConversation.client_instagram_id) {
          const { data } = await supabase
            .from("clients")
            .select("id, name, phone, instagram_username, points, total_purchases, last_purchase_date")
            .eq("instagram", selectedConversation.client_instagram_id)
            .maybeSingle()

          foundClient = (data as ClientProfile | null) ?? null
        }

        let recentOrders: ClientOrder[] = []

        if (foundClient?.id) {
          const { data } = await supabase
            .from("orders")
            .select("id, status, total_amount, created_at")
            .eq("user_id", userId)
            .eq("client_id", foundClient.id)
            .order("created_at", { ascending: false })
            .limit(5)

          recentOrders = (data as ClientOrder[] | null) ?? []
        } else {
          const { data } = await supabase
            .from("orders")
            .select("id, status, total_amount, created_at")
            .eq("user_id", userId)
            .eq("conversation_id", selectedConversation.id)
            .order("created_at", { ascending: false })
            .limit(5)

          recentOrders = (data as ClientOrder[] | null) ?? []
        }

        if (!isCancelled) {
          setClientProfile(foundClient)
          setClientOrders(recentOrders)
        }
      } catch (error) {
        console.error("Error fetching client details:", error)
        if (!isCancelled) {
          setClientProfile(null)
          setClientOrders([])
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingClientDetails(false)
        }
      }
    }

    fetchClientDetails()

    return () => {
      isCancelled = true
    }
  }, [selectedConversation, supabase, userId])

  // Auto-scroll to bottom
  useEffect(() => {
    if (!scrollRef.current) return

    if (shouldScrollToBottomRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    } else {
      // Restore scroll position when loading older messages
      const newScrollHeight = scrollRef.current.scrollHeight
      const diff = newScrollHeight - previousScrollHeightRef.current
      if (diff > 0) {
        scrollRef.current.scrollTop = diff
      }
    }
  }, [messages])

    const updateBotStatus = async (newStatus: string, pausedUntil: string | null = null) => {
    if (!selectedConversation) return
    
    const actionText = newStatus === 'paused' ? 'pausado' : 'reanudado'
    const previousConv = { ...selectedConversation }
    
    // Optimistic update (Update UI immediately)
    const optimisticConv = { 
      ...selectedConversation, 
      status: newStatus,
      paused_until: newStatus === 'paused' ? pausedUntil : null,
      needs_attention: newStatus === 'active' ? false : selectedConversation.needs_attention // Clear attention flag if reactivating
    }
    
    setSelectedConversation(optimisticConv)
    setConversations(prev => prev.map(c => 
      c.id === selectedConversation.id ? optimisticConv : c
    ))

    try {
      const updateData: any = { status: newStatus }
      if (newStatus === 'paused') {
        updateData.paused_until = pausedUntil
      } else {
        updateData.paused_until = null
        updateData.needs_attention = false // Clear attention flag in DB
      }

      const { error } = await supabase
        .from('conversations')
        .update(updateData)
        .eq('id', selectedConversation.id)

      if (error) throw error
      
      toast.success(`IA ${actionText}`, {
        description: `La respuesta automática ha sido ${actionText} para ${selectedConversation.client_name}.`
      })
      
    } catch (error) {
      console.error("Error updating status:", error)
      
      // Revert on error
      setSelectedConversation(previousConv)
      setConversations(prev => prev.map(c => 
        c.id === selectedConversation.id ? previousConv : c
      ))

      toast.error("Error", {
        description: "No se pudo actualizar el estado del chat."
      })
    }
  }  // Countdown timer effect
  useEffect(() => {
    if (!selectedConversation || selectedConversation.status !== 'paused' || !selectedConversation.paused_until) {
      setTimeRemaining("")
      return
    }

    const updateTimer = () => {
      const now = new Date()
      const end = new Date(selectedConversation.paused_until!)
      const diff = end.getTime() - now.getTime()

      if (diff <= 0) {
        setTimeRemaining("Reanudando...")
        // Optionally trigger auto-resume here if frontend is open
        if (selectedConversation.status === 'paused') {
           updateBotStatus('active')
        }
        return
      }

      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)
      
      if (hours > 0) {
        setTimeRemaining(`${hours}h ${minutes}m ${seconds}s`)
      } else {
        setTimeRemaining(`${minutes}m ${seconds}s`)
      }
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [selectedConversation])

  const filteredConversations = conversations.filter(c => 
    c.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.client_phone?.includes(searchTerm)
  )

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return

    if (selectedConversation.status !== 'paused') {
      toast.error("La IA está activa", {
        description: "Debes pausar la respuesta automática para enviar mensajes manuales."
      })
      return
    }

    setIsSending(true)
    
    const messageToSend = newMessage
    // Use whatsapp_message_id if available (for WhatsApp replies), otherwise fallback to internal ID if needed
    const replyToId = replyingTo?.metadata?.whatsapp_message_id || replyingTo?.id

    // Optimistic update
    const tempId = `temp-${Date.now()}`
    const optimisticMessage: Message = {
      id: tempId,
      content: newMessage,
      sender_type: 'bot',
      created_at: new Date().toISOString(),
      message_type: 'text',
      metadata: { 
        sent_by: 'agent', 
        status: 'sending',
        context: replyToId ? { id: replyToId } : undefined
      }
    }
    
    shouldScrollToBottomRef.current = true
    setMessages(prev => [...prev, optimisticMessage])
    
    setNewMessage("")
    setReplyingTo(null)

    // Determine recipient ID based on platform
    const recipientId = selectedConversation.platform === 'instagram' 
      ? selectedConversation.client_instagram_id 
      : selectedConversation.client_phone

    if (!recipientId) {
      toast.error("Error", {
        description: "No se encontró el ID del destinatario para esta conversación."
      })
      return
    }

    try {
      const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientId,
          message: messageToSend,
          conversationId: selectedConversation.id,
          replyToId: replyToId
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error sending message')
      }

      // Message will be added via realtime subscription
      // We keep the optimistic message until the real one arrives
      toast.success("Mensaje enviado")
    } catch (error) {
      console.error("Error sending message:", error)
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setNewMessage(messageToSend) // Restore message
      toast.error("Error al enviar mensaje", {
        description: error instanceof Error ? error.message : "Inténtalo de nuevo"
      })
    } finally {
      setIsSending(false)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !selectedConversation) return
    
    if (selectedConversation.status !== 'paused') {
      toast.error("La IA está activa", {
        description: "Debes pausar la respuesta automática para enviar archivos."
      })
      e.target.value = '' // Reset input
      return
    }

    const file = e.target.files[0]
    // Limit file size (e.g., 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Archivo muy grande", { description: "El tamaño máximo es 10MB" })
      e.target.value = ''
      return
    }

    setIsSending(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('conversationId', selectedConversation.id)
    // Optional: Add caption if we had a UI for it
    // formData.append('caption', newMessage) 

    try {
      const response = await fetch('/api/chat/send-media', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error sending file')
      }

      toast.success("Archivo enviado")
      setNewMessage("") // Clear input if we used it for caption
    } catch (error) {
      console.error("Error sending file:", error)
      toast.error("Error al enviar archivo", {
        description: error instanceof Error ? error.message : "Inténtalo de nuevo"
      })
    } finally {
      setIsSending(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handlePauseRequest = () => {
    if (!selectedConversation) return

    if (selectedConversation.status === 'paused') {
      // If already paused, resume immediately
      updateBotStatus('active')
    } else {
      // If active, open dialog to ask for duration
      setIsPauseDialogOpen(true)
      setPauseDuration("indefinite")
    }
  }

  // Handle pending pause after dialog closes to prevent UI locking
  useEffect(() => {
    if (!isPauseDialogOpen && pendingPause) {
      const timer = setTimeout(() => {
        updateBotStatus('paused', pendingPause.duration)
        setPendingPause(null)
        
        // Force cleanup of Radix UI locks
        document.body.style.pointerEvents = ''
        document.body.removeAttribute('data-scroll-locked')
      }, 300) // Wait for animation to finish
      
      return () => clearTimeout(timer)
    }
  }, [isPauseDialogOpen, pendingPause])

  const confirmPause = () => {
    let durationISO = null
    if (pauseDuration !== 'indefinite') {
      const now = new Date()
      const minutes = parseInt(pauseDuration)
      now.setMinutes(now.getMinutes() + minutes)
      durationISO = now.toISOString()
    }
    
    setPendingPause({ duration: durationISO })
    setIsPauseDialogOpen(false)
  }

  const formatTime = (dateString: string) => {
    if (!dateString) return ""
    const date = new Date(dateString)
    const now = new Date()
    
    // If today, show time
    if (date.toDateString() === now.toDateString()) {
      return format(date, "HH:mm")
    }
    
    // If this week, show day name
    if (now.getTime() - date.getTime() < 7 * 24 * 60 * 60 * 1000) {
      return format(date, "EEEE", { locale: es })
    }
    
    // Otherwise show date
    return format(date, "dd/MM/yyyy")
  }

  const getInitials = (name: string | undefined | null) => {
    if (!name) return "??"
    const cleanName = name.startsWith('@') ? name.substring(1) : name
    return cleanName.substring(0, 2).toUpperCase()
  }

  const getMediaUrl = (msg: Message) => {
    if (!selectedConversation) return ''
    
    const mediaId = msg.message_type === 'image' 
      ? msg.metadata?.image?.id 
      : msg.metadata?.audio?.id
      
    if (!mediaId) return ''
    
    return `/api/media/proxy?mediaId=${mediaId}&botId=${selectedConversation.bot_id}`
  }

  const formatCurrency = (value: number | null | undefined) => {
    if (!value) return "$0"
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(value)
  }

  const orderStatusLabel: Record<string, string> = {
    pending: "Pendiente",
    confirmed: "Confirmado",
    preparing: "En preparacion",
    ready: "Listo",
    delivered: "Entregado",
    cancelled: "Cancelado",
  }

  const clientDisplayName = clientProfile?.name || selectedConversation?.client_name || "Cliente"
  const inferredInstagramUsername = (() => {
    if (clientProfile?.instagram_username) {
      const username = clientProfile.instagram_username.trim()
      return username.startsWith("@") ? username : `@${username}`
    }

    if (selectedConversation?.platform === "instagram" && selectedConversation.client_name) {
      const fromName = selectedConversation.client_name.trim()
      if (!fromName.includes(" ")) {
        return fromName.startsWith("@") ? fromName : `@${fromName}`
      }
    }

    return "Usuario no disponible"
  })()
  const clientContactDisplay = selectedConversation?.platform === "instagram"
    ? inferredInstagramUsername
    : (clientProfile?.phone || selectedConversation?.client_phone || "Sin telefono")
  const clientPoints = clientProfile?.points || 0
  const recentOrdersSlice = clientOrders.slice(0, 2)
  const recurringOrderCount = clientOrders.length
  const totalPurchases = clientProfile?.total_purchases || clientOrders.reduce((sum, order) => sum + (order.total_amount || 0), 0)

  const latestClientMessage = [...messages].reverse().find((msg) => msg.sender_type === "client")
  const internalNote = latestClientMessage?.content
    ? `\"${latestClientMessage.content.slice(0, 120)}${latestClientMessage.content.length > 120 ? "..." : ""}\"`
    : "\"Sin nota interna para este cliente.\""

  return (
    <div className="flex h-full md:gap-4 bg-background relative overflow-hidden md:overflow-visible">
      {/* Sidebar - Conversation List */}
      <Card className="w-full md:w-1/3 flex flex-col overflow-hidden absolute inset-0 md:static z-10 bg-background rounded-none md:rounded-lg border-0 md:border">
        <div className="p-4 border-b bg-muted/30">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar conversación..." 
              className="pl-8" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col">
            {isLoading ? (
              <div className="p-4 text-center text-muted-foreground">Cargando conversaciones...</div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">No se encontraron conversaciones</div>
            ) : (
              filteredConversations.map((conv) => {
                const showUnread = (conv.unread_count || 0) > 0 && conv.status === 'paused'
                const needsAttention = conv.needs_attention && conv.status === 'paused'
                
                return (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConversation(conv)}
                  className={cn(
                    "flex items-start gap-3 p-4 text-left transition-colors hover:bg-muted/50 border-b last:border-0 relative",
                    selectedConversation?.id === conv.id && "bg-muted",
                    showUnread && !needsAttention && "bg-blue-50 dark:bg-blue-950/20",
                    needsAttention && "bg-red-50 dark:bg-red-950/20"
                  )}
                >
                  {showUnread && !needsAttention && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />
                  )}
                  {needsAttention && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500" />
                  )}
                  
                  <Avatar>
                    <AvatarImage src="" />
                    <AvatarFallback className={cn(
                      "text-white",
                      conv.platform === 'whatsapp' ? "bg-green-500" : "bg-pink-500"
                    )}>
                      {getInitials(conv.client_name)}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn("truncate", (showUnread || needsAttention) ? "font-bold text-foreground" : "font-medium")}>{conv.client_name}</span>
                      <span className={cn("text-xs whitespace-nowrap", needsAttention ? "text-red-600 font-bold" : showUnread ? "text-blue-600 font-medium" : "text-muted-foreground")}>
                        {formatTime(conv.last_message_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className={cn("text-sm truncate max-w-[180px]", (showUnread || needsAttention) ? "font-medium text-foreground" : "text-muted-foreground")}>
                        {conv.last_message}
                      </p>
                      {showUnread ? (
                        <Badge variant="default" className={cn("h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]", needsAttention ? "bg-red-500 hover:bg-red-600" : "")}>
                          {conv.unread_count}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-1 flex gap-1">
                      <Badge variant="outline" className="text-[10px] h-4 px-1 py-0">
                        {conv.platform}
                      </Badge>
                      {conv.status === 'paused' && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1 py-0 bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800">
                          IA Pausada
                        </Badge>
                      )}
                      {needsAttention && (
                        <Badge variant="destructive" className="text-[10px] h-4 px-1 py-0">
                          Ayuda
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              )})
            )}
            
            {/* Loader for infinite scroll */}
            {hasMore && !isLoading && !searchTerm && (
              <div ref={loadMoreRef} className="py-6 flex justify-center w-full">
                 <Loader2 className={cn("h-6 w-6 animate-spin text-muted-foreground transition-opacity", isLoadingMore ? "opacity-100" : "opacity-0")} />
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Main - Chat Window */}
      <Card className={cn(
        "flex-1 flex flex-col overflow-hidden transition-transform duration-300 ease-in-out absolute inset-0 md:static z-20 bg-background w-full md:w-auto rounded-none md:rounded-lg border-0 md:border",
        selectedConversation ? "translate-x-0" : "translate-x-full md:translate-x-0"
      )}>
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-3">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="md:hidden -ml-2 mr-1" 
                  onClick={() => setSelectedConversation(null)}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <button
                  type="button"
                  onClick={() => setIsClientDetailsOpen((prev) => !prev)}
                  className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  title="Ver informacion del cliente"
                >
                  <Avatar className="transition-transform hover:scale-105">
                    <AvatarFallback className={cn(
                      "text-white",
                      selectedConversation.platform === 'whatsapp' ? "bg-green-500" : "bg-pink-500"
                    )}>
                      {getInitials(selectedConversation.client_name)}
                    </AvatarFallback>
                  </Avatar>
                </button>
                <div>
                  <h3 className="font-medium">{selectedConversation.client_name}</h3>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    {selectedConversation.platform === 'instagram' ? inferredInstagramUsername : (selectedConversation.client_phone || "Sin telefono")}
                    {selectedConversation.platform === 'whatsapp' && <span className="text-green-600 ml-1">● WhatsApp</span>}
                    {selectedConversation.platform === 'instagram' && <span className="text-pink-600 ml-1">● Instagram</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 md:gap-2">
                {selectedConversation.status === 'paused' && (
                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 border-yellow-200 flex gap-1 whitespace-nowrap px-1.5 md:px-2.5">
                    <PauseCircle className="h-3 w-3" />
                    <span className="hidden md:inline">IA Pausada</span>
                    {timeRemaining && <span className="font-mono ml-0.5 md:ml-1 text-[10px] md:text-xs">({timeRemaining})</span>}
                  </Badge>
                )}
                <Button variant="ghost" size="icon" className="hidden md:flex">
                  <Phone className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setRefreshKey(prev => prev + 1)} title="Actualizar mensajes" className="hidden md:flex">
                  <RefreshCw className={cn("h-4 w-4", isLoadingMessages && "animate-spin")} />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setRefreshKey(prev => prev + 1)} className="md:hidden">
                       <RefreshCw className="mr-2 h-4 w-4" />
                       Actualizar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handlePauseRequest}>
                      {selectedConversation.status === 'paused' ? (
                        <>
                          <PlayCircle className="mr-2 h-4 w-4" />
                          Reactivar IA
                        </>
                      ) : (
                        <>
                          <PauseCircle className="mr-2 h-4 w-4" />
                          Pausar IA (Intervenir)
                        </>
                      )}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Messages Area */}
            <div 
              className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 bg-slate-50 dark:bg-slate-950/50"
              ref={scrollRef}
              onScroll={handleScroll}
            >
              {isLoadingMoreMessages && (
                <div className="flex justify-center py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {isLoadingMessages ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <p>No hay mensajes en esta conversación.</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isClient = msg.sender_type === 'client'
                  return (
                    <SwipeableMessage 
                      key={msg.id} 
                      onReply={() => setReplyingTo(msg)}
                      isClient={isClient}
                    >
                      <div id={`msg-${msg.id}`} className="relative group flex items-end gap-2">
                        {!isClient && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity hidden md:flex"
                            onClick={() => setReplyingTo(msg)}
                          >
                            <Reply className="h-3 w-3" />
                          </Button>
                        )}
                        
                        <div 
                          className={cn(
                            "rounded-lg p-3 shadow-sm relative",
                            isClient 
                              ? "bg-white dark:bg-slate-800 rounded-tl-none border" 
                              : "bg-primary text-primary-foreground rounded-tr-none"
                          )}
                        >
                          {/* Reply Context Display */}
                          {msg.metadata?.context?.id && (
                            <ReplyMessage 
                              replyId={msg.metadata.context.id}
                              initialMessage={messages.find(m => m.metadata?.whatsapp_message_id === msg.metadata.context.id || m.id === msg.metadata.context.id)}
                              isClient={isClient}
                              clientName={selectedConversation?.client_name || 'Cliente'}
                              onScrollToMessage={handleJumpToMessage}
                            />
                          )}

                          {msg.message_type === 'image' && msg.metadata?.image ? (
                          <div className="space-y-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img 
                              src={getMediaUrl(msg)} 
                              alt="Imagen compartida" 
                              className="rounded-md max-w-full h-auto max-h-[300px] object-cover"
                              onError={(e) => {
                                // Fallback if proxy fails or ID is missing
                                if (msg.metadata?.image?.url && e.currentTarget.src !== msg.metadata.image.url) {
                                  e.currentTarget.src = msg.metadata.image.url
                                }
                              }}
                            />
                            {msg.content && msg.content !== '[Image]' && (
                              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                            )}
                          </div>
                        ) : msg.message_type === 'audio' && msg.metadata?.audio ? (
                          <div className="min-w-[240px]">
                            <audio controls className="w-full h-10 mt-1">
                              <source src={getMediaUrl(msg)} type={msg.metadata.audio.mime_type} />
                              Tu navegador no soporta audio.
                            </audio>
                          </div>
                        ) : msg.message_type === 'location' && msg.metadata?.location ? (
                          <div className="min-w-[200px]">
                            <a 
                              href={`https://www.google.com/maps/search/?api=1&query=${msg.metadata.location.latitude},${msg.metadata.location.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex flex-col gap-2 hover:opacity-90 transition-opacity"
                            >
                              <div className="relative w-full h-32 bg-slate-200 rounded-md overflow-hidden flex items-center justify-center">
                                {/* Static map placeholder or actual map if API key available */}
                                <div className="absolute inset-0 bg-slate-300 flex items-center justify-center">
                                  <MapPin className="h-8 w-8 text-red-500" />
                                </div>
                                {/* Optional: Use Google Static Maps API if you have a key */}
                                {/* <img src={`https://maps.googleapis.com/maps/api/staticmap?center=${msg.metadata.location.latitude},${msg.metadata.location.longitude}&zoom=15&size=400x200&markers=color:red%7C${msg.metadata.location.latitude},${msg.metadata.location.longitude}&key=YOUR_KEY`} alt="Mapa" className="w-full h-full object-cover" /> */}
                              </div>
                              <div className="flex items-start gap-2">
                                <MapPin className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                                <div className="text-sm">
                                  <p className="font-medium">{msg.metadata.location.name || 'Ubicación'}</p>
                                  <p className="text-xs opacity-80">{msg.metadata.location.address || `${msg.metadata.location.latitude}, ${msg.metadata.location.longitude}`}</p>
                                </div>
                              </div>
                            </a>
                          </div>
                        ) : (
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        )}
                        <div className={cn(
                          "text-[10px] mt-1 flex items-center justify-end gap-1",
                          isClient ? "text-muted-foreground" : "text-primary-foreground/70"
                        )}>
                          {format(new Date(msg.created_at), "HH:mm")}
                          {!isClient && <CheckCheck className="h-3 w-3" />}
                        </div>
                      </div>
                      
                      {isClient && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity hidden md:flex"
                          onClick={() => setReplyingTo(msg)}
                        >
                          <Reply className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    </SwipeableMessage>
                  )
                })
              )}
            </div>

            {/* Input Area (Read Only for now or Mock) */}
            <div className="p-2 border-t bg-background">
              {replyingTo && (
                <div className="flex items-center justify-between bg-muted/50 p-2 rounded-md mb-2 border-l-4 border-primary">
                  <div className="flex flex-col text-sm">
                    <span className="font-semibold text-primary">
                      Respondiendo a {replyingTo.sender_type === 'client' ? selectedConversation.client_name : 'Bot'}:
                    </span>
                    <span className="text-muted-foreground truncate max-w-[300px]">
                      {replyingTo.content}
                    </span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6" 
                    onClick={() => setReplyingTo(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="text-muted-foreground">
                  <Smile className="h-5 w-5" />
                </Button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  onChange={handleFileSelect}
                  accept="image/*,audio/*,video/*,application/pdf"
                />
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-muted-foreground"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSending || selectedConversation.status !== 'paused'}
                >
                  <Paperclip className="h-5 w-5" />
                </Button>
                <Textarea 
                  placeholder="Escribe un mensaje..." 
                  className="flex-1 min-h-[50px] max-h-[120px] resize-none py-[14px]"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                  disabled={isSending}
                />
                <Button onClick={handleSendMessage} disabled={isSending || !newMessage.trim() || selectedConversation.status !== 'paused'}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
            <div className="bg-muted/50 p-6 rounded-full mb-4">
              <Send className="h-10 w-10 opacity-20" />
            </div>
            <h3 className="font-medium text-lg mb-2">Tus Mensajes</h3>
            <p className="text-center max-w-xs">
              Selecciona una conversación de la lista para ver el historial de mensajes con tus clientes.
            </p>
          </div>
        )}
      </Card>

      {selectedConversation && isClientDetailsOpen && (
        <Card className="absolute inset-y-0 right-0 z-30 w-full max-w-[340px] rounded-none border-l bg-[#f5f5f3] md:static md:w-[320px] md:max-w-none md:rounded-lg md:border">
          <ScrollArea className="h-full">
            <div className="p-4 sm:p-5">
              <div className="mb-6 flex items-center justify-between">
                <h3 className="text-xl font-semibold text-slate-800">Informacion del Cliente</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsClientDetailsOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="mb-6 flex flex-col items-center text-center">
                <Avatar className="h-20 w-20 border-4 border-white shadow-sm">
                  <AvatarFallback className={cn(
                    "text-xl text-white",
                    selectedConversation.platform === 'whatsapp' ? "bg-green-500" : "bg-pink-500"
                  )}>
                    {getInitials(clientDisplayName)}
                  </AvatarFallback>
                </Avatar>
                <h4 className="mt-3 text-2xl font-semibold text-slate-800">{clientDisplayName}</h4>
                <p className="text-sm text-slate-500">{clientContactDisplay}</p>
              </div>

              <div className="mb-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border bg-white p-4">
                  <p className="text-xs text-slate-400">PUNTOS</p>
                  <p className="mt-1 text-xl font-semibold text-slate-800 flex items-center gap-1">
                    <Star className="h-4 w-4 text-lime-500" />
                    {clientPoints.toLocaleString("es-AR")}
                  </p>
                </div>
                <div className="rounded-2xl border bg-white p-4">
                  <p className="text-xs text-slate-400">Total Pedidos</p>
                  <p className="mt-1 text-xl font-semibold text-slate-800 flex items-center gap-1">
                    <ShoppingBag className="h-4 w-4 text-slate-500" />
                    {recurringOrderCount}
                  </p>
                </div>
              </div>

              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold tracking-widest text-slate-400">ULTIMOS PEDIDOS</p>
                  <span className="text-xs font-medium text-lime-600">Ver todos</span>
                </div>
                {isLoadingClientDetails ? (
                  <div className="rounded-2xl border bg-white p-4 text-sm text-slate-500">Cargando pedidos...</div>
                ) : recentOrdersSlice.length > 0 ? (
                  <div className="space-y-3">
                    {recentOrdersSlice.map((order) => (
                      <div key={order.id} className="flex items-center justify-between rounded-2xl border bg-white p-3">
                        <div>
                          <p className="font-semibold text-slate-800">#{order.id.slice(0, 8)}</p>
                          <p className="text-xs text-emerald-600">{orderStatusLabel[order.status] || "Pedido"}</p>
                        </div>
                        <p className="font-semibold text-slate-700">{formatCurrency(order.total_amount)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border bg-white p-4 text-sm text-slate-500">
                    Este cliente aun no tiene pedidos registrados.
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-lime-200/70 bg-white/80 p-4">
                <p className="text-xs font-semibold tracking-widest text-slate-400 flex items-center gap-1">
                  <StickyNote className="h-4 w-4 text-lime-500" />
                  NOTA INTERNA
                </p>
                <p className="mt-2 text-sm italic text-slate-600">{internalNote}</p>
                {totalPurchases > 0 && (
                  <p className="mt-3 text-xs font-medium text-slate-500">Facturacion historica: {formatCurrency(totalPurchases)}</p>
                )}
              </div>
            </div>
          </ScrollArea>
        </Card>
      )}

      <Dialog open={isPauseDialogOpen} onOpenChange={setIsPauseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pausar Inteligencia Artificial</DialogTitle>
            <DialogDescription>
              Selecciona por cuánto tiempo deseas pausar la respuesta automática para intervenir manualmente.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="duration" className="text-right">
                Duración
              </Label>
              <Select value={pauseDuration} onValueChange={setPauseDuration}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Selecciona duración" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 Minutos</SelectItem>
                  <SelectItem value="20">20 Minutos</SelectItem>
                  <SelectItem value="30">30 Minutos</SelectItem>
                  <SelectItem value="60">1 Hora</SelectItem>
                  <SelectItem value="indefinite">Indefinido</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPauseDialogOpen(false)}>Cancelar</Button>
            <Button onClick={confirmPause}>Pausar IA</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
