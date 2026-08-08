"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, EffectCoverflow, Pagination, A11y, Keyboard } from "swiper/modules";
import type { SwiperClass } from "swiper/react";
import { Pause, Play } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";

import "swiper/css";
import "swiper/css/effect-coverflow";
import "swiper/css/pagination";
import "swiper/css/a11y";

// Leaflet touches `window` on import, so it can only ever run client-side.
const OutletMap = dynamic(() => import("@/components/OutletMap"), {
  ssr: false,
  loading: () => <div className="outlet-map-wrap outlet-map-skeleton" />,
});

const partnerBrands = [
  {
    name: "Yun Nam",
    src: "/logos/yun_nam.png",
    year: 1984,
    cardBg: "#ff7600",
    hoverBg: "#e56a00",
    tagline: "HAIRCARE",
    description:
      "Innovative herb-infused treatments that overcome hair loss and hair-related problems.",
    url: "https://yunnamhaircare.com.sg/",
  },
  {
    name: "London",
    src: "/logos/london.png",
    year: 2001,
    cardBg: "#cd0008",
    hoverBg: "#b00008",
    tagline: "Weight Management",
    description:
      "Award-winning slimming expert helping women achieve wellness goals for over 20 years.",
    url: "https://londonweight.com.sg/",
  },
  {
    name: "New York",
    src: "/logos/new_york.png",
    year: 2004,
    cardBg: "#0082d7",
    hoverBg: "#0072c0",
    tagline: "Skin Solutions",
    description:
      "ONE-STOP Skin Solution Centre dedicated to restoring healthy skin for all skin types.",
    url: "https://newyorkskinsolutions.com.sg/",
  },
  {
    name: "Dorra",
    src: "/logos/dorra.png",
    year: 2011,
    cardBg: "#480a87",
    hoverBg: "#3d0875",
    tagline: "Tummy, Hip & Thigh Slimming",
    description:
      "French lower body slimming expert with fat-burning tech to resolve stubborn areas.",
    url: "https://dorraslim.com.sg/",
  },
  {
    name: "Shakura",
    src: "/logos/shakura.png",
    year: 2011,
    cardBg: "#e61994",
    hoverBg: "#cc1685",
    tagline: "Pigmentation Beauty",
    description:
      "Japan's pigmentation & whitening specialist providing customised skin care solutions.",
    url: "https://www.shakura.com.sg/",
  },
  {
    name: "Jonsson",
    src: "/logos/jonsson.png",
    year: 2013,
    cardBg: "#b29014",
    hoverBg: "#9e7f12",
    tagline: "PROTEIN\nHEALTHY HAIR GROWTH",
    description:
      "USA Hair Care Expert™ using hydrolyzed soy protein to restore a healthy scalp.",
    url: "https://jonssonprotein.com.sg/",
  },
  {
    name: "Victoria",
    src: "/logos/victoria.png",
    year: 2015,
    cardBg: "#0aaf8a",
    hoverBg: "#089c7a",
    tagline: "FACELIFT\nAGEING | SAGGING | WRINKLES",
    description:
      "V-Factor formula offers a painless, natural alternative to looking youthful across Asia.",
    url: "https://victoriafacelift.com.sg/",
  },
];

const swiperSlides = [...partnerBrands, ...partnerBrands];

// Swiper 12's loop mode repositions the real slide elements instead of
// cloning DOM nodes (no `.swiper-slide-duplicate` class exists in this
// version — verified against node_modules/swiper/shared/swiper-core.mjs).
// Because this carousel already renders each brand twice in `swiperSlides`
// (for loop continuity) and each card is a real `<a href>`, every non-active
// slide's link is still a focusable, real tab stop even when visually
// de-emphasized (see `.swiper-slide:not(.swiper-slide-active)` above). Keep
// only the active slide's link in the tab order; everything else gets
// tabIndex=-1 + aria-hidden so tabbing through the carousel doesn't land on
// off-screen/duplicate cards. Re-run on every event that can change which
// slide is active.
const syncSlideFocusability = (swiper: SwiperClass) => {
  swiper.slides.forEach((slideEl) => {
    const link = slideEl.querySelector<HTMLAnchorElement>("a");
    if (!link) return;
    const isActive = slideEl.classList.contains("swiper-slide-active");
    link.tabIndex = isActive ? 0 : -1;
    if (isActive) {
      link.removeAttribute("aria-hidden");
    } else {
      link.setAttribute("aria-hidden", "true");
    }
  });
};

