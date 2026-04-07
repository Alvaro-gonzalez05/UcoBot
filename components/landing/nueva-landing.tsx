"use client"

import { useRef, useEffect, useState } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { useGSAP } from "@gsap/react"
import Link from "next/link"

gsap.registerPlugin(ScrollTrigger)

// ─── Floating orb component ───────────────────────────────────────────────
function FloatingOrb({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const orbRef = useRef<HTMLDivElement>(null)
  useGSAP(() => {
    if (!orbRef.current) return
    gsap.to(orbRef.current, {
      y: "-=30",
      x: "+=20",
      duration: gsap.utils.random(4, 7),
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut",
    })
  }, { scope: orbRef })
  return <div ref={orbRef} className={className} style={style} />
}

// ─── Animated Counter ──────────────────────────────────────────────────────
function AnimatedCounter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const obj = useRef({ val: 0 })
  useGSAP(() => {
    if (!ref.current) return
    gsap.from(obj.current, {
      val: 0,
      duration: 2,
      ease: "power2.out",
      scrollTrigger: {
        trigger: ref.current,
        start: "top 85%",
        once: true,
      },
      onUpdate: () => {
        if (ref.current) ref.current.textContent = Math.round(obj.current.val) + suffix
      },
    })
    gsap.to(obj.current, {
      val: to,
      duration: 2,
      ease: "power2.out",
      scrollTrigger: {
        trigger: ref.current,
        start: "top 85%",
        once: true,
      },
      onUpdate: () => {
        if (ref.current) ref.current.textContent = Math.round(obj.current.val) + suffix
      },
    })
  }, { scope: ref })
  return <span ref={ref}>0{suffix}</span>
}

