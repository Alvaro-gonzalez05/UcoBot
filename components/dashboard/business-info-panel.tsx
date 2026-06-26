"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

interface BusinessInfoData {
  business_name: string
  business_type: string
  description: string
  address: string
  city: string
  state: string
  phone: string
  email: string
  website: string
  menu_link: string
  opening_hours: {
    monday: { isOpen: boolean; open: string; close: string }
    tuesday: { isOpen: boolean; open: string; close: string }
    wednesday: { isOpen: boolean; open: string; close: string }
    thursday: { isOpen: boolean; open: string; close: string }
    friday: { isOpen: boolean; open: string; close: string }
    saturday: { isOpen: boolean; open: string; close: string }
    sunday: { isOpen: boolean; open: string; close: string }
  }
  social_media: {
    facebook?: string
    instagram?: string
    twitter?: string
    whatsapp?: string
  }
}

const DEFAULT_BUSINESS_INFO: BusinessInfoData = {
  business_name: "",
  business_type: "",
  description: "",
  address: "",
  city: "",
  state: "",
  phone: "",
  email: "",
  website: "",
  menu_link: "",
  opening_hours: {
    monday: { isOpen: false, open: "09:00", close: "18:00" },
    tuesday: { isOpen: false, open: "09:00", close: "18:00" },
    wednesday: { isOpen: false, open: "09:00", close: "18:00" },
    thursday: { isOpen: false, open: "09:00", close: "18:00" },
    friday: { isOpen: false, open: "09:00", close: "18:00" },
    saturday: { isOpen: false, open: "09:00", close: "14:00" },
    sunday: { isOpen: false, open: "10:00", close: "14:00" },
  },
  social_media: {},
}

const dayLabels = {
  monday: "Lunes", tuesday: "Martes", wednesday: "Miércoles",
  thursday: "Jueves", friday: "Viernes", saturday: "Sábado", sunday: "Domingo",
}
const orderedDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const

const businessTypes = [
  "Restaurante", "Tienda de Ropa", "Salón de Belleza", "Gimnasio",
  "Consultorio Médico", "Agencia de Viajes", "Inmobiliaria", "Educación",
  "Tecnología", "Servicios Financieros", "E-commerce", "Otro",
]

/**
 * Panel "Mi Negocio": la información que la IA usa para responder.
 * Vive en Configuración → Mi negocio (antes estaba en el dashboard).
 */
