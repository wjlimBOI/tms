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
import "./homepage.css";

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
      "USA Hair Care Expertâ„¢ using hydrolyzed soy protein to restore a healthy scalp.",
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

  // Swiper's coverflow effect measures each slide's real rendered size at
  // init time to compute its 3D transforms. homepage.css now loads as a
  // separate, asynchronously-fetched stylesheet (previously an inline
  // <style jsx> block that applied synchronously) - if Swiper finishes
  // initializing before that stylesheet has actually been applied, it
  // measures unstyled (zero/collapsed-size) slides and never recalculates
  // afterwards on its own, leaving every card sized/positioned wrong until
  // something else (like a hover, which can trigger Swiper's own internal
  // update on interaction) forces a recompute. Force one recalculation
  // after mount, once the browser has had a chance to paint with the real
  // stylesheet applied.
  useEffect(() => {
    const handleLoad = () => swiperRef.current?.update();
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        swiperRef.current?.update();
      });
    });
    window.addEventListener("load", handleLoad);
    return () => {
      cancelAnimationFrame(raf1);
      window.removeEventListener("load", handleLoad);
    };
  }, []);

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
                          <img src={brand.src} alt={brand.name} className="brand-logo" />
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
