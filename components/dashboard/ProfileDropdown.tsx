"use client";

import { useState, useEffect } from "react";
import {
  Check,
  ChevronUp,
  Settings,
  Crown,
  DoorOpen,
  Sun,
  Moon,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { SiMercadopago } from "react-icons/si";
import { useTheme } from "next-themes";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import LogoutAnimation from "@/components/ui/logout-animation";
import { useLogoutAnimation } from "@/hooks/use-logout-animation";
import { isSubscriptionActive, trialDaysLeft } from "@/lib/subscription";

interface ProfileDropdownProps {
  user: User;
  profile: any;
  /** Dónde vive el trigger: define hacia dónde se abre el panel */
  position?: "sidebar" | "header" | "downbar";
  /** Trigger personalizado (ej: el avatar del downbar) */
  trigger?: React.ReactNode;
}

export default function ProfileDropdown({ user, profile, position = "sidebar", trigger }: ProfileDropdownProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [subLoading, setSubLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // Estado de la suscripción (mismo criterio que el bloqueo)
  const alDia = isSubscriptionActive(profile);
  const daysLeft = trialDaysLeft(profile);
  const isExempt = !!profile?.billing_exempt;
  const isActivePaid = profile?.subscription_status === "active";
  const needsSub = !isExempt && !isActivePaid; // mostrar acción de suscribir

  // Texto/acción del item de suscripción según el estado
  const subItemLabel = isExempt
    ? "Plan activo (pago manual)"
    : isActivePaid
      ? "Suscripción activa"
      : profile?.subscription_status === "past_due"
        ? "Reactivar abono"
        : daysLeft !== null
          ? `Prueba — ${daysLeft} día${daysLeft !== 1 ? "s" : ""}`
          : "Suscribirme";

  // Inicia la adhesión al débito automático y redirige a Mercado Pago
  const handleSubscribe = async () => {
    if (subLoading) return;
    setSubLoading(true);
    try {
      const res = await fetch("/api/mp/subscribe", { method: "POST" });
      const j = await res.json();
      if (res.ok && j.init_point) {
        window.location.href = j.init_point;
        return;
      }
      router.push("/dashboard/configuracion");
    } catch {
      router.push("/dashboard/configuracion");
    } finally {
      setSubLoading(false);
    }
  };

  // Hook para manejar logout con animación
  const { logout, animationProps } = useLogoutAnimation({
    userName: profile?.business_name || user?.email?.split('@')[0],
    userPlan: profile?.plan_type || 'trial',
    redirectTo: '/'
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  const handleSignOut = async () => {
    setIsOpen(false); // Cerrar dropdown primero
    await logout(); // Usar el hook de logout con animación
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const menuItems = [
    {
      icon: <Settings className="w-5 h-5" />,
      label: "Configuración",
      onClick: () => { setIsOpen(false); router.push("/dashboard/configuracion"); }
    },
    {
      icon: <DoorOpen className="w-5 h-5" />,
      label: "Cerrar Sesión",
      danger: true,
      onClick: handleSignOut
    },
  ];

  const panelPosition =
    position === "header"
      ? "right-0 top-full mt-3"
      : position === "downbar"
        ? "right-0 bottom-full mb-3"
        : "left-full bottom-0 ml-3";

  const panelMotionOffset =
    position === "header" ? { y: -10 } : position === "downbar" ? { y: 10 } : { x: -10 };

  return (
    <div className="relative">
      {/* Trigger: avatar por defecto o trigger custom (downbar) */}
      {trigger ? (
        <button onClick={() => setIsOpen(!isOpen)} className="block">
          {trigger}
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold hover:opacity-90 transition-opacity"
        >
          {getInitials(profile?.business_name || user.email || "U")}
        </button>
      )}

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Overlay */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, ...panelMotionOffset }}
              animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, ...panelMotionOffset }}
              transition={{ duration: 0.2 }}
              className={`absolute ${panelPosition} z-50 w-80 sm:w-96 max-h-[80vh] overflow-y-auto rounded-2xl sm:rounded-3xl bg-white/75 dark:bg-[#1C1C28]/80 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_8px_32px_rgba(0,0,0,0.25)] border border-white/40 dark:border-white/10 [&::-webkit-scrollbar]:hidden`}
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {/* Profile Header */}
              <motion.div
                className="p-4 sm:p-6 border-b border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors duration-200"
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center">
                  <motion.div
                    className="relative w-10 h-10 sm:w-12 sm:h-12 mr-3 sm:mr-4"
                    whileHover={{ scale: 1.05 }}
                    transition={{ type: "spring", stiffness: 400, damping: 10 }}
                  >
                    <div className="absolute inset-1 rounded-full overflow-hidden">
                      <div className="w-full h-full bg-primary text-primary-foreground flex items-center justify-center rounded-full text-sm sm:text-lg font-medium">
                        {getInitials(profile?.business_name || user.email || "U")}
                      </div>
                    </div>
                  </motion.div>
                  <div className="flex-1">
                    <div className="flex items-center">
                      <h2 className="text-lg sm:text-xl font-bold text-neutral-900 dark:text-white">
                        {profile?.business_name || "Mi Negocio"}
                      </h2>
                      <motion.div
                        className="ml-2 flex items-center justify-center w-5 h-5 bg-blue-500 rounded-full"
                        whileHover={{ scale: 1.1 }}
                        transition={{ type: "spring", stiffness: 400, damping: 10 }}
                      >
                        <Check className="w-3 h-3 text-white" />
                      </motion.div>
                    </div>
                    <p className="text-neutral-500 dark:text-neutral-400 text-sm">
                      {user.email}
                    </p>
                  </div>
                  <motion.button
                    className="text-neutral-500 dark:text-neutral-400"
                    onClick={() => setIsOpen(!isOpen)}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <motion.div
                      animate={{ rotate: isOpen ? 0 : 180 }}
                      transition={{ duration: 0.3 }}
                    >
                      <ChevronUp className="w-5 h-5" />
                    </motion.div>
                  </motion.button>
                </div>
              </motion.div>

              {/* Card Section — Mercado Pago */}
              <div className="p-4 sm:p-6 border-b border-neutral-200 dark:border-neutral-700">
                <motion.div
                  onClick={needsSub ? handleSubscribe : undefined}
                  className={`rounded-2xl p-5 overflow-hidden relative text-white transition-transform duration-300 hover:scale-[1.02] ${needsSub ? "cursor-pointer" : ""}`}
                  style={{ background: "linear-gradient(135deg, #2D9BF0 0%, #009EE3 55%, #0077C8 100%)" }}
                  transition={{ type: "spring", stiffness: 300, damping: 15 }}
                >
                  {/* brillo decorativo */}
                  <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/15 blur-xl" />

                  {/* Top: logo + wordmark */}
                  <div className="flex items-center justify-between mb-8 relative z-10">
                    <div className="flex items-center gap-2">
                      <SiMercadopago className="h-8 w-8 text-white" />
                      <span className="font-bold tracking-tight text-[15px]">Mercado Pago</span>
                    </div>
                    {subLoading && <Loader2 className="h-4 w-4 animate-spin text-white/80" />}
                  </div>

                  {/* Negocio */}
                  <p className="relative z-10 text-xs text-white/70 mb-0.5">Suscripción UcoBot</p>
                  <p className="relative z-10 font-semibold text-lg leading-tight mb-3">
                    {profile?.business_name || "Mi Negocio"}
                  </p>

                  {/* Estado + precio */}
                  <div className="relative z-10 flex items-end justify-between">
                    <div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold backdrop-blur-sm">
                        {isExempt ? (
                          <>Pago manual</>
                        ) : isActivePaid ? (
                          <><CheckCircle2 className="h-3 w-3" /> Activa</>
                        ) : profile?.subscription_status === "past_due" ? (
                          <>Pago vencido</>
                        ) : daysLeft !== null ? (
                          <>Prueba · {daysLeft} día{daysLeft !== 1 ? "s" : ""}</>
                        ) : (
                          <>Sin abono</>
                        )}
                      </span>
                      {needsSub && (
                        <p className="mt-1.5 text-[11px] text-white/80">Tocá para suscribirte →</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-base font-black leading-none">$90.000</p>
                      <p className="text-[10px] text-white/70">ARS/mes</p>
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Theme Toggle */}
              <div className="p-4 border-b border-neutral-200 dark:border-neutral-700">
                <div className="flex bg-neutral-100 dark:bg-neutral-700 rounded-lg p-1">
                  <motion.button
                    className={`flex-1 flex items-center justify-center py-2 px-4 rounded-md ${
                      theme === "light"
                        ? "bg-white dark:bg-neutral-600 shadow-sm"
                        : ""
                    }`}
                    onClick={() => setTheme("light")}
                    whileHover={{ scale: theme !== "light" ? 1.03 : 1 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    <Sun
                      className={`w-4 h-4 mr-2 ${
                        theme === "light"
                          ? "text-amber-500"
                          : "text-neutral-500 dark:text-neutral-400"
                      }`}
                    />
                    <span
                      className={
                        theme === "light"
                          ? "text-neutral-900 dark:text-white font-medium"
                          : "text-neutral-500 dark:text-neutral-400"
                      }
                    >
                      Claro
                    </span>
                  </motion.button>
                  <motion.button
                    className={`flex-1 flex items-center justify-center py-2 px-4 rounded-md ${
                      theme === "dark" ? "bg-neutral-600 shadow-sm" : ""
                    }`}
                    onClick={() => setTheme("dark")}
                    whileHover={{ scale: theme !== "dark" ? 1.03 : 1 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    <Moon
                      className={`w-4 h-4 mr-2 ${
                        theme === "dark"
                          ? "text-indigo-300"
                          : "text-neutral-500 dark:text-neutral-400"
                      }`}
                    />
                    <span
                      className={
                        theme === "dark"
                          ? "text-white font-medium"
                          : "text-neutral-500 dark:text-neutral-400"
                      }
                    >
                      Oscuro
                    </span>
                  </motion.button>
                </div>
              </div>

              {/* Suscripción */}
              <div className="p-4 border-b border-neutral-200 dark:border-neutral-700">
                <div
                  className={`flex items-center justify-between p-2 rounded-lg ${needsSub ? "cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-700/50" : ""}`}
                  onClick={needsSub ? handleSubscribe : undefined}
                >
                  <div className="flex items-center text-neutral-700 dark:text-neutral-300">
                    <Crown className="w-5 h-5 mr-3 text-amber-500" />
                    <span>{subItemLabel}</span>
                  </div>
                  {needsSub ? (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      disabled={subLoading}
                      onClick={(e) => { e.stopPropagation(); handleSubscribe(); }}
                      className="px-4 py-1.5 rounded-lg bg-[#009EE3] text-white font-bold text-sm flex items-center gap-1.5 disabled:opacity-60"
                    >
                      {subLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {profile?.subscription_status === "past_due" ? "Reactivar" : "Suscribirme"}
                    </motion.button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" /> Activa
                    </span>
                  )}
                </div>
              </div>

              {/* Menu Items */}
              <div className="p-4 space-y-2 border-b border-neutral-200 dark:border-neutral-700">
                {menuItems.map((item, index) => (
                  <motion.div
                    key={index}
                    className={`flex items-center justify-between p-2 rounded-lg transition-all duration-200 cursor-pointer ${
                      item.danger
                        ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:pl-6"
                        : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 hover:pl-6"
                    }`}
                    onClick={item.onClick}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    <div className="flex items-center">
                      <span className="mr-3">{item.icon}</span>
                      <span>{item.label}</span>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Footer */}
              <div className="p-4 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors duration-200">
                <div className="flex items-center">
                  <motion.div
                    className="w-6 h-6 mr-2 bg-white dark:bg-neutral-700 rounded-full flex items-center justify-center shadow-sm"
                    whileHover={{ scale: 1.1, rotate: 10 }}
                    transition={{ type: "spring", stiffness: 400, damping: 10 }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20Z"
                        fill={theme === "light" ? "black" : "white"}
                      />
                      <path
                        d="M12 17C14.7614 17 17 14.7614 17 12C17 9.23858 14.7614 7 12 7C9.23858 7 7 9.23858 7 12C7 14.7614 9.23858 17 12 17Z"
                        fill={theme === "light" ? "black" : "white"}
                      />
                    </svg>
                  </motion.div>
                  <span className="text-neutral-900 dark:text-white font-medium">
                    UcoBot
                  </span>
                </div>
                <div className="text-neutral-500 dark:text-neutral-400 text-sm">
                  v1.0
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Logout Animation */}
      <LogoutAnimation {...animationProps} />
    </div>
  );
}