export function BusinessInfoPanel({ userId }: { userId: string }) {
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<"general" | "contacto" | "redes" | "horarios">("general")
  const [isSaving, setIsSaving] = useState(false)
  const [businessInfo, setBusinessInfo] = useState<BusinessInfoData>(DEFAULT_BUSINESS_INFO)

  useEffect(() => {
    if (!userId) return
    supabase
      .from("user_profiles")
      .select("business_info")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.business_info) {
          setBusinessInfo((prev) => ({
            ...prev,
            ...data.business_info,
            social_media: data.business_info.social_media || {},
            opening_hours: typeof data.business_info.opening_hours === "string"
              ? prev.opening_hours
              : data.business_info.opening_hours || prev.opening_hours,
          }))
        }
      })
  }, [userId])

  const saveBusinessInfo = async () => {
    try {
      setIsSaving(true)
      const { error } = await supabase
        .from("user_profiles")
        .upsert({
          id: userId,
          business_name: businessInfo.business_name,
          business_description: businessInfo.description,
          business_hours: businessInfo.opening_hours,
          social_links: businessInfo.social_media,
          location: businessInfo.address,
          menu_link: businessInfo.menu_link,
          business_info: businessInfo,
        })
        .eq("id", userId)

      if (error) throw error

      toast.success("Negocio actualizado", {
        description: "Tu información se guardó correctamente para la IA.",
        duration: 4000,
      })
    } catch (error) {
      console.error("Error saving business info:", error)
      toast.error("Error al guardar", {
        description: "No se pudo actualizar la información.",
        duration: 4000,
      })
    } finally {
      setIsSaving(false)
    }
  }

  const updateField = (field: keyof BusinessInfoData, value: any) => {
    setBusinessInfo((prev) => ({ ...prev, [field]: value }))
  }

  const updateSocialMedia = (platform: string, value: string) => {
    setBusinessInfo((prev) => ({
      ...prev,
      social_media: { ...prev.social_media, [platform]: value },
    }))
  }

  const updateOpeningHours = (
    day: keyof typeof businessInfo.opening_hours,
    field: "isOpen" | "open" | "close",
    value: boolean | string,
  ) => {
    setBusinessInfo((prev) => ({
      ...prev,
      opening_hours: {
        ...prev.opening_hours,
        [day]: {
          ...prev.opening_hours[day],
          [field]: value,
        },
      },
    }))
  }

  return (
    <div className="bg-[#1C1C28] text-white rounded-[2.5rem] shadow-2xl flex flex-col border border-white/5 relative overflow-hidden max-w-2xl">
      <div className="absolute top-0 right-0 w-32 h-32 bg-[#D1F366]/10 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2"></div>

      <div className="p-8 pb-4 relative z-10 shrink-0">
        <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center mb-5 group hover:border-[#D1F366]/50 transition-colors">
          <span className="material-symbols-outlined text-3xl text-[#D1F366]">domain</span>
        </div>
        <h3 className="font-bold text-xl mb-1">Mi Negocio</h3>
        <p className="text-[11px] text-gray-400">Completa tu perfil para que la IA aprenda de ti.</p>

        <div className="flex gap-4 mt-8 border-b border-white/10 text-[10px] font-bold uppercase tracking-widest overflow-x-auto hide-scrollbar">
          <button className={cn("pb-3 px-1 whitespace-nowrap", activeTab === "general" ? "tab-active" : "text-gray-500 hover:text-[#D1F366] transition-colors")} onClick={() => setActiveTab("general")}>
            General
          </button>
          <button className={cn("pb-3 px-1 whitespace-nowrap", activeTab === "contacto" ? "tab-active" : "text-gray-500 hover:text-[#D1F366] transition-colors")} onClick={() => setActiveTab("contacto")}>
            Contacto
          </button>
          <button className={cn("pb-3 px-1 whitespace-nowrap", activeTab === "redes" ? "tab-active" : "text-gray-500 hover:text-[#D1F366] transition-colors")} onClick={() => setActiveTab("redes")}>
            Redes
          </button>
          <button className={cn("pb-3 px-1 whitespace-nowrap", activeTab === "horarios" ? "tab-active" : "text-gray-500 hover:text-[#D1F366] transition-colors")} onClick={() => setActiveTab("horarios")}>
            Horarios
          </button>
        </div>
      </div>

      <div className="px-8 pt-4 pb-0 flex-1 max-h-[440px] overflow-y-auto hide-scrollbar relative z-10">
        {activeTab === "general" && (
          <form className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-widest">Nombre Comercial</label>
              <input className="w-full bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-1 focus:ring-[#D1F366] py-2.5 px-4 text-white placeholder:text-white/20"
                placeholder="Ej: Café Central" type="text" value={businessInfo.business_name} onChange={(e) => updateField("business_name", e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-widest">Industria</label>
              <select className="w-full bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-1 focus:ring-[#D1F366] py-2.5 px-4 text-white"
                value={businessInfo.business_type} onChange={(e) => updateField("business_type", e.target.value)}>
                <option className="bg-[#1C1C28]" value="">Selecciona el tipo</option>
                {businessTypes.map(t => <option key={t} value={t} className="bg-[#1C1C28]">{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-widest">Tu Propuesta de Valor</label>
              <textarea className="w-full bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-1 focus:ring-[#D1F366] py-2.5 px-4 text-white placeholder:text-white/20 h-24 resize-none"
                placeholder="¿Qué hace único a tu negocio?" value={businessInfo.description} onChange={(e) => updateField("description", e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-widest">Sitio Web</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 material-symbols-outlined text-sm">link</span>
                <input className="w-full pl-9 bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-1 focus:ring-[#D1F366] py-2.5 text-white placeholder:text-white/20"
                  placeholder="www.tuweb.com" type="url" value={businessInfo.website} onChange={(e) => updateField("website", e.target.value)} />
              </div>
            </div>
          </form>
        )}

        {activeTab === "contacto" && (
          <form className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-widest">Email de Atención</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 material-symbols-outlined text-sm">mail</span>
                <input className="w-full pl-9 bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-1 focus:ring-[#D1F366] py-2.5 text-white"
                  placeholder="hola@empresa.com" type="email" value={businessInfo.email} onChange={(e) => updateField("email", e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-widest">Teléfono / WhatsApp</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 material-symbols-outlined text-sm">call</span>
                <input className="w-full pl-9 bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-1 focus:ring-[#D1F366] py-2.5 text-white"
                  placeholder="+54 000 000 000" type="tel" value={businessInfo.phone} onChange={(e) => updateField("phone", e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-widest">Dirección Principal</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 material-symbols-outlined text-sm">location_on</span>
                <input className="w-full pl-9 bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-1 focus:ring-[#D1F366] py-2.5 text-white"
                  placeholder="Calle Innovación 42" type="text" value={businessInfo.address} onChange={(e) => updateField("address", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-widest">Localidad / Ciudad</label>
                <input className="w-full bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-1 focus:ring-[#D1F366] py-2.5 px-4 text-white placeholder:text-white/20"
                  placeholder="Ej: Godoy Cruz" type="text" value={businessInfo.city} onChange={(e) => updateField("city", e.target.value)} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-widest">Provincia</label>
                <input className="w-full bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-1 focus:ring-[#D1F366] py-2.5 px-4 text-white placeholder:text-white/20"
                  placeholder="Ej: Mendoza" type="text" value={businessInfo.state} onChange={(e) => updateField("state", e.target.value)} />
              </div>
            </div>
            <p className="text-[10px] text-gray-500 leading-relaxed">
              La localidad y provincia se usan para registrar tu local en Mercado Pago al cobrar con QR.
            </p>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-widest">Catálogo / Menú Link</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 material-symbols-outlined text-sm">import_contacts</span>
                <input className="w-full pl-9 bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-1 focus:ring-[#D1F366] py-2.5 text-white"
                  placeholder="menu.tuempresa.com" type="text" value={businessInfo.menu_link} onChange={(e) => updateField("menu_link", e.target.value)} />
              </div>
            </div>
          </form>
        )}

        {activeTab === "redes" && (
          <form className="space-y-4">
            {["facebook", "instagram", "twitter", "whatsapp"].map((platform) => (
              <div key={platform}>
                <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-widest">{platform}</label>
                <input className="w-full bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-1 focus:ring-[#D1F366] py-2.5 px-4 text-white"
                  placeholder={`https://${platform}.com/tuempresa`} type="text"
                  value={businessInfo.social_media[platform as keyof typeof businessInfo.social_media] || ""}
                  onChange={(e) => updateSocialMedia(platform, e.target.value)} />
              </div>
            ))}
          </form>
        )}

        {activeTab === "horarios" && (
          <div className="space-y-2.5">
            {orderedDays.map((day) => {
              const schedule = businessInfo.opening_hours[day]
              return (
                <div key={day} className={cn(
                  "flex items-center justify-between p-3 rounded-xl border transition-all duration-200",
                  schedule.isOpen
                    ? "bg-white/5 border-white/10"
                    : "bg-transparent border-transparent opacity-50 grayscale"
                )}>
                  <label className="flex items-center gap-3 text-sm font-semibold cursor-pointer select-none min-w-[100px]">
                    <div className="relative flex items-center justify-center">
                      <input type="checkbox" checked={schedule.isOpen} onChange={(e) => updateOpeningHours(day, "isOpen", e.target.checked)}
                        className="peer sr-only" />
                      <div className="w-9 h-5 bg-white/10 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#D1F366] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#D1F366] peer-checked:after:bg-[#1C1C28]"></div>
                    </div>
                    <span className={cn("text-xs uppercase tracking-wider", schedule.isOpen ? "text-white" : "text-gray-500")}>
                      {dayLabels[day].substring(0, 3)}
                    </span>
                  </label>

                  <div className="flex-1 flex justify-end">
                    {schedule.isOpen ? (
                      <div className="flex items-center gap-1.5">
                        <input type="time" value={schedule.open} onChange={(e) => updateOpeningHours(day, "open", e.target.value)}
                          className="w-[72px] bg-[#1C1C28] border border-white/10 hover:border-[#D1F366]/50 focus:border-[#D1F366] rounded-lg text-xs py-1.5 px-2 text-white font-mono text-center transition-colors outline-none" />
                        <span className="text-gray-500 text-xs font-bold">-</span>
                        <input type="time" value={schedule.close} onChange={(e) => updateOpeningHours(day, "close", e.target.value)}
                          className="w-[72px] bg-[#1C1C28] border border-white/10 hover:border-[#D1F366]/50 focus:border-[#D1F366] rounded-lg text-xs py-1.5 px-2 text-white font-mono text-center transition-colors outline-none" />
                      </div>
                    ) : (
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-4 py-1.5">Cerrado</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="p-8 pt-4 relative z-10 shrink-0">
        <button
          onClick={saveBusinessInfo}
          disabled={isSaving}
          className="w-full bg-[#D1F366] text-[#1C1C28] font-black text-xs uppercase tracking-widest py-4 rounded-2xl hover:bg-white transition-all shadow-xl shadow-[#D1F366]/5 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Actualizar Entidad"}
        </button>
      </div>
    </div>
  )
}
