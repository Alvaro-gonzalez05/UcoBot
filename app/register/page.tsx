"use client"

import type React from "react"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { motion, easeOut } from 'framer-motion'
import { MoveRight, Check } from 'lucide-react'
import Image from 'next/image'
import AuthSuccessOverlay from '@/components/ui/auth-success-overlay'

export default function RegisterPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [businessName, setBusinessName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false)
  const router = useRouter()

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden")
      setIsLoading(false)
      return
    }

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres")
      setIsLoading(false)
      return
    }

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            business_name: businessName,
          },
        },
      })
      if (error) throw error
      
      // Mostrar animación de éxito antes de redirigir
      setShowSuccessOverlay(true)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

    const handleGoogleRegister = async () => {
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    try {
      // Detectar si estamos en producción o desarrollo
      const currentOrigin = window.location.origin
      const redirectUrl = currentOrigin.includes('localhost') 
        ? `${currentOrigin}/login` 
        : `${currentOrigin}/auth/callback`

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
        }
      })
      if (error) throw error
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Error al conectar con Google")
      setIsLoading(false)
    }
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.8,
        staggerChildren: 0.1,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: easeOut },
    },
  }

  const buttonVariants = {
    hover: {
      scale: 1.02,
      transition: { duration: 0.2 },
    },
    tap: { scale: 0.98 },
  }

  return (
    <div className="w-full min-h-screen bg-background">
      <div className="relative min-h-screen z-10 flex items-center justify-center p-4">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="w-full max-w-5xl"
        >
          <motion.div variants={itemVariants} className="text-center mb-6">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <Image src="/ucobot-logo.png" alt="UcoBot" width={32} height={32} />
              <span className="text-2xl font-bold">UcoBot</span>
            </div>
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="bg-white dark:bg-[#3F3F3F] backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden"
          >
            {/* Green accent gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-green-50/30 via-transparent to-green-50/20 dark:from-green-900/10 dark:via-transparent dark:to-green-900/5 pointer-events-none" />
            <div className="relative z-10">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
              {/* Left Column - Welcome Text & Benefits */}
              <div className="space-y-6">
                <motion.div variants={itemVariants} className="text-left">
                  <h1 className="text-4xl font-light text-gray-900 dark:text-white mb-4">
                    Crear cuenta
                  </h1>
                  <p className="text-gray-600 dark:text-gray-300 text-lg">
                    Comienza tu prueba gratuita de 14 días y automatiza tu negocio
                  </p>
                </motion.div>

                <motion.div variants={itemVariants} className="bg-gradient-to-br from-green-50 to-gray-50 dark:from-green-900/20 dark:to-[#1B1B1B] rounded-2xl p-6 border border-green-100 dark:border-green-900/30">
                  <h4 className="font-medium text-lg mb-4 text-gray-900 dark:text-white flex items-center">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                    Tu prueba gratuita incluye:
                  </h4>
                  <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-3">
                    <li className="flex items-center">
                      <Check className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                      14 días de acceso completo
                    </li>
                    <li className="flex items-center">
                      <Check className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                      Configuración de bot completa
                    </li>
                    <li className="flex items-center">
                      <Check className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                      Sección de prueba integrada
                    </li>
                    <li className="flex items-center">
                      <Check className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                      Soporte por email
                    </li>
                  </ul>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
                    Después de los 14 días: $90.000 ARS/mes por débito automático con Mercado Pago. Cancelás cuando quieras.
                  </p>
                </motion.div>

                <motion.div variants={itemVariants} className="text-center">
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    ¿Ya tienes una cuenta?{" "}
                    <Link
                      href="/login"
                      className="text-gray-900 dark:text-white hover:text-gray-700 dark:hover:text-gray-300 transition-colors underline font-medium"
                    >
                      Inicia sesión
                    </Link>
                  </p>
                </motion.div>
              </div>

              {/* Right Column - Register Form */}
              <div className="space-y-6">
                {/* Google Register Button */}
                <motion.div variants={itemVariants}>
                  <motion.button
                    variants={buttonVariants}
                    whileHover="hover"
                    whileTap="tap"
                    onClick={handleGoogleRegister}
                    disabled={isLoading}
                    className="w-full bg-gray-100 dark:bg-[#1B1B1B] border border-gray-300 dark:border-white/20 rounded-full px-6 py-4 text-gray-900 dark:text-white flex items-center justify-center hover:bg-gray-200 dark:hover:bg-black/60 transition-colors group disabled:opacity-50"
                  >
                    <svg viewBox="0 0 24 24" className="w-5 h-5 mr-3">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <span>Registro rápido con Google</span>
                  </motion.button>
                </motion.div>

                <motion.div variants={itemVariants} className="flex items-center">
                  <div className="flex-1 h-px bg-gradient-to-r from-green-300/30 via-gray-300 to-green-300/30 dark:from-green-400/20 dark:via-white/20 dark:to-green-400/20" />
                  <span className="px-4 text-gray-500 dark:text-gray-400 text-sm">O créate una cuenta</span>
                  <div className="flex-1 h-px bg-gradient-to-l from-green-300/30 via-gray-300 to-green-300/30 dark:from-green-400/20 dark:via-white/20 dark:to-green-400/20" />
                </motion.div>

                <form onSubmit={handleRegister} className="space-y-4">
                  <motion.div variants={itemVariants}>
                    <input
                      type="text"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="Nombre de tu negocio"
                      required
                      className="w-full bg-gray-100 dark:bg-[#1B1B1B] border border-gray-300 dark:border-white/20 rounded-2xl px-6 py-3 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:border-green-500 dark:focus:border-green-400 focus:ring-2 focus:ring-green-500/20 transition-all duration-200"
                    />
                  </motion.div>

                  <motion.div variants={itemVariants}>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Ingresa tu email"
                      required
                      className="w-full bg-gray-100 dark:bg-[#1B1B1B] border border-gray-300 dark:border-white/20 rounded-2xl px-6 py-3 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:border-green-500 dark:focus:border-green-400 focus:ring-2 focus:ring-green-500/20 transition-all duration-200"
                    />
                  </motion.div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <motion.div variants={itemVariants}>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Contraseña (min. 6 caracteres)"
                        required
                        className="w-full bg-gray-100 dark:bg-[#1B1B1B] border border-gray-300 dark:border-white/20 rounded-2xl px-6 py-3 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:border-green-500 dark:focus:border-green-400 focus:ring-2 focus:ring-green-500/20 transition-all duration-200"
                      />
                    </motion.div>

                    <motion.div variants={itemVariants}>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirma tu contraseña"
                        required
                        className="w-full bg-gray-100 dark:bg-[#1B1B1B] border border-gray-300 dark:border-white/20 rounded-2xl px-6 py-3 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:border-green-500 dark:focus:border-green-400 focus:ring-2 focus:ring-green-500/20 transition-all duration-200"
                      />
                    </motion.div>
                  </div>

                  {error && (
                    <motion.div 
                      variants={itemVariants}
                      className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-2xl text-center"
                    >
                      {error}
                    </motion.div>
                  )}

                  <motion.button
                    variants={buttonVariants}
                    whileHover="hover"
                    whileTap="tap"
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 dark:from-green-500 dark:to-green-600 dark:hover:from-green-600 dark:hover:to-green-700 text-white rounded-2xl px-6 py-4 font-medium transition-all duration-300 flex items-center justify-center group disabled:opacity-50 shadow-lg hover:shadow-green-500/30"
                  >
                    {isLoading ? "Creando cuenta..." : "Comenzar Prueba Gratuita"}
                    {!isLoading && <MoveRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />}
                  </motion.button>
                </form>
              </div>
            </div>
            </div>
          </motion.div>

          <motion.div variants={itemVariants} className="mt-6 text-center">
            <Link href="/" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
              ← Volver al inicio
            </Link>
          </motion.div>
        </motion.div>
      </div>

      {/* Auth Success Overlay */}
      <AuthSuccessOverlay
        isVisible={showSuccessOverlay}
        userName={businessName || email.split('@')[0]}
        userPlan="trial"
        isNewUser={true}
        onComplete={() => {
          setShowSuccessOverlay(false)
          setIsLoading(false)
          router.push('/register/success')
        }}
      />
    </div>
  )
}