export default function PublicHomePage() {
  const { status } = useSession();
  const router = useRouter();
  const [hoveredBrand, setHoveredBrand] = useState<string | null>(null);
  const [isAutoplayPlaying, setIsAutoplayPlaying] = useState(true);
  const swiperRef = useRef<SwiperClass | null>(null);

  useEffect(() => {
    if (status === "authenticated") router.push("/dashboard");
  }, [status, router]);

  const goApply = () => router.push("/contractor/expressInterest");

  const toggleAutoplay = () => {
    const swiper = swiperRef.current;
    if (!swiper?.autoplay) return;
    // Only trigger start()/stop() here — `isAutoplayPlaying` itself is kept
    // in sync via the Swiper instance's own autoplayStart/Stop/Pause/Resume
    // events (see <Swiper> props below), so it reflects reality even when
    // autoplay is paused/resumed by something other than this button (e.g.
    // `pauseOnMouseEnter` hovering the carousel).
    if (isAutoplayPlaying) {
      swiper.autoplay.stop();
    } else {
      swiper.autoplay.start();
    }
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[#15406a]/30 border-t-[#15406a]" />
          <p className="text-[11px] uppercase tracking-[0.3em] text-[#86868b]">Loading</p>
        </div>
      </div>
    );
  }

  return (
    <div className="apple-font min-h-screen overflow-x-hidden bg-white text-[#1d1d1f]">
      <style jsx global>{`
        .apple-font {
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial,
            sans-serif;
        }

        .rainbow-text {
          background: linear-gradient(90deg, #c0392b, #e67e22, #f1c40f, #2ecc71, #3498db, #9b59b6);
          background-clip: text;
          -webkit-background-clip: text;
          color: transparent;
        }

        /* Smooth, slow-moving blue gradient — no blobs, just a gentle sweep */
        @keyframes gradientFlow {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
        .hero-gradient {
          background: linear-gradient(120deg, #071c2e, #0d2d4a, #15406a, #1a4d80, #0d2d4a, #071c2e);
          background-size: 300% 300%;
          animation: gradientFlow 18s ease-in-out infinite;
        }

        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-up {
          animation: fadeUp 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        /* ---- Swiper is a third-party library that renders its own wrapper/slide/
           pagination DOM outside of this component's own JSX, so these rules must
           stay global — styled-jsx can only scope elements this component authors
           directly, not elements a child library injects at runtime. ---- */
        .swiper-wrapper {
          align-items: stretch !important;
        }
        /* Inactive bullet: #cfd8e3 (sRGB 0.812/0.847/0.890) @ 0.6 alpha over
           the hero gradient's lightest stop (#1a4d80, L_bg ≈ 0.0709)
           alpha-composites to rgb(0.528,0.629,0.735), linear luminance
           L_fg ≈ 0.340, giving contrast (0.340+0.05)/(0.0709+0.05) ≈ 3.23:1
           — just over the 3:1 non-text minimum with almost no safety margin.
           Raised to 0.75 alpha (composited rgb(0.634,0.711,0.793),
           L_fg ≈ 0.451, ratio ≈ 4.14:1) for real headroom. */
        .swiper-pagination-bullet {
          background: #cfd8e3;
          opacity: 0.75;
        }
        .swiper-pagination-bullet-active {
          background: #ffffff;
          opacity: 1;
        }
        .mySwiper {
          padding-left: 0 !important;
          padding-right: 0 !important;
          overflow: visible !important;
        }
        .swiper-slide {
          display: flex;
          justify-content: center;
          align-items: stretch;
          height: auto;
        }

        /* ---- Partner cards — full brand color, white logo chip so every logo
           (transparent or white-bg) sits cleanly. Composed on top of Card/
           CardContent (see JSX); since Card is a shared component rather than a
           native element authored in this file, styled-jsx can't scope selectors
           targeting its output, so these also stay global. ---- */
        .brand-card-shell {
          position: relative;
          border-radius: 28px;
          display: flex;
          flex-direction: column;
          width: 280px;
          height: 380px;
          flex-shrink: 0;
          transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.4s ease, background-color 0.3s ease;
          box-shadow: 0 14px 34px -18px rgba(0, 0, 0, 0.35);
        }
        .brand-card-link:hover .brand-card-shell,
        .brand-card-link:focus-visible .brand-card-shell {
          transform: translateY(-6px);
          box-shadow: 0 26px 50px -18px rgba(0, 0, 0, 0.45);
        }
        .swiper-slide:not(.swiper-slide-active) .brand-card-shell {
          transform: scale(0.9);
          opacity: 0.6;
          transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.4s ease;
        }
        .swiper-slide-active .brand-card-shell {
          transform: scale(1);
          opacity: 1;
        }

        .brand-card-content {
          display: flex;
          flex: 1;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 26px 26px 28px;
        }

        .brand-logo-wrap {
          width: 100%;
          height: 68px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.97);
          border-radius: 12px;
          padding: 8px 14px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
        }
        .brand-logo {
          height: 40px;
          width: auto;
          max-width: 85%;
          object-fit: contain;
        }

        .brand-name {
          margin-top: 16px;
          font-size: 1.15rem;
          font-weight: 700;
          letter-spacing: -0.01em;
          color: #fff;
        }
        .brand-tagline {
          margin-top: 3px;
          font-size: 0.72rem;
          font-weight: 500;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.8);
          white-space: pre-line;
        }

        .brand-desc {
          margin-top: 12px;
          font-size: 0.85rem;
          line-height: 1.55;
          color: rgba(255, 255, 255, 0.85);
          flex: 1;
        }
        .brand-footer {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          margin-top: 16px;
        }
        .brand-year {
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.75);
        }
        .brand-visit {
          font-size: 0.8rem;
          font-weight: 600;
          color: #fff;
          display: inline-flex;
          align-items: center;
          gap: 3px;
          transition: gap 0.2s ease;
        }
        .brand-card-link:hover .brand-visit,
        .brand-card-link:focus-visible .brand-visit {
          gap: 6px;
        }

        @media (max-width: 640px) {
          .brand-card-shell {
            width: 230px;
            height: 340px;
          }
          .brand-card-content {
            padding: 24px 20px 22px;
          }
          .brand-name {
            font-size: 1rem;
          }
        }

        @media (min-width: 1024px) {
          .brand-card-shell {
            width: 300px;
            height: 400px;
          }
        }

        /* ---- Outlet locator map — OutletMap renders its own DOM, and Leaflet
           itself injects markers/tooltips/attribution imperatively outside React,
           so none of this can be scoped to this component either. ---- */
        .outlet-map-card {
          margin-top: 56px;
          text-align: left;
        }
        .outlet-map-title {
          font-size: 0.8rem;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          /* White text @ 0.55 alpha over the hero gradient's lightest stop
             (#1a4d80 → sRGB 0.102/0.302/0.502, relative luminance
             L_bg ≈ 0.0709 via the WCAG formula) alpha-composites in sRGB
             space to rgb(0.596,0.686,0.776), linear luminance L_fg ≈ 0.414,
             giving contrast (0.414+0.05)/(0.0709+0.05) ≈ 3.83:1 — still
             below the 4.5:1 AA minimum for text. Raised to 0.7 alpha
             (composited rgb(0.731,0.791,0.851), L_fg ≈ 0.575, ratio ≈
             5.17:1) to clear 4.5:1 with margin at that same worst-case stop. */
          color: rgba(255, 255, 255, 0.7);
          margin-bottom: 10px;
        }
        .outlet-map-wrap {
          position: relative;
          width: 100%;
          height: 420px;
          border-radius: 20px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 20px 50px -22px rgba(0, 0, 0, 0.6);
        }
        .outlet-map {
          width: 100%;
          height: 100%;
          background: #0d2d4a;
        }
        .outlet-map-skeleton {
          background: linear-gradient(
            100deg,
            rgba(255, 255, 255, 0.03) 30%,
            rgba(255, 255, 255, 0.08) 50%,
            rgba(255, 255, 255, 0.03) 70%
          );
          background-size: 200% 100%;
          animation: gradientFlow 1.6s ease-in-out infinite;
        }
        .outlet-map-loading {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.5);
          pointer-events: none;
          z-index: 5;
        }
        .outlet-map-count {
          position: absolute;
          top: 12px;
          left: 12px;
          z-index: 400;
          padding: 6px 12px;
          border-radius: 999px;
          background: rgba(7, 28, 46, 0.85);
          backdrop-filter: blur(6px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          font-size: 0.72rem;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.85);
        }
        .outlet-pin-dot {
          display: block;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #22d3ee;
          border: 2px solid #fff;
          box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.35);
        }
        /* Standard OSM tiles inverted to a dark navy theme (well-known CSS trick) */
        .outlet-map-tiles {
          filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%);
        }
        .leaflet-container {
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial,
            sans-serif;
          background: #0d2d4a;
        }
        .leaflet-tooltip.leaflet-tooltip-top {
          background: rgba(7, 28, 46, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 10px;
          color: #fff;
          padding: 8px 10px;
          box-shadow: 0 10px 24px -10px rgba(0, 0, 0, 0.6);
        }
        .leaflet-tooltip-top::before {
          border-top-color: rgba(7, 28, 46, 0.95);
        }
        .outlet-tooltip {
          display: flex;
          flex-direction: column;
          gap: 2px;
          font-size: 0.72rem;
          line-height: 1.4;
          max-width: 200px;
        }
        .outlet-tooltip strong {
          font-size: 0.78rem;
          color: #fff;
        }
        .outlet-tooltip-brand {
          color: #96b4d2;
          font-weight: 500;
        }
        .outlet-tooltip span {
          color: rgba(255, 255, 255, 0.75);
        }
        .leaflet-control-attribution {
          background: rgba(7, 28, 46, 0.7) !important;
          color: rgba(255, 255, 255, 0.5) !important;
        }
        .leaflet-control-attribution a {
          color: rgba(255, 255, 255, 0.7) !important;
        }
        .leaflet-control-zoom a {
          background: rgba(7, 28, 46, 0.85) !important;
          color: #fff !important;
          border-color: rgba(255, 255, 255, 0.15) !important;
        }
        .leaflet-control-zoom a:hover {
          background: rgba(7, 28, 46, 1) !important;
        }
      `}</style>

      {/* Hero */}
      <section className="hero-gradient relative flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-6 py-24 text-center">
        <div className="animate-fade-up relative z-10 w-full max-w-3xl">
          <p className="rainbow-text text-2xl font-black uppercase tracking-tight sm:text-3xl md:text-4xl">
            Beauty One International
          </p>
          <h1 className="mt-3 text-4xl font-black uppercase tracking-tight text-white sm:text-5xl md:text-6xl">
            Facilities
            <br />
            Management Team
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-white/80 sm:text-xl">
            Partnering with trusted renovation contractors to maintain outlets across our network of Singapore&rsquo;s
            leading beauty and wellness brands.
          </p>
          <div className="mt-9 flex items-center justify-center">
            <Button onClick={goApply} variant="heroLight" size="pill">
              Submit Interest
            </Button>
          </div>

          <div className="outlet-map-card">
            <p className="outlet-map-title">Our outlets across Singapore</p>
            <OutletMap />
          </div>
        </div>
      </section>

      {/* Our Network */}
      <section id="partners" className="hero-gradient border-t border-white/10 px-4 py-24 sm:py-28">
        <div className="mx-auto max-w-6xl text-center">
          <p className="text-sm font-semibold text-[#96b4d2]">Our Network</p>
          <h2 className="mx-auto mt-2 max-w-2xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Trusted by Singapore&rsquo;s leading beauty and wellness brands.
          </h2>

          <div
            className="mt-16 w-full"
            style={{ paddingBottom: "56px" }}
            onFocus={() => {
              // Only arrow-key-drive the carousel while focus is actually
              // inside it — with keyboard.enabled starting `false` and
              // onlyInViewport left `true`, Swiper's Keyboard module attaches
              // a *document-wide* keydown listener the moment it's enabled
              // (see node_modules/swiper/modules/keyboard.mjs), so it must be
              // toggled on focus-in/focus-out rather than left permanently on.
              swiperRef.current?.keyboard.enable();
            }}
            onBlur={(e) => {
              const next = e.relatedTarget;
              // Don't disable when focus is just moving between slides
              // inside the carousel — only when it leaves the container.
              if (next instanceof Node && e.currentTarget.contains(next)) return;
              swiperRef.current?.keyboard.disable();
            }}
          >
            <Swiper
              modules={[Autoplay, EffectCoverflow, Pagination, A11y, Keyboard]}
              onSwiper={(swiper) => {
                swiperRef.current = swiper;
                syncSlideFocusability(swiper);
              }}
              onAfterInit={syncSlideFocusability}
              onSlideChange={syncSlideFocusability}
              onTransitionEnd={syncSlideFocusability}
              onLoopFix={syncSlideFocusability}
              onAutoplayStart={() => setIsAutoplayPlaying(true)}
              onAutoplayStop={() => setIsAutoplayPlaying(false)}
              onAutoplayResume={() => setIsAutoplayPlaying(true)}
              onAutoplayPause={() => setIsAutoplayPlaying(false)}
              effect="coverflow"
              grabCursor={true}
              centeredSlides={true}
              slidesPerView="auto"
              coverflowEffect={{
                rotate: 0,
                stretch: 0,
                depth: 160,
                modifier: 1.6,
                slideShadows: false,
              }}
              autoplay={{
                delay: 2600,
                disableOnInteraction: false,
                pauseOnMouseEnter: true,
                waitForTransition: true,
              }}
              pagination={{ clickable: true }}
              a11y={{ enabled: true }}
              keyboard={{ enabled: false, onlyInViewport: true }}
              loop={true}
              speed={700}
              breakpoints={{
                320: { slidesPerView: 1.3, spaceBetween: 14 },
                480: { slidesPerView: 1.7, spaceBetween: 16 },
                640: { slidesPerView: 2.2, spaceBetween: 18 },
                768: { slidesPerView: 2.6, spaceBetween: 20 },
                1024: { slidesPerView: 3, spaceBetween: 26 },
                1280: { slidesPerView: 3.4, spaceBetween: 28 },
              }}
              className="mySwiper"
            >
              {swiperSlides.map((brand, index) => (
                <SwiperSlide key={`${brand.name}-${index}`} style={{ width: "auto" }}>
                  <a
                    href={brand.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="brand-card-link block rounded-[28px] outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#071c2e]"
                    onMouseEnter={() => setHoveredBrand(brand.name)}
                    onMouseLeave={() => setHoveredBrand(null)}
                    onFocus={() => setHoveredBrand(brand.name)}
                    onBlur={() => setHoveredBrand(null)}
                  >
                    <Card
                      className="brand-card-shell rounded-[28px] border-0 shadow-none"
                      style={{ backgroundColor: hoveredBrand === brand.name ? brand.hoverBg : brand.cardBg }}
                    >
                      <CardContent className="brand-card-content p-0">
                        <div className="brand-logo-wrap">
                          <img src={brand.src} alt={brand.name} className="brand-logo" loading="lazy" />
                        </div>

                        <p className="brand-name">{brand.name}</p>
                        <p className="brand-tagline">{brand.tagline}</p>

                        <p className="brand-desc">{brand.description}</p>

                        <div className="brand-footer">
                          <span className="brand-year">Est. {brand.year}</span>
                          <span className="brand-visit">
                            Visit site <span className="chev" aria-hidden="true">›</span>
                            <span className="sr-only"> (opens in a new window)</span>
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </a>
                </SwiperSlide>
              ))}
            </Swiper>

            <div className="mt-4 flex justify-center">
              <Button
                type="button"
                variant="heroGhost"
                size="icon-auto"
                onClick={toggleAutoplay}
                aria-pressed={isAutoplayPlaying}
                aria-label={
                  isAutoplayPlaying ? "Pause automatic carousel rotation" : "Resume automatic carousel rotation"
                }
              >
                {isAutoplayPlaying ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="hero-gradient border-t border-white/10 px-6 py-24 text-center sm:py-28">
        <h2 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Ready to <span className="text-[#96b4d2]">join us?</span>
        </h2>
        <p className="mx-auto mt-4 max-w-md text-lg text-white/80">
          Submit your interest today and our team will reach out soon.
        </p>
        <div className="mt-9">
          <Button onClick={goApply} variant="heroLight" size="pill">
            Submit Interest
          </Button>
        </div>
      </section>
    </div>
  );
}
