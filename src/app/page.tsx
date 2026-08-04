"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, EffectCoverflow, Pagination } from "swiper/modules";

import "swiper/css";
import "swiper/css/effect-coverflow";
import "swiper/css/pagination";

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

export default function PublicHomePage() {
  const { status } = useSession();
  const router = useRouter();
  const processRef = useRef<HTMLElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [hoveredBrand, setHoveredBrand] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") router.push("/dashboard");
  }, [status, router]);

  useEffect(() => {
    const onScroll = () => {
      const max = document.body.scrollHeight - window.innerHeight;
      const raw = max > 0 ? window.scrollY / max : 0;
      const eased = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2;
      setScrollProgress(eased);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleClick = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const startR = 255,
    startG = 255,
    startB = 255;
  const endR = 8,
    endG = 80,
    endB = 100;
  const r = Math.round(startR + (endR - startR) * scrollProgress);
  const g = Math.round(startG + (endG - startG) * scrollProgress);
  const b = Math.round(startB + (endB - startB) * scrollProgress);
  const bgColor = `rgb(${r}, ${g}, ${b})`;

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a1228]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-[11px] tracking-[0.3em] uppercase text-white/40">Loading</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen text-white overflow-x-hidden font-sans transition-colors duration-500"
      style={{ backgroundColor: bgColor }}
    >
      <style jsx global>{`
        @keyframes shimmer {
          from {
            background-position: 0% center;
          }
          to {
            background-position: 260% center;
          }
        }
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes bob {
          0%,
          100% {
            opacity: 0.4;
            transform: translateY(0);
          }
          50% {
            opacity: 0.8;
            transform: translateY(6px);
          }
        }
        @keyframes shimmerLine {
          0% {
            background-position: -200% center;
          }
          100% {
            background-position: 200% center;
          }
        }

        /* Aurora Background Animation */
        @keyframes aurora {
          0% {
            transform: translate(0%, 0%) scale(1);
            opacity: 0.6;
          }
          25% {
            transform: translate(-10%, -15%) scale(1.1);
            opacity: 0.8;
          }
          50% {
            transform: translate(15%, -5%) scale(0.9);
            opacity: 0.5;
          }
          75% {
            transform: translate(-5%, 10%) scale(1.15);
            opacity: 0.7;
          }
          100% {
            transform: translate(0%, 0%) scale(1);
            opacity: 0.6;
          }
        }
        @keyframes aurora2 {
          0% {
            transform: translate(0%, 0%) scale(1);
            opacity: 0.4;
          }
          33% {
            transform: translate(15%, -10%) scale(1.2);
            opacity: 0.6;
          }
          66% {
            transform: translate(-10%, 15%) scale(0.8);
            opacity: 0.3;
          }
          100% {
            transform: translate(0%, 0%) scale(1);
            opacity: 0.4;
          }
        }
        @keyframes aurora3 {
          0% {
            transform: translate(0%, 0%) scale(1);
            opacity: 0.5;
          }
          50% {
            transform: translate(-20%, -20%) scale(1.3);
            opacity: 0.7;
          }
          100% {
            transform: translate(0%, 0%) scale(1);
            opacity: 0.5;
          }
        }

        .aurora-container {
          position: absolute;
          inset: 0;
          overflow: hidden;
          z-index: 0;
          pointer-events: none;
        }
        .aurora-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          will-change: transform, opacity;
          pointer-events: none;
        }
        .aurora-blob-1 {
          width: 60vw;
          height: 60vw;
          top: -20%;
          left: -10%;
          background: radial-gradient(circle, rgba(6, 182, 212, 0.3), rgba(59, 130, 246, 0.15), transparent 70%);
          animation: aurora 12s ease-in-out infinite;
        }
        .aurora-blob-2 {
          width: 50vw;
          height: 50vw;
          bottom: -15%;
          right: -10%;
          background: radial-gradient(circle, rgba(139, 92, 246, 0.25), rgba(6, 182, 212, 0.1), transparent 70%);
          animation: aurora2 15s ease-in-out infinite;
        }
        .aurora-blob-3 {
          width: 40vw;
          height: 40vw;
          top: 30%;
          left: 50%;
          transform: translateX(-50%);
          background: radial-gradient(circle, rgba(236, 72, 153, 0.2), rgba(59, 130, 246, 0.1), transparent 70%);
          animation: aurora3 18s ease-in-out infinite;
        }
        .aurora-blob-4 {
          width: 35vw;
          height: 35vw;
          top: 10%;
          right: 20%;
          background: radial-gradient(circle, rgba(52, 211, 153, 0.15), rgba(6, 182, 212, 0.08), transparent 70%);
          animation: aurora2 14s ease-in-out infinite reverse;
        }

        /* Bauhaus-Brutalism fusion */
        .hero-title {
          font-family: "Helvetica", "Arial", sans-serif;
          font-weight: 900;
          letter-spacing: -0.02em;
          line-height: 1.05;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
          text-transform: uppercase;
        }
        .hero-main {
          background: linear-gradient(
            135deg,
            #1e40af 0%,
            #3b82f6 40%,
            #06b6d4 70%,
            #22d3ee 100%
          );
          background-size: 260% auto;
          background-clip: text;
          -webkit-background-clip: text;
          color: transparent;
          animation: shimmer 6s ease infinite;
          display: inline-block;
          position: relative;
        }
        .hero-sub {
          font-size: 0.5em;
          background: linear-gradient(
            135deg,
            #3b82f6 0%,
            #06b6d4 50%,
            #22d3ee 100%
          );
          background-size: 200% auto;
          background-clip: text;
          -webkit-background-clip: text;
          color: transparent;
          animation: shimmer 8s ease infinite;
          font-weight: 700;
          letter-spacing: 0.04em;
        }

        .animate-shimmer {
          background: linear-gradient(
            110deg,
            #b8e4ed 0%,
            #67c2d2 22%,
            #e2f6fa 44%,
            #67c2d2 66%,
            #b8e4ed 100%
          );
          background-size: 260% auto;
          background-clip: text;
          -webkit-background-clip: text;
          color: transparent;
          animation: shimmer 5s linear infinite;
        }
        .animate-fade-up {
          animation: fadeUp 0.85s ease both;
        }
        .animate-bob {
          animation: bob 2.4s ease-in-out infinite;
        }

        /* Brutalist geometric elements */
        .brutal-border {
          border: 2px solid rgba(255, 255, 255, 0.08);
        }
        .brutal-border-top {
          border-top: 4px solid rgba(6, 182, 212, 0.3);
        }
        .brutal-shadow {
          box-shadow: 8px 8px 0 rgba(0, 0, 0, 0.15);
        }
        .brutal-shadow-hover:hover {
          box-shadow: 12px 12px 0 rgba(0, 0, 0, 0.2);
          transform: translate(-2px, -2px);
        }

        .swiper-wrapper {
          align-items: flex-end !important;
        }
        .swiper-pagination-bullet {
          background: rgba(6, 182, 212, 0.5);
          opacity: 0.6;
        }
        .swiper-pagination-bullet-active {
          background: #06b6d4;
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
          align-items: flex-end;
        }

        /* Swiper navigation hint - shows there are more cards */
        .swiper-hint {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          margin-top: 12px;
          padding: 6px 16px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 20px;
          font-size: 0.6rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.3);
          font-family: "Helvetica", "Arial", sans-serif;
        }
        .swiper-hint::after {
          content: '';
          width: 16px;
          height: 16px;
          background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.3)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 18l6-6-6-6'/%3E%3C/svg%3E") no-repeat center;
          background-size: contain;
          display: inline-block;
          animation: bob 1.6s ease-in-out infinite;
        }

        /* ---- Card styles ---- */
        .brand-card {
          position: relative;
          border-radius: 4px;
          border: 2px solid rgba(255, 255, 255, 0.2);
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 200px;
          height: 290px;
          padding: 0;
          flex-shrink: 0;
          box-shadow: 8px 8px 0 rgba(0, 0, 0, 0.2);
          transition: transform 0.38s cubic-bezier(0.34, 1.3, 0.64, 1),
            border-color 0.3s ease, box-shadow 0.38s ease,
            background-color 0.3s ease;
          will-change: transform;
          overflow: hidden;
        }
        .brand-card:hover {
          overflow: visible;
          transform: translateY(-8px) scale(1.02);
          box-shadow: 12px 12px 0 rgba(0, 0, 0, 0.25);
          border-color: rgba(255, 255, 255, 0.4);
        }

        .swiper-slide:not(.swiper-slide-active) .brand-card {
          transform: scale(0.85);
          box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.15);
          transition: transform 0.35s cubic-bezier(0.34, 1.3, 0.64, 1);
        }
        .swiper-slide:not(.swiper-slide-active) .brand-card:hover {
          transform: scale(0.9);
          border-color: rgba(255, 255, 255, 0.4);
          box-shadow: 8px 8px 0 rgba(0, 0, 0, 0.2);
        }

        .swiper-slide-active .brand-card {
          transform: scale(1.15);
          z-index: 5;
          border-color: rgba(255, 255, 255, 0.5);
          box-shadow: 12px 12px 0 rgba(0, 0, 0, 0.25);
          transition: transform 0.35s cubic-bezier(0.34, 1.3, 0.64, 1);
        }
        .swiper-slide-active .brand-card:hover {
          transform: scale(1.2) translateY(-8px);
          box-shadow: 16px 16px 0 rgba(0, 0, 0, 0.3);
          overflow: visible;
        }

        .brand-card::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 55%;
          border-radius: 4px 4px 0 0;
          background: linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.13) 0%,
            transparent 100%
          );
          pointer-events: none;
          z-index: 1;
        }
        .brand-card::after {
          content: "";
          position: absolute;
          bottom: 0;
          left: 8%;
          right: 8%;
          height: 2px;
          border-radius: 0 0 4px 4px;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.6),
            transparent
          );
          background-size: 200% auto;
          z-index: 2;
          animation: shimmerLine 2.4s linear infinite;
        }

        .brand-logo-zone {
          width: 100%;
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px 16px 12px;
          position: relative;
          z-index: 2;
        }
        .brand-logo-wrap {
          width: 100%;
          height: 72px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.97);
          border-radius: 4px;
          padding: 6px 10px;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18),
            inset 0 1px 0 rgba(255, 255, 255, 0.9);
          transition: box-shadow 0.3s ease, transform 0.3s ease;
        }
        .brand-card:hover .brand-logo-wrap {
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28),
            inset 0 1px 0 rgba(255, 255, 255, 0.9);
          transform: scale(1.03);
        }
        .brand-logo {
          height: 56px;
          width: auto;
          max-width: 88%;
          object-fit: contain;
        }
        .brand-divider {
          width: calc(100% - 28px);
          height: 1px;
          background: rgba(255, 255, 255, 0.15);
          flex-shrink: 0;
          margin: 0 14px;
          position: relative;
          z-index: 2;
        }

        .brand-info-zone {
          flex: 1;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          padding: 12px 14px 14px;
          position: relative;
          z-index: 2;
          min-height: 110px;
        }

        .brand-name {
          font-size: 0.9rem;
          font-weight: 700;
          font-family: "Helvetica", "Arial", sans-serif;
          background: linear-gradient(
            135deg,
            #ffffff 0%,
            #f0f9ff 40%,
            #e0f2fe 100%
          );
          background-clip: text;
          -webkit-background-clip: text;
          color: transparent;
          letter-spacing: 0.06em;
          text-align: center;
          text-transform: uppercase;
          line-height: 1.3;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
          position: relative;
          display: inline-block;
          padding-bottom: 6px;
        }
        .brand-name::after {
          content: "";
          position: absolute;
          bottom: 0;
          left: 20%;
          width: 60%;
          height: 1px;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 215, 0, 0.6),
            rgba(6, 182, 212, 0.6),
            transparent
          );
          border-radius: 2px;
        }

        .brand-tagline {
          font-size: 0.65rem;
          font-weight: 400;
          font-family: "Helvetica", "Arial", sans-serif;
          color: rgba(255, 245, 220, 0.92);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          text-align: center;
          margin-top: 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          white-space: pre-line;
          line-height: 1.3;
          max-width: 90%;
        }
        .brand-tagline::before,
        .brand-tagline::after {
          content: "✦";
          font-size: 0.5rem;
          color: rgba(255, 215, 0, 0.8);
          opacity: 0.8;
          flex-shrink: 0;
        }
        .brand-tagline:has(br)::before,
        .brand-tagline:has(br)::after {
          display: none;
        }

        .brand-desc {
          font-size: 0.7rem;
          line-height: 1.5;
          color: rgba(255, 255, 255, 0.9);
          text-align: center;
          font-weight: 400;
          max-height: 0;
          overflow: hidden;
          opacity: 0;
          transition: max-height 0.4s ease, opacity 0.3s ease 0.1s;
          margin: 4px 0;
        }
        .brand-card:hover .brand-desc {
          max-height: 120px;
          opacity: 1;
        }

        .brand-year {
          font-size: 0.65rem;
          font-weight: 500;
          font-family: "Helvetica", "Arial", sans-serif;
          color: rgba(255, 255, 245, 0.95);
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 215, 0, 0.4);
          padding: 3px 12px;
          border-radius: 2px;
          letter-spacing: 0.08em;
          white-space: nowrap;
          margin-top: 6px;
          backdrop-filter: blur(2px);
          transition: all 0.2s ease;
        }
        .brand-card:hover .brand-year {
          background: rgba(0, 0, 0, 0.5);
          border-color: rgba(255, 215, 0, 0.8);
          box-shadow: 0 0 6px rgba(255, 215, 0, 0.3);
        }

        .brand-visit {
          font-size: 0.58rem;
          font-weight: 500;
          font-family: "Helvetica", "Arial", sans-serif;
          color: rgba(255, 255, 240, 0.8);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          margin-top: 6px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          transition: color 0.2s, transform 0.2s;
          opacity: 0.9;
        }
        .brand-visit::after {
          content: "↗";
          font-size: 0.65rem;
          transition: transform 0.2s;
        }
        .brand-card:hover .brand-visit {
          color: rgba(255, 255, 240, 1);
          transform: translateX(2px);
        }
        .brand-card:hover .brand-visit::after {
          transform: translate(2px, -2px);
        }

        /* ---- Bento-style Process Cards - Bauhaus-Brutalism ---- */
        .bento-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }
        .bento-card {
          position: relative;
          background: rgba(15, 23, 42, 0.5);
          backdrop-filter: blur(4px);
          border-radius: 4px;
          padding: 28px 28px 24px;
          border: 2px solid rgba(71, 85, 105, 0.3);
          transition: all 0.4s cubic-bezier(0.34, 1.3, 0.64, 1);
          min-height: 180px;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          overflow: visible;
          box-shadow: 6px 6px 0 rgba(0, 0, 0, 0.15);
        }
        .bento-card:hover {
          transform: translateY(-4px) translateX(-2px);
          border-color: rgba(6, 182, 212, 0.5);
          box-shadow: 10px 10px 0 rgba(6, 182, 212, 0.08);
          background: rgba(15, 23, 42, 0.6);
        }
        .bento-number {
          font-size: 4rem;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.3);
          line-height: 1;
          font-family: "Helvetica", "Arial", sans-serif;
          position: absolute;
          bottom: 6px;
          right: 16px;
          user-select: none;
          pointer-events: none;
          transition: all 0.4s ease;
          z-index: 0;
          letter-spacing: -0.04em;
        }
        .bento-card:hover .bento-number {
          color: rgba(255, 255, 255, 0.5);
          transform: scale(1.05);
        }
        .bento-content {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          padding-top: 0;
        }
        .bento-title {
          font-family: "Helvetica", "Arial", sans-serif;
          font-size: 1.4rem;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.95);
          margin-bottom: 8px;
          margin-top: 0;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }
        .bento-desc {
          color: rgba(255, 255, 255, 0.55);
          font-size: 0.95rem;
          line-height: 1.6;
          max-width: 85%;
          margin: 0;
          font-family: "Helvetica", "Arial", sans-serif;
        }

        /* Bento card variations - Brutalist colored borders */
        .bento-card-1 {
          border-top: 6px solid #06b6d4;
        }
        .bento-card-2 {
          border-top: 6px solid #3b82f6;
        }
        .bento-card-3 {
          border-top: 6px solid #8b5cf6;
        }

        /* ---- Merged CTA Section - Bauhaus-Brutalism ---- */
        .cta-section {
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(4px);
          border-top: 4px solid rgba(6, 182, 212, 0.3);
          border-bottom: 4px solid rgba(6, 182, 212, 0.3);
          position: relative;
          overflow: hidden;
        }
        .cta-section::before {
          content: "";
          position: absolute;
          inset: 0;
          background-image: linear-gradient(
              rgba(255, 255, 255, 0.03) 1px,
              transparent 1px
            ),
            linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
          background-size: 40px 40px;
          pointer-events: none;
          z-index: 0;
        }
        .cta-content {
          position: relative;
          z-index: 1;
        }
        .cta-title {
          font-family: "Helvetica", "Arial", sans-serif;
          font-size: 3.5rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: -0.02em;
          line-height: 1.1;
          color: rgba(255, 255, 255, 0.95);
        }
        .cta-title .highlight {
          background: linear-gradient(135deg, #06b6d4, #3b82f6, #8b5cf6);
          background-size: 200% auto;
          background-clip: text;
          -webkit-background-clip: text;
          color: transparent;
          animation: shimmer 4s ease infinite;
        }
        .cta-subtitle {
          font-family: "Helvetica", "Arial", sans-serif;
          font-size: 1.1rem;
          font-weight: 300;
          color: rgba(255, 255, 255, 0.5);
          letter-spacing: 0.04em;
        }
        .cta-divider {
          width: 80px;
          height: 3px;
          background: linear-gradient(90deg, #06b6d4, #8b5cf6);
          margin: 16px auto;
        }
        .btn-brutal {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 16px 40px;
          background: rgba(255, 255, 255, 0.05);
          border: 2px solid rgba(6, 182, 212, 0.4);
          border-radius: 2px;
          font-family: "Helvetica", "Arial", sans-serif;
          font-size: 0.85rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: white;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 6px 6px 0 rgba(6, 182, 212, 0.1);
          position: relative;
          background: linear-gradient(135deg, rgba(6, 182, 212, 0.1), rgba(59, 130, 246, 0.1));
        }
        .btn-brutal:hover {
          transform: translate(-2px, -2px);
          box-shadow: 10px 10px 0 rgba(6, 182, 212, 0.2);
          border-color: rgba(6, 182, 212, 0.8);
          background: linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(59, 130, 246, 0.2));
        }
        .btn-brutal svg {
          width: 18px;
          height: 18px;
        }

        /* ---- Responsive ---- */
        @media (max-width: 1024px) {
          .cta-title {
            font-size: 3rem;
          }
          .bento-number {
            font-size: 3.5rem;
          }
        }

        @media (max-width: 768px) {
          .bento-grid {
            grid-template-columns: 1fr;
            gap: 16px;
          }
          .bento-card {
            min-height: 130px;
            padding: 20px 20px 18px;
          }
          .bento-number {
            font-size: 3rem;
            bottom: 4px;
            right: 12px;
            color: rgba(255, 255, 255, 0.25);
          }
          .bento-title {
            font-size: 1.2rem;
          }
          .bento-desc {
            font-size: 0.85rem;
            max-width: 80%;
          }
          .bento-card:hover .bento-number {
            color: rgba(255, 255, 255, 0.4);
          }
          .cta-title {
            font-size: 2.5rem;
          }
          .cta-subtitle {
            font-size: 1rem;
          }
          .btn-brutal {
            width: 100%;
            justify-content: center;
            padding: 14px 20px;
          }
          .hero-title {
            font-size: 3rem !important;
          }
          .aurora-blob-1 {
            width: 80vw;
            height: 80vw;
            filter: blur(60px);
          }
          .aurora-blob-2 {
            width: 70vw;
            height: 70vw;
            filter: blur(60px);
          }
          .aurora-blob-3 {
            width: 60vw;
            height: 60vw;
            filter: blur(60px);
          }
          .aurora-blob-4 {
            width: 50vw;
            height: 50vw;
            filter: blur(60px);
          }
        }

        @media (max-width: 480px) {
          .bento-card {
            min-height: 110px;
            padding: 16px 16px 14px;
            border-radius: 4px;
          }
          .bento-number {
            font-size: 2.5rem;
            bottom: 2px;
            right: 10px;
            color: rgba(255, 255, 255, 0.25);
          }
          .bento-title {
            font-size: 1rem;
          }
          .bento-desc {
            font-size: 0.8rem;
            max-width: 75%;
          }
          .bento-card:hover .bento-number {
            color: rgba(255, 255, 255, 0.4);
          }
          .cta-title {
            font-size: 1.8rem;
          }
          .cta-subtitle {
            font-size: 0.85rem;
          }
          .btn-brutal {
            font-size: 0.75rem;
            padding: 12px 16px;
          }
          .hero-title {
            font-size: 2.2rem !important;
          }
          .hero-sub {
            font-size: 0.4em !important;
          }
          .swiper-hint {
            font-size: 0.5rem;
            padding: 4px 12px;
          }
          .swiper-hint::after {
            width: 12px;
            height: 12px;
          }
        }

        /* Mobile adjustments for brand cards */
        @media (max-width: 640px) {
          .brand-card {
            width: 160px;
            height: 260px;
            border-radius: 4px;
          }
          .brand-logo-zone {
            padding: 14px 12px 10px;
          }
          .brand-logo-wrap {
            height: 60px;
            border-radius: 4px;
          }
          .brand-logo {
            height: 48px;
          }
          .brand-info-zone {
            padding: 10px 12px 12px;
            min-height: 95px;
          }
          .brand-name {
            font-size: 0.8rem;
          }
          .brand-tagline {
            font-size: 0.58rem;
            gap: 4px;
          }
          .brand-tagline::before,
          .brand-tagline::after {
            font-size: 0.45rem;
          }
          .brand-desc {
            font-size: 0.62rem;
          }
          .brand-year {
            font-size: 0.58rem;
            padding: 2px 10px;
          }
          .brand-visit {
            font-size: 0.52rem;
            margin-top: 4px;
          }

          .swiper-slide:not(.swiper-slide-active) .brand-card {
            transform: scale(0.82);
            box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.15);
          }
          .swiper-slide-active .brand-card {
            transform: scale(1.1);
            box-shadow: 8px 8px 0 rgba(0, 0, 0, 0.25);
          }
          .swiper-slide-active .brand-card:hover {
            transform: scale(1.16) translateY(-6px);
            box-shadow: 12px 12px 0 rgba(0, 0, 0, 0.3);
          }
          .brand-card:hover {
            transform: translateY(-4px) scale(1.02);
            box-shadow: 8px 8px 0 rgba(0, 0, 0, 0.2);
          }
          .brand-card {
            box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.15);
          }
        }

        @media (min-width: 1024px) {
          .brand-card {
            width: 210px;
            height: 300px;
          }
          .brand-logo-wrap {
            height: 76px;
          }
          .brand-logo {
            height: 60px;
          }
          .brand-name {
            font-size: 1rem;
          }
          .brand-tagline {
            font-size: 0.7rem;
          }
          .brand-desc {
            font-size: 0.72rem;
          }
          .brand-year {
            font-size: 0.7rem;
          }
          .brand-visit {
            font-size: 0.62rem;
          }
        }

        /* Extra small devices */
        @media (max-width: 360px) {
          .hero-title {
            font-size: 1.8rem !important;
          }
          .cta-title {
            font-size: 1.5rem;
          }
          .bento-title {
            font-size: 0.9rem;
          }
          .bento-desc {
            font-size: 0.75rem;
          }
          .bento-number {
            font-size: 2rem;
          }
          .brand-card {
            width: 130px;
            height: 220px;
          }
          .brand-logo-wrap {
            height: 48px;
          }
          .brand-logo {
            height: 38px;
          }
          .brand-name {
            font-size: 0.7rem;
          }
          .brand-info-zone {
            min-height: 75px;
            padding: 6px 8px 8px;
          }
          .swiper-slide-active .brand-card {
            transform: scale(1.05);
          }
          .swiper-slide:not(.swiper-slide-active) .brand-card {
            transform: scale(0.75);
          }
          .swiper-hint {
            font-size: 0.45rem;
            padding: 3px 10px;
          }
          .swiper-hint::after {
            width: 10px;
            height: 10px;
          }
        }
      `}</style>

      {/* Hero Section with Aurora Background */}
      <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-4 pt-12 pb-16 overflow-hidden">
        {/* Aurora Background */}
        <div className="aurora-container">
          <div className="aurora-blob aurora-blob-1" />
          <div className="aurora-blob aurora-blob-2" />
          <div className="aurora-blob aurora-blob-3" />
          <div className="aurora-blob aurora-blob-4" />
        </div>
        
        {/* Content */}
        <div className="relative z-10 max-w-5xl w-full animate-fade-up">
          <p className="text-base sm:text-lg md:text-xl tracking-[0.45em] uppercase text-cyan-400/80 font-medium mb-4">
            Welcome to
          </p>
          <h1 className="hero-title text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-semibold leading-[1.1] tracking-[-0.01em]">
            <span className="hero-main title-underline">Beauty One International</span>
            <br />
            <span className="hero-sub">PTE LTD</span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl tracking-[0.45em] uppercase text-cyan-400/80 font-medium mt-3">
            Facilities Management Team
          </p>
          <div className="flex items-center justify-center gap-3 my-6">
            <div className="h-px w-12 bg-gradient-to-r from-transparent to-cyan-400/60" />
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400/80" />
            <div className="h-px w-12 bg-gradient-to-l from-transparent to-cyan-400/60" />
          </div>
          <div className="mt-10 md:mt-14 w-full" style={{ paddingBottom: "100px" }}>
            <Swiper
              modules={[Autoplay, EffectCoverflow, Pagination]}
              effect="coverflow"
              grabCursor={true}
              centeredSlides={true}
              slidesPerView="auto"
              coverflowEffect={{
                rotate: 16,
                stretch: 0,
                depth: 80,
                modifier: 1,
                slideShadows: false,
              }}
              autoplay={{
                delay: 2400,
                disableOnInteraction: false,
                pauseOnMouseEnter: true,
                waitForTransition: true,
              }}
              pagination={{ clickable: true, dynamicBullets: true }}
              loop={true}
              speed={800}
              breakpoints={{
                320: { slidesPerView: 1.8, spaceBetween: 8 },
                480: { slidesPerView: 2.2, spaceBetween: 10 },
                640: { slidesPerView: 2.8, spaceBetween: 12 },
                768: { slidesPerView: 3.2, spaceBetween: 14 },
                1024: { slidesPerView: 3.7, spaceBetween: 18 },
                1280: { slidesPerView: 4.3, spaceBetween: 20 },
              }}
              className="mySwiper"
              style={{ paddingBottom: "2.8rem" }}
            >
              {swiperSlides.map((brand, index) => (
                <SwiperSlide key={`${brand.name}-${index}`} style={{ width: "auto" }}>
                  <div
                    className="brand-card"
                    style={{
                      backgroundColor:
                        hoveredBrand === brand.name ? brand.hoverBg : brand.cardBg,
                    }}
                    onMouseEnter={() => setHoveredBrand(brand.name)}
                    onMouseLeave={() => setHoveredBrand(null)}
                    onClick={() => handleClick(brand.url)}
                  >
                    <div className="brand-logo-zone">
                      <div className="brand-logo-wrap">
                        <img
                          src={brand.src}
                          alt={brand.name}
                          className="brand-logo"
                          loading="lazy"
                        />
                      </div>
                    </div>
                    <div className="brand-divider" />
                    <div className="brand-info-zone">
                      <div
                        style={{
                          width: "100%",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                        }}
                      >
                        <span className="brand-name">{brand.name}</span>
                        <span className="brand-tagline">{brand.tagline}</span>
                      </div>
                      <p className="brand-desc">{brand.description}</p>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                        }}
                      >
                        <span className="brand-year">Est. {brand.year}</span>
                        <span className="brand-visit">Visit site</span>
                      </div>
                    </div>
                  </div>
                </SwiperSlide>
              ))}
            </Swiper>
            {/* Hint to show there are more cards */}
            <div className="swiper-hint">Swipe to explore</div>
          </div>
        </div>
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-bob z-10">
          <span className="text-[9px] tracking-[0.35em] uppercase text-cyan-400/50">
            Scroll
          </span>
          <div className="w-px h-8 bg-gradient-to-b from-cyan-400/40 to-transparent" />
        </div>
      </section>

      {/* Process Section - Bento Style */}
      <section
        ref={processRef}
        className="pt-12 md:pt-16 pb-20 md:pb-28 px-4 md:px-8 relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 to-transparent pointer-events-none" />
        <div className="max-w-6xl mx-auto relative z-10">
          <div className="text-center mb-12">
            <h2 className="font-['Helvetica'] text-4xl sm:text-5xl md:text-6xl font-black text-white/90 leading-tight uppercase tracking-tight">
              We're Looking for <br className="sm:hidden" />
              <span className="text-cyan-400">Renovation Contractors</span>
            </h2>
          </div>

          <div className="text-center mb-14">
            <div className="w-16 h-1 bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 mx-auto" />
          </div>

          <div className="bento-grid">
            {/* Card 1 */}
            <div className="bento-card bento-card-1">
              <span className="bento-number">01</span>
              <div className="bento-content">
                <h3 className="bento-title">Express Interest</h3>
                <p className="bento-desc">
                  Submit your company profile and required documents for review.
                </p>
              </div>
            </div>

            {/* Card 2 */}
            <div className="bento-card bento-card-2">
              <span className="bento-number">02</span>
              <div className="bento-content">
                <h3 className="bento-title">Verification &amp; Onboarding</h3>
                <p className="bento-desc">
                  We evaluate your submission and qualify you as a partner.
                </p>
              </div>
            </div>

            {/* Card 3 */}
            <div className="bento-card bento-card-3">
              <span className="bento-number">03</span>
              <div className="bento-content">
                <h3 className="bento-title">Start Bidding</h3>
                <p className="bento-desc">
                  Gain access to renovation projects and submit your proposals.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Merged CTA Section - Bauhaus-Brutalism */}
      <section className="cta-section py-20 md:py-28 px-4">
        <div className="max-w-4xl mx-auto cta-content text-center">
          <h2 className="cta-title">
            Ready to <br />
            <span className="highlight">Join Us?</span>
          </h2>
          <div className="cta-divider" />
          <p className="cta-subtitle max-w-2xl mx-auto">
            Submit your interest today and our team will reach out soon.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => router.push("/contractor/expressInterest")}
              className="btn-brutal"
            >
              Submit Interest
              <svg
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}