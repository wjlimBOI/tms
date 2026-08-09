"use client";

import { useRef, useState, DragEvent, ChangeEvent } from "react";
import { Upload, File } from "lucide-react";
import { useNotify } from "@/components/ui/notification-provider";
import "./CompanyStampUpload.css";

interface CompanyStampUploadProps {
  label?: string;
  preview: string | null;
  onFileSelect: (file: File | null, previewUrl: string | null) => void;
  className?: string;
  disabled?: boolean;
}

export const CompanyStampUpload: React.FC<CompanyStampUploadProps> = ({
  label,
  preview,
  onFileSelect,
  className,
  disabled = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useNotify();

  const simulateProgress = (cb: () => void) => {
    setUploadProgress(0);
    setIsUploading(true);
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          cb();
          return 100;
        }
        return prev + 10;
      });
    }, 30);
  };

  const processFile = (file: globalThis.File) => {
    if (disabled) return;
    const valid = ["image/png", "image/jpeg", "image/jpg", "application/pdf"];
    if (!valid.includes(file.type)) return toast.error("Please upload PNG, JPG, or PDF.");
    if (file.size > 5 * 1024 * 1024) return toast.error("File must be <5MB.");
    setFileName(file.name);
    setFileSize((file.size / 1024).toFixed(0) + " KB");
    simulateProgress(() => {
      const reader = new FileReader();
      reader.onloadend = () => {
        onFileSelect(file, reader.result as string);
        setIsUploading(false);
        setUploadProgress(100);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0] && !disabled) processFile(e.target.files[0]);
  };
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled) setIsDragging(false);
  };
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (disabled) return;
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
  };
  const handleRemove = () => {
    if (!disabled) onFileSelect(null, null);
  };

  return (
    <div className={className}>
      <label className="font-bold block text-sm text-slate-700 mb-2">{label}</label>
      <div className="print:hidden">
        {!preview ? (
          <div
            onClick={() => !disabled && fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative cursor-pointer border-2 border-dashed rounded-xl p-6 text-center transition-all duration-300
              ${disabled ? "cursor-default opacity-60" : ""}
              ${
                isDragging
                  ? "border-blue-500 bg-blue-50/20"
                  : "border-slate-200 bg-slate-50/50 hover:border-slate-400 hover:bg-slate-50/80"
              }`}
          >
            <div className="flex flex-col items-center gap-2">
              <Upload
                className={`w-8 h-8 transition-transform ${
                  isDragging ? "scale-105 text-blue-500" : "text-slate-400"
                }`}
              />
              <div className="text-sm font-medium text-slate-700">
                Drag & drop your stamp, or <span className="text-blue-600">click to browse</span>
              </div>
              <p className="text-xs text-slate-500">PNG, JPG, PDF up to 5MB</p>
            </div>
            {isUploading && (
              <div
                className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500 transition-all duration-100"
                style={{ width: `${uploadProgress}%` }}
              />
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,application/pdf"
              onChange={handleFileSelect}
              className="hidden"
              disabled={disabled}
            />
          </div>
        ) : (
          <div className="border rounded-xl p-4 bg-white/50">
            <div className="flex items-start gap-3">
              {preview.startsWith("data:image") ? (
                <img src={preview} alt="Stamp" className="w-16 h-16 object-contain border rounded" />
              ) : (
                <div className="w-16 h-16 flex items-center justify-center bg-slate-100 rounded border">
                  <File className="w-8 h-8 text-slate-500" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate text-slate-700">{fileName}</p>
                <p className="text-xs text-slate-500">{fileSize}</p>
                {isUploading && (
                  <div className="mt-2 h-1 bg-emerald-500 rounded-full" style={{ width: `${uploadProgress}%` }} />
                )}
              </div>
              {!disabled && (
                <button onClick={handleRemove} className="text-slate-400 hover:text-red-500">
                  ✕
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="hidden print:block">
        {preview ? (
          <img src={preview} alt="Company Stamp" className="max-w-full max-h-20 object-contain mt-1" />
        ) : (
          <div className="print-stamp-line" style={{ borderBottom: "1.5px solid #000", minHeight: "0.5cm", marginTop: "0.5cm" }} />
        )}
      </div>
    </div>
  );
};
