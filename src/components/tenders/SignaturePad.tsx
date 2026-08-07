"use client";

import { useEffect, useRef, useState } from "react";

interface SignaturePadProps {
  label: string;
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  className?: string;
  disabled?: boolean;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({
  label,
  value,
  onChange,
  className,
  disabled = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(!!value);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const hasDrawn = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctxRef.current = ctx;
    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setHasSignature(true);
      };
      img.src = value;
    }
  }, [value]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.preventDefault();
    setIsDrawing(true);
    hasDrawn.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX, clientY;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    ctxRef.current?.beginPath();
    ctxRef.current?.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (disabled || !isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX, clientY;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    ctxRef.current?.lineTo(x, y);
    ctxRef.current?.stroke();
    ctxRef.current?.beginPath();
    ctxRef.current?.moveTo(x, y);
    hasDrawn.current = true;
  };

  const endDrawing = () => {
    if (disabled) return;
    setIsDrawing(false);
    if (hasDrawn.current) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dataUrl = canvas.toDataURL();
      onChange(dataUrl);
      setHasSignature(true);
    }
  };

  const clearSignature = () => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    onChange(null);
    setHasSignature(false);
    hasDrawn.current = false;
  };

  return (
    <div className={className}>
      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">{label}</label>
      <div className="print:hidden">
        <div
          className="border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 p-1"
          style={{ width: "100%", maxWidth: "300px" }}
        >
          <canvas
            ref={canvasRef}
            width={300}
            height={120}
            style={{
              width: "100%",
              height: "auto",
              minHeight: "80px",
              cursor: disabled ? "default" : "crosshair",
            }}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={endDrawing}
            onMouseLeave={endDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={endDrawing}
            className="touch-none"
          />
        </div>
        {!disabled && (
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={clearSignature}
              className="text-xs text-red-600 dark:text-red-400 hover:underline"
            >
              Clear
            </button>
            {hasSignature && (
              <span className="text-xs text-green-600 dark:text-green-400">✓ Signature saved</span>
            )}
          </div>
        )}
      </div>
      <div className="hidden print:block">
        {value ? (
          <img src={value} alt="Signature" className="max-w-full max-h-16 object-contain mt-1" />
        ) : (
          <div className="print-signature-line" style={{ borderBottom: "1.5px solid #000", minHeight: "0.5cm", marginTop: "0.5cm" }} />
        )}
      </div>
      <style jsx>{`
        @media print {
          .print-signature-line {
            display: block !important;
            margin-top: 10mm !important;
            border-bottom: 1.5px solid #000000 !important;
            width: auto !important;
            min-width: 250px !important;
            max-width: 300px !important;
            min-height: 5mm !important;
          }
        }
      `}</style>
    </div>
  );
};