export function NuevaLanding() {
  const [isDark, setIsDark] = useState(true)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const toggleIconRef = useRef<HTMLSpanElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const heroImgRef = useRef<HTMLImageElement>(null)
  const heroBadgeRef = useRef<HTMLDivElement>(null)
  const heroTitleRef = useRef<HTMLHeadingElement>(null)
  const heroSubRef = useRef<HTMLParagraphElement>(null)
  const heroBtnsRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const pricingRef = useRef<HTMLDivElement>(null)
  const pricingSectionRef = useRef<HTMLElement>(null)
  const capSectionRef = useRef<HTMLElement>(null)
  const codeaRef = useRef<HTMLDivElement>(null)
  const ctaRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)
  const lineRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    // ── Navbar slide in ──────────────────────────────────────────────────
    gsap.from(navRef.current, {
      yPercent: -100,
      opacity: 0,
      duration: 0.8,
      ease: "power3.out",
      delay: 0.1,
    })

    // ── Animated divider line draw ───────────────────────────────────────
    if (lineRef.current) {
      gsap.from(lineRef.current, {
        scaleX: 0,
        transformOrigin: "center",
        duration: 1.4,
        ease: "power3.out",
        scrollTrigger: {
          trigger: lineRef.current,
          start: "top 90%",
        },
      })
    }

    // ── Hero background parallax ─────────────────────────────────────────
    if (heroImgRef.current) {
      gsap.to(heroImgRef.current, {
        yPercent: 20,
        ease: "none",
        scrollTrigger: {
          trigger: heroRef.current,
          start: "top top",
          end: "bottom top",
          scrub: 1.2,
        },
      })
    }

    // ── Hero entrance timeline ───────────────────────────────────────────
    const heroTl = gsap.timeline({ delay: 0.3 })

    if (heroBadgeRef.current) {
      heroTl.from(heroBadgeRef.current.children, {
        opacity: 0,
        x: -30,
        duration: 0.7,
        stagger: 0.15,
        ease: "power3.out",
      })
    }

    // Split h1 into words and animate each
    if (heroTitleRef.current) {
      const words = heroTitleRef.current.querySelectorAll("span[data-word]")
      heroTl.from(
        words,
        {
          opacity: 0,
          y: 80,
          rotateX: -25,
          duration: 0.8,
          stagger: 0.12,
          ease: "power4.out",
        },
        "-=0.3"
      )
    }

    if (heroSubRef.current) {
      heroTl.from(
        heroSubRef.current,
        { opacity: 0, y: 30, duration: 0.7, ease: "power3.out" },
        "-=0.4"
      )
    }

    if (heroBtnsRef.current) {
      heroTl.from(
        heroBtnsRef.current.children,
        {
          opacity: 0,
          y: 20,
          scale: 0.9,
          duration: 0.6,
          stagger: 0.12,
          ease: "back.out(1.7)",
        },
        "-=0.3"
      )
    }

    // ── Bento grid cards stagger ─────────────────────────────────────────
    if (gridRef.current) {
      const cards = gridRef.current.querySelectorAll("[data-card]")
      gsap.from(cards, {
        opacity: 0,
        y: 70,
        scale: 0.95,
        duration: 0.75,
        stagger: 0.12,
        ease: "power3.out",
        scrollTrigger: {
          trigger: gridRef.current,
          start: "top 80%",
        },
      })
    }

    // ── Capacidades teaser section ─────────────────────────────────
    if (capSectionRef.current) {
      const capHeading = capSectionRef.current.querySelector("[data-cap-heading]")
      const capSub = capSectionRef.current.querySelector("[data-cap-sub]")
      const capCards = Array.from(capSectionRef.current.querySelectorAll("[data-cap-card]" ))
      const capBtn = capSectionRef.current.querySelector("[data-cap-btn]")
      if (capHeading) gsap.from(capHeading, { autoAlpha: 0, y: 50, duration: 0.85, ease: "power4.out", scrollTrigger: { trigger: capSectionRef.current, start: "top 78%", once: true } })
      if (capSub) gsap.from(capSub, { autoAlpha: 0, y: 25, duration: 0.65, ease: "power3.out", scrollTrigger: { trigger: capSectionRef.current, start: "top 75%", once: true } })
      if (capCards.length) gsap.from(capCards, { autoAlpha: 0, y: 30, scale: 0.94, stagger: 0.08, duration: 0.7, ease: "back.out(1.4)", scrollTrigger: { trigger: capSectionRef.current, start: "top 70%", once: true } })
      if (capBtn) gsap.from(capBtn, { autoAlpha: 0, scale: 0.88, duration: 0.6, ease: "back.out(1.5)", scrollTrigger: { trigger: capSectionRef.current, start: "top 65%", once: true } })
    }

    // ── Pricing section: heading reveal + slide-in cards ────────────
    if (pricingSectionRef.current) {
      const heading = pricingSectionRef.current.querySelector("[data-pricing-heading]")
      const sub     = pricingSectionRef.current.querySelector("[data-pricing-sub]")
      const cards   = Array.from(pricingSectionRef.current.querySelectorAll("[data-pricing-card]"))

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: pricingSectionRef.current,
          start: "top bottom",
          once: true,
        },
      })

      if (heading) tl.from(heading, { autoAlpha: 0, y: 55, duration: 0.85, ease: "power4.out" })
      if (sub)     tl.from(sub,     { autoAlpha: 0, y: 25, duration: 0.65, ease: "power3.out" }, "-=0.45")
      if (cards[0]) tl.from(cards[0], { autoAlpha: 0, x: -60, duration: 0.85, ease: "power3.out" }, "-=0.3")
      if (cards[1]) tl.from(cards[1], { autoAlpha: 0, x: 60,  duration: 0.85, ease: "power3.out" }, "-=0.65")
    }

    // ── CODEA watermark: fade in from below ──────────────────────────────
    if (codeaRef.current) {
      gsap.from(codeaRef.current, {
        autoAlpha: 0,
        y: 30,
        duration: 1.4,
        ease: "power3.out",
        scrollTrigger: {
          trigger: footerRef.current,
          start: "top bottom",
          once: true,
        },
      })
    }

    // ── CTA text reveal ──────────────────────────────────────────────────
    if (ctaRef.current) {
      const heading = ctaRef.current.querySelector("[data-cta-heading]")
      const sub = ctaRef.current.querySelector("[data-cta-sub]")
      const form = ctaRef.current.querySelector("[data-cta-form]")

      const ctaTl = gsap.timeline({
        scrollTrigger: {
          trigger: ctaRef.current,
          start: "top 75%",
        },
      })
      if (heading)
        ctaTl.from(heading, { opacity: 0, y: 60, duration: 0.9, ease: "power4.out" })
      if (sub)
        ctaTl.from(sub, { opacity: 0, y: 30, duration: 0.7, ease: "power3.out" }, "-=0.5")
      if (form)
        ctaTl.from(form, { opacity: 0, y: 30, duration: 0.7, ease: "power3.out" }, "-=0.4")
    }

    // ── Footer fade-in ───────────────────────────────────────────────────
    if (footerRef.current) {
      gsap.from(footerRef.current.querySelectorAll("[data-footer-col]"), {
        opacity: 0,
        y: 40,
        duration: 0.7,
        stagger: 0.1,
        ease: "power3.out",
        scrollTrigger: {
          trigger: footerRef.current,
          start: "top 90%",
        },
      })
    }
  }, { scope: rootRef })

  // Orb pulse on the hero
  const orbHeroRef = useRef<HTMLDivElement>(null)
  useGSAP(() => {
    if (!orbHeroRef.current) return
    gsap.to(orbHeroRef.current, {
      scale: 1.3,
      opacity: 0.15,
      duration: 3,
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut",
    })
  }, { scope: orbHeroRef })

  const T = {
    pageBg:        isDark ? "#0F0F17"                  : "#F0F0EA",
    pageColor:     isDark ? "white"                    : "#1C1C28",
    navBg:         isDark ? "rgba(28,28,40,0.88)"      : "rgba(255,255,255,0.92)",
    navBorder:     isDark ? "rgba(255,255,255,0.05)"   : "rgba(28,28,40,0.08)",
    navPillBg:     isDark ? "rgba(255,255,255,0.07)"   : "rgba(28,28,40,0.06)",
    navPillBorder: isDark ? "rgba(255,255,255,0.12)"   : "rgba(28,28,40,0.1)",
    navLinkColor:  isDark ? "rgba(255,255,255,0.52)"   : "rgba(28,28,40,0.5)",
    navLinkActive: isDark ? "#D1F366"                  : "#1C1C28",
    toggleBg:      isDark ? "rgba(255,255,255,0.08)"   : "rgba(28,28,40,0.07)",
    toggleBorder:  isDark ? "rgba(255,255,255,0.18)"   : "rgba(28,28,40,0.15)",
    toggleColor:   isDark ? "rgba(255,255,255,0.85)"   : "rgba(28,28,40,0.8)",
    heroOverlay:   isDark
      ? "linear-gradient(180deg, rgba(28,28,40,0) 0%, rgba(28,28,40,0.93) 100%)"
      : "linear-gradient(180deg, rgba(240,240,234,0) 0%, rgba(240,240,234,0.93) 100%)",
    heroTitle:     isDark ? "white"                    : "#1C1C28",
    heroSub:       isDark ? "rgba(255,255,255,0.75)"   : "rgba(28,28,40,0.7)",
    divider:       isDark
      ? "linear-gradient(90deg, transparent, rgba(209,243,102,0.7), transparent)"
      : "linear-gradient(90deg, transparent, rgba(28,28,40,0.3), transparent)",
    secTitle:      isDark ? "white"                    : "#1C1C28",
    secSub:        isDark ? "rgba(255,255,255,0.45)"   : "rgba(28,28,40,0.5)",
    pCard1Bg:      isDark ? "#1C1C28"                  : "white",
    pCard1Border:  isDark ? "rgba(255,255,255,0.08)"   : "rgba(28,28,40,0.1)",
    pCard1Title:   isDark ? "white"                    : "#1C1C28",
    pCard1Meta:    isDark ? "rgba(255,255,255,0.3)"    : "rgba(28,28,40,0.4)",
    pCard1Suffix:  isDark ? "rgba(255,255,255,0.4)"    : "rgba(28,28,40,0.5)",
    pCard1List:    isDark ? "rgba(255,255,255,0.75)"   : "rgba(28,28,40,0.8)",
    pCard1BtnBg:   isDark ? "white"                    : "#1C1C28",
    pCard1BtnTxt:  isDark ? "#1C1C28"                  : "white",
    ctaBg:         isDark ? "white"                    : "#1C1C28",
    ctaTitle:      isDark ? "#1C1C28"                  : "white",
    ctaSub:        isDark ? "rgba(28,28,40,0.55)"      : "rgba(255,255,255,0.6)",
    ctaStroke:     isDark ? "#1C1C28"                  : "white",
    ctaDotColor:   isDark ? "#1c1c28"                  : "rgba(255,255,255,0.7)",
    ctaFormBg:     isDark ? "#1C1C28"                  : "rgba(255,255,255,0.12)",
    footerBg:      isDark ? "#1C1C28"                  : "#E4E4DE",
    footerBorder:  isDark ? "rgba(255,255,255,0.05)"   : "rgba(28,28,40,0.08)",
    footerLogo:    isDark ? "#D1F366"                  : "#1C1C28",
    footerMeta:    isDark ? "rgba(255,255,255,0.3)"    : "rgba(28,28,40,0.4)",
    footerSpan:    isDark ? "white"                    : "#1C1C28",
    footerSocBg:   isDark ? "rgba(255,255,255,0.05)"   : "rgba(28,28,40,0.05)",
    footerSocBdr:  isDark ? "rgba(255,255,255,0.1)"    : "rgba(28,28,40,0.15)",
    footerSocIcon: isDark ? "white"                    : "#1C1C28",
    footerLink:    isDark ? "rgba(255,255,255,0.35)"   : "rgba(28,28,40,0.45)",
    footerHdr:     isDark ? "rgba(255,255,255,0.25)"   : "rgba(28,28,40,0.3)",
    footerCopy:    isDark ? "rgba(255,255,255,0.3)"    : "rgba(28,28,40,0.4)",
    footerMark:    isDark ? "white"                    : "#1C1C28",
  }

  return (
    <div
      ref={rootRef}
      className="w-full min-h-screen overflow-x-hidden"
      style={{
        fontFamily: "'Inter', sans-serif",
        backgroundColor: T.pageBg,
        color: T.pageColor,
        transition: "background-color 0.35s ease, color 0.3s ease",
      }}
    >
      {/* ── Navbar ────────────────────────────────────────────────────── */}
      <nav
        ref={navRef}
        className="sticky top-0 z-50 w-full border-b"
        style={{
          backgroundColor: T.navBg,
          backdropFilter: "blur(24px)",
          borderColor: T.navBorder,
          transition: "background-color 0.35s ease, border-color 0.3s ease",
        }}
      >
        <div className="max-w-[1600px] mx-auto px-6 md:px-12 py-4 flex items-center justify-between">

          {/* Logo */}
          <div className="flex flex-col min-w-[130px]">
            <span
              className="text-2xl font-black tracking-tighter leading-none"
              style={{ color: isDark ? "#D1F366" : "#1C1C28", transition: "color 0.3s ease" }}
            >
              UCOBOT
            </span>
            <span
              className="text-[8px] uppercase tracking-widest mt-0.5"
              style={{ color: isDark ? "rgba(255,255,255,0.35)" : "rgba(28,28,40,0.4)", transition: "color 0.3s ease" }}
            >
              por CODEA DESARROLLOS
            </span>
          </div>

          {/* Center pill nav */}
          <div
            className="hidden lg:flex items-center gap-0.5 px-2 py-1.5 rounded-full"
            style={{
              backgroundColor: T.navPillBg,
              border: `1px solid ${T.navPillBorder}`,
              backdropFilter: "blur(12px)",
              transition: "background-color 0.35s ease, border-color 0.3s ease",
            }}
          >
            {[
              { label: "Funciones",      href: "#funciones" },
              { label: "CRM",            href: "#crm" },
              { label: "Capacidades",    href: "/capacidades" },
              { label: "Precios",        href: "#precios" },
            ].map(({ label, href }, i) => (
              <a
                key={label}
                href={href}
                className="px-5 py-2 rounded-full text-sm font-semibold"
                style={{ color: i === 0 ? T.navLinkActive : T.navLinkColor }}
                onMouseEnter={(e) =>
                  gsap.to(e.currentTarget, {
                    color: T.navLinkActive,
                    backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(28,28,40,0.08)",
                    duration: 0.2,
                  })
                }
                onMouseLeave={(e) =>
                  gsap.to(e.currentTarget, {
                    color: i === 0 ? T.navLinkActive : T.navLinkColor,
                    backgroundColor: "transparent",
                    duration: 0.2,
                  })
                }
              >
                {label}
              </a>
            ))}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-3">

            {/* Theme toggle */}
            <button
              ref={toggleRef}
              onClick={() => {
                if (toggleIconRef.current) {
                  gsap.fromTo(
                    toggleIconRef.current,
                    { rotate: 0, scale: 0.5 },
                    { rotate: 360, scale: 1, duration: 0.5, ease: "back.out(1.7)" }
                  )
                }
                gsap.to(toggleRef.current, {
                  scale: 0.85, duration: 0.1, yoyo: true, repeat: 1, ease: "power2.inOut",
                })
                setIsDark((prev) => !prev)
              }}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{
                backgroundColor: T.toggleBg,
                border: `1px solid ${T.toggleBorder}`,
                transition: "background-color 0.3s ease, border-color 0.3s ease",
              }}
              title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            >
              <span
                ref={toggleIconRef}
                className="material-symbols-outlined"
                style={{ fontSize: 19, color: T.toggleColor, display: "block", lineHeight: "1", transition: "color 0.3s ease" }}
              >
                {isDark ? "light_mode" : "dark_mode"}
              </span>
            </button>

            {/* Divider */}
            <div
              className="hidden md:block h-6 w-[1px]"
              style={{ backgroundColor: T.navPillBorder, transition: "background-color 0.3s ease" }}
            />

            <Link href="/login">
              <button
                className="px-6 py-2.5 rounded-full text-sm font-black uppercase tracking-wide"
                style={{ backgroundColor: "#D1F366", color: "#1C1C28" }}
                onMouseEnter={(e) =>
                  gsap.to(e.currentTarget, { scale: 1.07, duration: 0.2, ease: "back.out(2)" })
                }
                onMouseLeave={(e) =>
                  gsap.to(e.currentTarget, { scale: 1, duration: 0.2 })
                }
              >
                COMENZAR
              </button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <main className="max-w-[1600px] mx-auto px-4 md:px-10 space-y-24 py-10">

        {/* ─ Hero Section ────────────────────────────────────────────── */}
        <section
          ref={heroRef}
          id="funciones"
          className="relative min-h-[90vh] w-full rounded-2xl overflow-hidden flex flex-col justify-end"
          style={{ backgroundColor: "#1C1C28" }}
        >
          {/* BG image with parallax */}
          <img
            ref={heroImgRef}
            alt="Fondo editorial tecnológico"
            className="absolute inset-0 w-full h-full object-cover object-center"
            style={{ opacity: 0.55 }}
            src="https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1800&q=80"
          />

          {/* Gradient overlay */}
          <div
            className="absolute inset-0"
            style={{ background: T.heroOverlay, transition: "background 0.35s ease" }}
          />

          {/* Floating orbs */}
          <FloatingOrb
            className="absolute top-12 right-24 w-72 h-72 rounded-full blur-3xl pointer-events-none"
            style={{ backgroundColor: "rgba(209,243,102,0.12)" }}
          />
          <div
            ref={orbHeroRef}
            className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-[80px] pointer-events-none"
            style={{ backgroundColor: "rgba(209,243,102,0.07)" }}
          />

          {/* Content */}
          <div className="relative z-10 p-8 md:p-20 w-full grid grid-cols-1 md:grid-cols-12 gap-8 items-end">
            <div className="md:col-span-8">
              {/* Badge */}
              <div ref={heroBadgeRef} className="flex items-center gap-4 mb-8">
                <span
                  className="inline-block h-[1px] w-12"
                  style={{ backgroundColor: "#D1F366" }}
                />
                <span
                  className="font-black text-xs uppercase tracking-[0.3em]"
                  style={{ color: "#D1F366" }}
                >
                  IA de Vanguardia
                </span>
              </div>

              {/* H1 – word-by-word animation */}
              <h1
                ref={heroTitleRef}
                className="font-black leading-[0.85] tracking-tighter"
                style={{
                  fontSize: "clamp(3.5rem, 10vw, 7.5rem)",
                  color: T.heroTitle,
                  textShadow: isDark ? "0 0 40px rgba(209,243,102,0.18)" : "none",
                  perspective: "600px",
                  transition: "color 0.35s ease",
                }}
              >
                {"IMPULSA TU".split(" ").map((w, i) => (
                  <span key={i} data-word style={{ display: "inline-block", marginRight: "0.25em" }}>
                    {w}
                  </span>
                ))}
                <br />
                {"NEGOCIO CON".split(" ").map((w, i) => (
                  <span key={i + 10} data-word style={{ display: "inline-block", marginRight: "0.25em" }}>
                    {w}
                  </span>
                ))}
                <br />
                <span data-word style={{ color: "#D1F366", display: "inline-block" }}>
                  IA
                </span>
              </h1>
            </div>

            <div className="md:col-span-4 flex flex-col gap-8">
              <p
                ref={heroSubRef}
                className="text-lg md:text-xl font-medium leading-relaxed pl-6"
                style={{
                  color: T.heroSub,
                  borderLeft: "2px solid rgba(209,243,102,0.3)",
                  transition: "color 0.35s ease",
                }}
              >
                Escala tus operaciones con automatización inteligente que entiende a tus clientes.
                Un ecosistema unificado para la era digital.
              </p>
              <div ref={heroBtnsRef} className="flex flex-wrap gap-4">
                <Link href="/dashboard">
                  <button
                    className="px-8 py-4 rounded-full font-black text-sm uppercase tracking-wider transition-all"
                    style={{ backgroundColor: "#D1F366", color: "#1C1C28" }}
                    onMouseEnter={(e) =>
                      gsap.to(e.currentTarget, {
                        scale: 1.05,
                        boxShadow: "0 0 30px rgba(209,243,102,0.4)",
                        duration: 0.25,
                      })
                    }
                    onMouseLeave={(e) =>
                      gsap.to(e.currentTarget, { scale: 1, boxShadow: "none", duration: 0.25 })
                    }
                  >
                    Lanzar Dashboard
                  </button>
                </Link>
                <button
                  className="px-8 py-4 rounded-full font-black text-sm uppercase tracking-wider transition-all"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.06)",
                    backdropFilter: "blur(12px)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "white",
                  }}
                  onMouseEnter={(e) =>
                    gsap.to(e.currentTarget, {
                      backgroundColor: "rgba(255,255,255,0.12)",
                      duration: 0.25,
                    })
                  }
                  onMouseLeave={(e) =>
                    gsap.to(e.currentTarget, {
                      backgroundColor: "rgba(255,255,255,0.06)",
                      duration: 0.25,
                    })
                  }
                >
                  Ver Demo
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ─ Editorial Divider ──────────────────────────────────────── */}
        <div
          ref={lineRef}
          className="h-[1px] w-full"
          style={{ background: T.divider, transition: "background 0.35s ease" }}
        />

        {/* ─ Bento Grid ─────────────────────────────────────────────── */}
        <section ref={gridRef} id="crm" className="grid grid-cols-1 md:grid-cols-12 gap-8">

          {/* Card 1 – Omnichannel */}
          <div
            data-card
            className="md:col-span-7 rounded-2xl p-10 flex flex-col justify-between relative overflow-hidden group"
            style={{ backgroundColor: "white", minHeight: 450 }}
            onMouseEnter={(e) =>
              gsap.to(e.currentTarget.querySelector("[data-glow]"), {
                opacity: 0.35,
                scale: 1.1,
                duration: 0.6,
              })
            }
            onMouseLeave={(e) =>
              gsap.to(e.currentTarget.querySelector("[data-glow]"), {
                opacity: 0.18,
                scale: 1,
                duration: 0.6,
              })
            }
          >
            <div className="relative z-10">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mb-8"
                style={{ backgroundColor: "#1C1C28" }}
              >
                <span className="material-symbols-outlined text-2xl" style={{ color: "#D1F366" }}>
                  chat_bubble
                </span>
              </div>
              <h3
                className="text-4xl font-black tracking-tighter mb-6 leading-none uppercase"
                style={{ color: "#1C1C28" }}
              >
                Chatbots
                <br />
                Omnicanal
              </h3>
              <p
                className="max-w-sm text-lg font-medium leading-snug"
                style={{ color: "rgba(28,28,40,0.7)" }}
              >
                Conecta con tus usuarios en WhatsApp e Instagram a través de una interfaz de IA
                unificada que mantiene el contexto global.
              </p>
            </div>

            {/* Status card */}
            <div
              className="relative z-10 mt-12 p-6 rounded-xl"
              style={{
                backgroundColor: "rgba(28,28,40,0.05)",
                border: "1px solid rgba(28,28,40,0.1)",
              }}
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "#D1F366" }} />
                <span
                  className="text-[10px] font-black uppercase tracking-widest"
                  style={{ color: "#1C1C28" }}
                >
                  Estado del Sistema: Activo
                </span>
              </div>
              <div
                className="h-[1px] w-full mb-4"
                style={{ backgroundColor: "rgba(28,28,40,0.1)" }}
              />
              <div
                className="flex justify-between items-center font-black text-xs uppercase"
                style={{ color: "#1C1C28" }}
              >
                <span>Integración WhatsApp</span>
                <span
                  className="px-2 py-1 rounded text-xs"
                  style={{ backgroundColor: "#1C1C28", color: "#D1F366" }}
                >
                  Listo
                </span>
              </div>
            </div>

            {/* Glow */}
            <div
              data-glow
              className="absolute -right-20 -top-20 w-80 h-80 rounded-full blur-3xl pointer-events-none transition-all"
              style={{ backgroundColor: "rgba(209,243,102,0.18)" }}
            />
          </div>

          {/* Card 2 – Automation */}
          <div
            data-card
            className="md:col-span-5 rounded-2xl p-10 flex flex-col justify-between relative overflow-hidden group"
            style={{ backgroundColor: "#D1F366", color: "#1C1C28" }}
            onMouseEnter={(e) => {
              const items = e.currentTarget.querySelectorAll("[data-task]")
              gsap.to(items[0], { x: 10, duration: 0.3 })
              gsap.to(items[1], { x: 18, duration: 0.3, delay: 0.05 })
            }}
            onMouseLeave={(e) => {
              const items = e.currentTarget.querySelectorAll("[data-task]")
              gsap.to(items, { x: 0, duration: 0.3 })
            }}
          >
            <div>
              <span className="material-symbols-outlined text-5xl mb-8 block" style={{ color: "#1C1C28" }}>
                bolt
              </span>
              <h3 className="text-3xl font-black tracking-tighter leading-none mb-4 uppercase">
                Automatización
                <br />
                de Tareas
              </h3>
              <p className="text-lg font-bold" style={{ color: "rgba(28,28,40,0.8)" }}>
                Libera el potencial de tu equipo automatizando el 90% de las tareas repetitivas.
              </p>
            </div>
            <div className="mt-12 space-y-4">
              <div
                data-task
                className="p-4 rounded-xl flex items-center justify-between"
                style={{ backgroundColor: "rgba(255,255,255,0.4)" }}
              >
                <span className="text-xs font-black uppercase tracking-widest">Respuesta IA</span>
                <span className="material-symbols-outlined text-sm">auto_awesome</span>
              </div>
              <div
                data-task
                className="p-4 rounded-xl flex items-center justify-between"
                style={{ backgroundColor: "rgba(255,255,255,0.4)" }}
              >
                <span className="text-xs font-black uppercase tracking-widest">Sincronización</span>
                <span className="material-symbols-outlined text-sm">sync</span>
              </div>
            </div>
          </div>

          {/* Card 3 – CRM – full width */}
          <div
            data-card
            className="md:col-span-12 rounded-2xl p-12 border flex flex-col md:flex-row items-center gap-16 relative overflow-hidden"
            style={{ backgroundColor: "#1C1C28", borderColor: "rgba(255,255,255,0.06)" }}
          >
            <div className="flex-1 z-10">
              <div
                className="text-[10px] font-black uppercase tracking-[0.4em] mb-4"
                style={{ color: "#D1F366" }}
              >
                Gestión Inteligente
              </div>
              <h3
                className="text-5xl font-black tracking-tighter mb-6 uppercase leading-none"
                style={{ color: "white" }}
              >
                CRM Inteligente
              </h3>
              <p
                className="text-xl font-medium leading-relaxed max-w-xl"
                style={{ color: "rgba(255,255,255,0.55)" }}
              >
                Un motor predictivo que califica leads en tiempo real. No solo gestiones
                relaciones: optimízalas con insights de Machine Learning que te dicen a quién
                contactar y cuándo.
              </p>
            </div>

            {/* Stats */}
            <div className="flex-1 w-full z-10">
              <div className="grid grid-cols-2 gap-4">
                <div
                  className="p-6 rounded-2xl"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div
                    className="text-3xl font-black mb-1"
                    style={{ color: "#D1F366" }}
                  >
                    +<AnimatedCounter to={45} suffix="%" />
                  </div>
                  <div
                    className="text-[10px] font-black uppercase tracking-widest"
                    style={{ color: "rgba(255,255,255,0.3)" }}
                  >
                    Conversión
                  </div>
                </div>
                <div
                  className="p-6 rounded-2xl"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div className="text-3xl font-black mb-1 text-white">
                    <AnimatedCounter to={2400} suffix="" />
                  </div>
                  <div
                    className="text-[10px] font-black uppercase tracking-widest"
                    style={{ color: "rgba(255,255,255,0.3)" }}
                  >
                    Leads/Mes
                  </div>
                </div>
                <div
                  className="col-span-2 p-6 rounded-2xl flex items-center justify-between"
                  style={{
                    backgroundColor: "rgba(209,243,102,0.08)",
                    border: "1px solid rgba(209,243,102,0.18)",
                  }}
                >
                  <div>
                    <div className="text-white font-black uppercase tracking-tighter">
                      Predicción de Venta
                    </div>
                    <div
                      className="text-[10px] font-black uppercase tracking-widest"
                      style={{ color: "#D1F366" }}
                    >
                      Alta Probabilidad
                    </div>
                  </div>
                  <div
                    className="h-14 w-14 rounded-full border-2 flex items-center justify-center"
                    style={{ borderColor: "#D1F366" }}
                  >
                    <span className="font-black text-sm" style={{ color: "#D1F366" }}>
                      <AnimatedCounter to={98} suffix="%" />
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Background icon */}
            <div className="absolute right-0 bottom-0 opacity-[0.04] pointer-events-none select-none">
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 300, fontVariationSettings: "'wght' 100" }}
              >
                hub
              </span>
            </div>
          </div>
        </section>

        {/* ─ Capacidades Teaser ─────────────────────────────────────── */}
        <section ref={capSectionRef} id="capacidades" className="py-20">
          <div
            className="rounded-3xl p-12 md:p-20 relative overflow-hidden"
            style={{ backgroundColor: isDark ? "#1C1C28" : "#E4E4DE", transition: "background-color 0.35s ease" }}
          >
            {/* Glow */}
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 55% 60% at 80% 50%, rgba(209,243,102,0.07) 0%, transparent 70%)" }} />

            <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-16">
              {/* Left: text + CTA */}
              <div className="max-w-xl">
                <div className="flex items-center gap-3 mb-6">
                  <span className="inline-block h-[1px] w-8" style={{ backgroundColor: "#D1F366" }} />
                  <span className="text-[10px] font-black uppercase tracking-[0.4em]" style={{ color: "#D1F366" }}>
                    CRM Inteligente
                  </span>
                </div>
                <h2
                  data-cap-heading
                  className="font-black tracking-tighter leading-none mb-6"
                  style={{ fontSize: "clamp(2.2rem, 5vw, 3.8rem)", color: isDark ? "white" : "#1C1C28", transition: "color 0.35s ease" }}
                >
                  TODO LO QUE
                  <br />
                  NECESITA TU
                  <br />
                  <span style={{ color: "#D1F366" }}>NEGOCIO</span>
                </h2>
                <p
                  data-cap-sub
                  className="text-base leading-relaxed mb-10"
                  style={{ color: isDark ? "rgba(255,255,255,0.55)" : "rgba(28,28,40,0.6)", transition: "color 0.35s ease" }}
                >
                  Desde chatbots IA hasta punto de venta — todo integrado en un
                  ecosistema unificado. Explorá cada módulo en detalle.
                </p>
                <Link href="/capacidades">
                  <button
                    data-cap-btn
                    className="flex items-center gap-3 px-8 py-4 rounded-full font-black text-sm uppercase tracking-wider"
                    style={{ backgroundColor: "#D1F366", color: "#1C1C28" }}
                    onMouseEnter={(e) =>
                      gsap.to(e.currentTarget, { scale: 1.05, boxShadow: "0 0 32px rgba(209,243,102,0.35)", duration: 0.25 })
                    }
                    onMouseLeave={(e) =>
                      gsap.to(e.currentTarget, { scale: 1, boxShadow: "none", duration: 0.25 })
                    }
                  >
                    Explorar capacidades del CRM
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
                  </button>
                </Link>
              </div>

              {/* Right: 3×2 capability cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 flex-shrink-0">
                {[
                  { icon: "analytics",     label: "Analytics",       accent: "#D1F366" },
                  { icon: "smart_toy",     label: "Chatbots IA",     accent: "#818CF8" },
                  { icon: "account_tree",  label: "Automatizaciones",accent: "#34D399" },
                  { icon: "calendar_today",label: "Reservas",        accent: "#F472B6" },
                  { icon: "point_of_sale", label: "Punto de Venta",  accent: "#FBBF24" },
                  { icon: "campaign",      label: "Promociones",     accent: "#FB923C" },
                ].map(({ icon, label, accent }) => (
                  <div
                    key={label}
                    data-cap-card
                    className="rounded-2xl p-5 flex flex-col items-center text-center gap-3"
                    style={{
                      backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.6)",
                      border: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(28,28,40,0.1)"}`,
                      transition: "background-color 0.3s ease, border-color 0.3s ease",
                      cursor: "default",
                    }}
                    onMouseEnter={(e) =>
                      gsap.to(e.currentTarget, {
                        borderColor: `${accent}55`,
                        boxShadow: `0 8px 30px ${accent}12`,
                        y: -4,
                        duration: 0.3,
                      })
                    }
                    onMouseLeave={(e) =>
                      gsap.to(e.currentTarget, {
                        borderColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(28,28,40,0.1)",
                        boxShadow: "none",
                        y: 0,
                        duration: 0.3,
                      })
                    }
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: `${accent}18`, border: `1px solid ${accent}30` }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: accent }}>{icon}</span>
                    </div>
                    <span
                      className="text-xs font-black uppercase tracking-wide"
                      style={{ color: isDark ? "rgba(255,255,255,0.7)" : "rgba(28,28,40,0.8)", transition: "color 0.3s ease" }}
                    >
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ─ Pricing ────────────────────────────────────────────────── */}
        <section ref={pricingSectionRef} id="precios" className="py-12">
          <div className="text-center mb-16">
            <h2
              data-pricing-heading
              className="text-5xl font-black tracking-tighter uppercase mb-4"
              style={{ color: T.secTitle, transition: "color 0.35s ease" }}
            >
              Planes Premium
            </h2>
            <p
              data-pricing-sub
              className="font-medium"
              style={{ color: T.secSub, transition: "color 0.35s ease" }}
            >
              Inversión transparente para un crecimiento exponencial.
            </p>
          </div>

          <div ref={pricingRef} className="grid grid-cols-1 md:grid-cols-2 gap-10 max-w-5xl mx-auto px-4">
            {/* Core Plan */}
            <div
              data-pricing-card
              className="rounded-2xl p-12 relative flex flex-col justify-between overflow-hidden"
              style={{
                backgroundColor: T.pCard1Bg,
                border: `1px solid ${T.pCard1Border}`,
                transition: "background-color 0.35s ease, border-color 0.3s ease",
              }}
              onMouseEnter={(e) =>
                gsap.to(e.currentTarget, {
                  borderColor: "rgba(209,243,102,0.4)",
                  boxShadow: "0 20px 60px rgba(209,243,102,0.08)",
                  duration: 0.4,
                })
              }
              onMouseLeave={(e) =>
                gsap.to(e.currentTarget, {
                  borderColor: T.pCard1Border,
                  boxShadow: "none",
                  duration: 0.4,
                })
              }
            >
              {/* Top accent line */}
              <div
                className="absolute top-0 left-0 w-full h-[1px]"
                style={{
                  background: isDark
                    ? "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)"
                    : "linear-gradient(90deg, transparent, rgba(28,28,40,0.15), transparent)",
                }}
              />
              {/* Shimmer sweep */}
              <div
                data-shimmer
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "linear-gradient(105deg, transparent 40%, rgba(209,243,102,0.12) 50%, transparent 60%)",
                  zIndex: 20,
                }}
              />
              <div className="relative z-10">
                <h4
                  className="text-xs font-black uppercase tracking-[0.3em] mb-6"
                  style={{ color: T.pCard1Meta, transition: "color 0.35s ease" }}
                >
                  PLAN MENSUAL
                </h4>
                <h3
                  className="text-4xl font-black mb-2 uppercase tracking-tighter"
                  style={{ color: T.pCard1Title, transition: "color 0.35s ease" }}
                >
                  Acceso Completo
                </h3>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-5xl font-black" style={{ color: "#D1F366" }}>$60.000</span>
                  <span className="text-base font-bold" style={{ color: T.pCard1Suffix, transition: "color 0.35s ease" }}>
                    ARS/mes
                  </span>
                </div>
                <p
                  className="text-xs font-medium mb-8 leading-relaxed"
                  style={{ color: T.pCard1Meta, transition: "color 0.35s ease" }}
                >
                  Acceso total al sistema. Gestioná tu negocio desde un solo lugar, sin costos ocultos.
                </p>
                <ul className="space-y-5 mb-10">
                  {[
                    "CRM Completo",
                    "Creación de Chatbots Ilimitados",
                    "Respuestas ilimitadas de tus bots a clientes",
                    "Automatizaciones de Mensajes",
                    "Todo incluido en el Chatbot",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-center gap-4 font-medium text-sm"
                      style={{ color: T.pCard1List, transition: "color 0.35s ease" }}
                    >
                      <span className="material-symbols-outlined text-base shrink-0" style={{ color: "#D1F366" }}>
                        check_circle
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <Link href="/register" className="relative z-10">
                <button
                  className="w-full py-5 font-black uppercase text-xs tracking-[0.2em] rounded-full"
                  style={{ backgroundColor: T.pCard1BtnBg, color: T.pCard1BtnTxt }}
                  onMouseEnter={(e) =>
                    gsap.to(e.currentTarget, { backgroundColor: "#D1F366", color: "#1C1C28", duration: 0.25 })
                  }
                  onMouseLeave={(e) =>
                    gsap.to(e.currentTarget, { backgroundColor: T.pCard1BtnBg, color: T.pCard1BtnTxt, duration: 0.25 })
                  }
                >
                  Comenzar Ahora
                </button>
              </Link>
            </div>

            {/* Messaging Plan */}
            <div
              data-pricing-card
              className="rounded-2xl p-12 relative flex flex-col justify-between overflow-hidden"
              style={{
                backgroundColor: "#D1F366",
                boxShadow: "0 20px 60px -15px rgba(209,243,102,0.3)",
              }}
              onMouseEnter={(e) =>
                gsap.to(e.currentTarget, { scale: 1.02, duration: 0.3, ease: "back.out(2)" })
              }
              onMouseLeave={(e) =>
                gsap.to(e.currentTarget, { scale: 1, duration: 0.3 })
              }
            >
              {/* Shimmer sweep */}
              <div
                data-shimmer
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.35) 50%, transparent 60%)",
                  zIndex: 20,
                }}
              />
              <div className="absolute top-5 right-5 z-30">
                <span
                  className="px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest text-white"
                  style={{ backgroundColor: "#1C1C28" }}
                >
                  ADD-ON
                </span>
              </div>
              <div className="relative z-10">
                <h4
                  className="text-xs font-black uppercase tracking-[0.3em] mb-6"
                  style={{ color: "rgba(28,28,40,0.45)" }}
                >
                  ENVÍO MASIVO
                </h4>
                <h3
                  className="text-4xl font-black mb-2 uppercase tracking-tighter"
                  style={{ color: "#1C1C28" }}
                >
                  WhatsApp<br />Marketing
                </h3>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-6xl font-black" style={{ color: "#1C1C28" }}>
                    0.08
                  </span>
                  <span className="text-base font-bold" style={{ color: "rgba(28,28,40,0.55)" }}>
                    USD/mensaje
                  </span>
                </div>
                <p
                  className="text-xs font-bold mb-8 leading-relaxed"
                  style={{ color: "rgba(28,28,40,0.65)" }}
                >
                  Envío masivo de mensajes por WhatsApp con criterio de marketing y publicidad.
                  Los chats y automatizaciones del bot están&nbsp;<span style={{ color: "#1C1C28", textDecoration: "underline" }}>siempre incluidos</span>&nbsp;en el plan base.
                </p>
                <ul className="space-y-5 mb-10">
                  {[
                    "Campañas masivas WhatsApp",
                    "Segmentación por criterios",
                    "Marketing & Publicidad",
                    "Requiere plan base activo",
                  ].map((item, i) => (
                    <li
                      key={item}
                      className="flex items-center gap-4 font-bold text-sm"
                      style={{ color: "#1C1C28" }}
                    >
                      <span
                        className="material-symbols-outlined text-base shrink-0"
                        style={{ fontVariationSettings: "'FILL' 1", opacity: i === 3 ? 0.4 : 1 }}
                      >
                        {i === 3 ? "info" : "send"}
                      </span>
                      <span style={{ opacity: i === 3 ? 0.6 : 1 }}>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <Link href="/register" className="relative z-10">
                <button
                  className="w-full py-5 text-white font-black uppercase text-xs tracking-[0.2em] rounded-full"
                  style={{ backgroundColor: "#1C1C28" }}
                  onMouseEnter={(e) =>
                    gsap.to(e.currentTarget, {
                      scale: 1.03,
                      boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
                      duration: 0.25,
                    })
                  }
                  onMouseLeave={(e) =>
                    gsap.to(e.currentTarget, { scale: 1, boxShadow: "none", duration: 0.25 })
                  }
                >
                  Activar Envío Masivo
                </button>
              </Link>
            </div>
          </div>
        </section>

        {/* ─ CTA Section ────────────────────────────────────────────── */}
        <section
          ref={ctaRef}
          className="rounded-2xl p-12 md:p-24 text-center relative overflow-hidden"
          style={{ backgroundColor: T.ctaBg, transition: "background-color 0.35s ease" }}
        >
          <div className="relative z-10 max-w-3xl mx-auto">
            <h2
              data-cta-heading
              className="font-black tracking-tighter mb-8 uppercase leading-[0.9]"
              style={{ fontSize: "clamp(2.5rem, 7vw, 4.5rem)", color: T.ctaTitle, transition: "color 0.35s ease" }}
            >
              ¿LISTO PARA{" "}
              <span
                style={{
                  WebkitTextStroke: `1px ${T.ctaStroke}`,
                  color: "transparent",
                  display: "inline-block",
                }}
              >
                AUTOMATIZAR
              </span>{" "}
              TU ÉXITO?
            </h2>
            <p
              data-cta-sub
              className="mb-12 text-lg font-medium"
              style={{ color: T.ctaSub, transition: "color 0.35s ease" }}
            >
              Únete a las más de 500 empresas que ya están revolucionando su experiencia de cliente.
            </p>
            <div data-cta-form className="flex justify-center">
              <div
                className="p-2 rounded-full flex flex-col md:flex-row items-center gap-4 w-full md:w-auto"
                style={{ backgroundColor: T.ctaFormBg, transition: "background-color 0.35s ease" }}
              >
                <input
                  type="email"
                  placeholder="Correo corporativo"
                  className="bg-transparent border-none outline-none px-8 py-3 w-full md:w-80 text-sm font-medium placeholder:opacity-40"
                  style={{ color: "white" }}
                />
                <Link href="/register">
                  <button
                    className="px-10 py-4 rounded-full font-black text-xs uppercase tracking-widest transition-all w-full md:w-auto"
                    style={{ backgroundColor: "#D1F366", color: "#1C1C28" }}
                    onMouseEnter={(e) =>
                      gsap.to(e.currentTarget, { scale: 1.06, duration: 0.2, ease: "back.out(2)" })
                    }
                    onMouseLeave={(e) =>
                      gsap.to(e.currentTarget, { scale: 1, duration: 0.2 })
                    }
                  >
                    Iniciar Prueba Gratuita
                  </button>
                </Link>
              </div>
            </div>
          </div>
          {/* Decorative dot grid */}
          <div
            className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{
              backgroundImage: `radial-gradient(${T.ctaDotColor} 1px, transparent 1px)`,
              backgroundSize: "20px 20px",
            }}
          />
        </section>
      </main>

      {/* ─ Footer ─────────────────────────────────────────────────── */}
      <footer
        ref={footerRef}
        className="w-full px-8 md:px-20 py-20 mt-20 relative overflow-hidden"
        style={{
          backgroundColor: T.footerBg,
          borderTop: `1px solid ${T.footerBorder}`,
          transition: "background-color 0.35s ease, border-color 0.3s ease",
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 items-start relative z-10 max-w-[1600px] mx-auto">
          <div data-footer-col className="md:col-span-4">
            <div
              className="text-3xl font-black mb-4 tracking-tighter"
              style={{ color: T.footerLogo, transition: "color 0.35s ease" }}
            >
              UCOBOT
            </div>
            <div
              className="text-[11px] uppercase tracking-[0.4em] font-black mb-8 leading-relaxed"
              style={{ color: T.footerMeta, transition: "color 0.35s ease" }}
            >
              UNA SOLUCIÓN DESARROLLADA POR
              <br />
              <span style={{ color: T.footerSpan, transition: "color 0.35s ease" }}>CODEA DESARROLLOS</span>
            </div>
            <div className="flex gap-4">
              {["language", "alternate_email"].map((icon) => (
                <div
                  key={icon}
                  className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer"
                  style={{
                    backgroundColor: T.footerSocBg,
                    border: `1px solid ${T.footerSocBdr}`,
                    transition: "background-color 0.3s ease, border-color 0.3s ease",
                  }}
                  onMouseEnter={(e) =>
                    gsap.to(e.currentTarget, { borderColor: "#D1F366", duration: 0.25 })
                  }
                  onMouseLeave={(e) =>
                    gsap.to(e.currentTarget, {
                      borderColor: T.footerSocBdr,
                      duration: 0.25,
                    })
                  }
                >
                  <span className="material-symbols-outlined text-sm" style={{ color: T.footerSocIcon, transition: "color 0.3s ease" }}>{icon}</span>
                </div>
              ))}
            </div>
          </div>

          <div data-footer-col className="md:col-span-5 grid grid-cols-2 gap-8">
            <div className="space-y-4">
              <h5
                className="text-[10px] font-black uppercase tracking-[0.3em]"
                style={{ color: T.footerHdr, transition: "color 0.35s ease" }}
              >
                Compañía
              </h5>
              <nav className="flex flex-col gap-3">
                {["Privacidad", "Términos", "Cookies"].map((item) => (
                  <a
                    key={item}
                    href="#"
                    className="text-xs font-bold"
                    style={{ color: T.footerLink, transition: "color 0.2s ease" }}
                    onMouseEnter={(e) =>
                      gsap.to(e.currentTarget, { color: isDark ? "#D1F366" : "#1C1C28", duration: 0.2 })
                    }
                    onMouseLeave={(e) =>
                      gsap.to(e.currentTarget, {
                        color: T.footerLink,
                        duration: 0.2,
                      })
                    }
                  >
                    {item}
                  </a>
                ))}
              </nav>
            </div>
            <div className="space-y-4">
              <h5
                className="text-[10px] font-black uppercase tracking-[0.3em]"
                style={{ color: T.footerHdr, transition: "color 0.35s ease" }}
              >
                Soporte
              </h5>
              <nav className="flex flex-col gap-3">
                {["Documentación API", "Centro de Ayuda", "Contacto"].map((item) => (
                  <a
                    key={item}
                    href="#"
                    className="text-xs font-bold"
                    style={{ color: T.footerLink, transition: "color 0.2s ease" }}
                    onMouseEnter={(e) =>
                      gsap.to(e.currentTarget, { color: isDark ? "#D1F366" : "#1C1C28", duration: 0.2 })
                    }
                    onMouseLeave={(e) =>
                      gsap.to(e.currentTarget, {
                        color: T.footerLink,
                        duration: 0.2,
                      })
                    }
                  >
                    {item}
                  </a>
                ))}
              </nav>
            </div>
          </div>

          <div
            data-footer-col
            className="md:col-span-3 text-right"
          >
            <div
              className="text-[10px] uppercase tracking-widest font-black mb-2"
              style={{ color: T.footerHdr, transition: "color 0.35s ease" }}
            >
              Diseño Editorial v2.0
            </div>
            <div
              className="text-[10px] uppercase tracking-widest font-black"
              style={{ color: T.footerCopy, transition: "color 0.35s ease" }}
            >
              © 2025 UCOBOT. Todos los derechos reservados.
            </div>
          </div>
        </div>

        {/* CODEA watermark */}
        <div
          ref={codeaRef}
          className="absolute bottom-0 right-0 font-black select-none pointer-events-none uppercase tracking-tighter"
          style={{ fontSize: "clamp(60px, 12vw, 140px)", color: T.footerMark, lineHeight: 1, whiteSpace: "nowrap" }}
        >
          CODEA
        </div>
      </footer>
    </div>
  )
}
