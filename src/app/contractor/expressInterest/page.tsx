"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTheme } from "@/app/providers/ThemeProvider";

export default function ExpressInterestPage() {
  const { theme } = useTheme();
  const [isVisible, setIsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const tabs = [
    {
      label: "Terms & Conditions",
      content: "Sample Terms & Conditions document — This is a reference sample for review purposes only. The final T&C document will be provided upon successful selection.",
      color: "#e67e22"
    },
    {
      label: "Payment Procedure",
      content: "Sample Payment Procedure document — This is a reference sample for review purposes only. The final payment procedure will be provided upon successful selection.",
      color: "#e74c3c"
    },
    {
      label: "Defects Liability Period",
      content: "Sample Defects Liability Period (DLP) document — This is a reference sample for review purposes only. The final DLP document will be provided upon successful selection.",
      color: "#3498db"
    },
    {
      label: "Contract Document",
      content: (
        <div>
          <p style={{ marginBottom: '12px' }}>View the full contract document for renovation projects.</p>
          <a 
            href="/documents/Refurb_Template.pdf" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              background: '#c0392b',
              color: '#ffffff',
              textDecoration: 'none',
              borderRadius: '4px',
              fontFamily: 'Helvetica, Arial, sans-serif',
              fontSize: '0.85rem',
              fontWeight: '600',
              letterSpacing: '0.04em',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#a93226';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#c0392b';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} style={{ width: '18px', height: '18px' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            Download Contract Document (PDF)
          </a>
          <p style={{ marginTop: '12px', fontSize: '0.8rem', color: 'rgba(44, 62, 80, 0.5)' }}>
            This is a reference sample for review purposes only. The final contract document will be provided upon successful selection.
          </p>
        </div>
      ),
      color: "#9b59b6"
    },
    {
      label: "Tender Process",
      content: "Sample Tender Process overview — This is a reference sample for review purposes only. The final tender process will be provided upon successful selection.",
      color: "#e91e63"
    },
    {
      label: "Flow of Events",
      content: "Sample Flow of Events timeline — This is a reference sample for review purposes only. The final flow of events will be provided upon successful selection.",
      color: "#1abc9c"
    }
  ];

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      @keyframes gradientShift {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      
      .animate-fade-in {
        animation: fadeIn 0.6s ease-out forwards;
      }
      
      * {
        box-sizing: border-box;
      }
      
      .page-container {
        max-width: 940px;
        margin: 0 auto;
        padding: 0 24px;
      }
      
      .bauhaus-line {
        width: 100%;
        height: 4px;
        background: ${theme === 'dark'
          ? 'linear-gradient(90deg, #c0392b, #e67e22, #f1c40f, #2ecc71, #3498db, #9b59b6)'
          : 'linear-gradient(90deg, #c0392b, #e67e22, #f1c40f, #2ecc71, #3498db, #9b59b6)'};
        margin: 0;
      }
      
      .hero-section {
        padding: 48px 0 32px;
        text-align: center;
        position: relative;
        overflow: hidden;
      }
      
      .hero-title {
        font-family: 'Helvetica', 'Arial', sans-serif;
        font-weight: 700;
        font-size: 3.5rem;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        color: #2c3e50;
        margin: 0 0 4px 0;
        position: relative;
        z-index: 1;
        word-break: break-word;
      }
      
      .hero-title .highlight {
        color: #c0392b;
        font-weight: 700;
      }
      
      .hero-subtitle {
        font-family: 'Helvetica', 'Arial', sans-serif;
        font-weight: 700;
        font-size: 1.1rem;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        color: #2c3e50;
        margin: 0;
        position: relative;
        z-index: 1;
      }
      
      .bauhaus-divider {
        width: 120px;
        height: 3px;
        background: linear-gradient(90deg, #c0392b, #e67e22, #f1c40f);
        margin: 16px auto 0;
        position: relative;
        z-index: 1;
      }
      
      .intro-section {
        padding: 32px 0 16px;
        position: relative;
      }
      
      .intro-text {
        font-family: 'Helvetica', 'Arial', sans-serif;
        font-weight: 400;
        font-size: 1rem;
        line-height: 1.8;
        color: #2c3e50;
        max-width: 700px;
        margin: 0 auto;
        text-align: center;
        padding: 0 16px;
      }
      
      .disclaimer {
        font-family: 'Helvetica', 'Arial', sans-serif;
        font-size: 0.8rem;
        font-weight: 400;
        color: #2c3e50;
        text-align: center;
        max-width: 600px;
        margin: 16px auto 0;
        padding: 12px 20px;
        background: rgba(192, 57, 43, 0.04);
        border-left: 3px solid #c0392b;
        border-radius: 2px;
      }
      
      .disclaimer .asterisk {
        color: #c0392b;
        font-weight: 700;
      }
      
      .section-block {
        padding: 36px 0;
        border-bottom: 2px solid rgba(192, 57, 43, 0.06);
        position: relative;
      }
      
      .section-block:last-of-type {
        border-bottom: none;
      }
      
      .section-block-info {
        padding: 36px 0;
        border-bottom: 2px solid rgba(192, 57, 43, 0.06);
        position: relative;
        background: transparent;
        border-radius: 4px;
        margin-bottom: 4px;
      }
      
      .section-block-info .section-number {
        opacity: 0.6;
        color: #c0392b;
      }
      
      .section-block-info .section-description {
        color: #2c3e50;
      }
      
      .gradient-title {
        font-family: 'Helvetica', 'Arial', sans-serif;
        font-weight: 700;
        font-size: 1.4rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        margin: 0;
        position: relative;
        z-index: 1;
        word-break: break-word;
        background: linear-gradient(90deg, #e67e22, #e74c3c, #3498db, #9b59b6, #e91e63, #1abc9c);
        background-size: 300% 100%;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        animation: gradientShift 6s ease-in-out infinite;
      }
      
      .section-header {
        display: flex;
        align-items: baseline;
        gap: 12px;
        margin-bottom: 4px;
      }
      
      .section-number {
        font-family: 'Helvetica', 'Arial', sans-serif;
        font-size: 1.8rem;
        font-weight: 700;
        color: #c0392b;
        line-height: 1;
        letter-spacing: -0.02em;
        flex-shrink: 0;
        min-width: 60px;
        opacity: 0.6;
        text-align: right;
      }
      
      .section-heading {
        font-family: 'Helvetica', 'Arial', sans-serif;
        font-weight: 700;
        font-size: 1.4rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #2c3e50;
        margin: 0;
        position: relative;
        z-index: 1;
        word-break: break-word;
      }
      
      .section-heading .accent {
        color: #c0392b;
      }
      
      .section-description {
        font-family: 'Helvetica', 'Arial', sans-serif;
        font-size: 0.85rem;
        font-weight: 400;
        color: #2c3e50;
        margin: 4px 0 20px 72px;
        letter-spacing: 0.02em;
        word-break: break-word;
      }
      
      .section-description .required-star {
        color: #c0392b;
        font-weight: 700;
      }
      
      .tabs-container {
        margin-left: 72px;
        padding-left: 0;
      }
      
      .tabs-header {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        border-bottom: 2px solid rgba(44, 62, 80, 0.1);
        padding-bottom: 0;
        margin-bottom: 0;
      }
      
      .tab-button {
        font-family: 'Helvetica', 'Arial', sans-serif;
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        padding: 10px 18px;
        background: transparent;
        border: none;
        border-bottom: 3px solid transparent;
        color: rgba(44, 62, 80, 0.5);
        cursor: pointer;
        transition: all 0.3s ease;
        -webkit-tap-highlight-color: transparent;
        white-space: nowrap;
        position: relative;
      }
      
      .tab-button:hover {
        color: #2c3e50;
        background: rgba(0, 0, 0, 0.03);
      }
      
      .tab-button.active {
        font-weight: 700;
        border-bottom-width: 3px;
        border-bottom-style: solid;
        background: rgba(0, 0, 0, 0.02);
        padding-bottom: 10px;
      }
      
      .tab-button.active::after {
        content: '';
        position: absolute;
        bottom: -2px;
        left: 50%;
        transform: translateX(-50%);
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
      }
      
      .tab-button[data-color="0"] { color: rgba(44, 62, 80, 0.5); }
      .tab-button[data-color="0"].active { color: #e67e22; border-bottom-color: #e67e22; }
      .tab-button[data-color="0"]:hover { color: #e67e22; }
      
      .tab-button[data-color="1"] { color: rgba(44, 62, 80, 0.5); }
      .tab-button[data-color="1"].active { color: #e74c3c; border-bottom-color: #e74c3c; }
      .tab-button[data-color="1"]:hover { color: #e74c3c; }
      
      .tab-button[data-color="2"] { color: rgba(44, 62, 80, 0.5); }
      .tab-button[data-color="2"].active { color: #3498db; border-bottom-color: #3498db; }
      .tab-button[data-color="2"]:hover { color: #3498db; }
      
      .tab-button[data-color="3"] { color: rgba(44, 62, 80, 0.5); }
      .tab-button[data-color="3"].active { color: #9b59b6; border-bottom-color: #9b59b6; }
      .tab-button[data-color="3"]:hover { color: #9b59b6; }
      
      .tab-button[data-color="4"] { color: rgba(44, 62, 80, 0.5); }
      .tab-button[data-color="4"].active { color: #e91e63; border-bottom-color: #e91e63; }
      .tab-button[data-color="4"]:hover { color: #e91e63; }
      
      .tab-button[data-color="5"] { color: rgba(44, 62, 80, 0.5); }
      .tab-button[data-color="5"].active { color: #1abc9c; border-bottom-color: #1abc9c; }
      .tab-button[data-color="5"]:hover { color: #1abc9c; }
      
      .tab-content {
        padding: 20px 4px 8px 4px;
        font-family: 'Helvetica', 'Arial', sans-serif;
        font-size: 0.9rem;
        font-weight: 400;
        color: #2c3e50;
        line-height: 1.8;
        min-height: 80px;
        border-left: 3px solid ${tabs[activeTab]?.color || '#2c3e50'};
        padding-left: 16px;
        transition: border-color 0.3s ease;
      }
      
      .tab-content-placeholder {
        color: rgba(44, 62, 80, 0.4);
        font-style: italic;
      }
      
      .content-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 2px;
      }
      
      .content-row {
        display: flex;
        align-items: baseline;
        padding: 7px 0;
        padding-left: 0;
        margin-left: 72px;
        flex-wrap: wrap;
      }
      
      .content-label {
        font-family: 'Helvetica', 'Arial', sans-serif;
        font-size: 0.85rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        color: #2c3e50;
        min-width: 160px;
        flex-shrink: 0;
      }
      
      .content-label .required-star {
        color: #c0392b;
        font-weight: 700;
        margin-left: 4px;
      }
      
      .content-value {
        font-family: 'Helvetica', 'Arial', sans-serif;
        font-size: 1rem;
        font-weight: 400;
        color: #2c3e50;
        word-break: break-word;
      }
      
      .content-value-placeholder {
        font-family: 'Helvetica', 'Arial', sans-serif;
        font-size: 1rem;
        font-weight: 400;
        color: rgba(44, 62, 80, 0.4);
        word-break: break-word;
      }
      
      .personnel-role {
        font-family: 'Helvetica', 'Arial', sans-serif;
        font-size: 1rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        color: #2c3e50;
        margin: 14px 0 6px 72px;
        padding-bottom: 4px;
        border-bottom: 2px solid rgba(231, 76, 60, 0.06);
        word-break: break-word;
      }
      
      .personnel-role:first-of-type {
        margin-top: 0;
      }
      
      .doc-item {
        display: flex;
        align-items: baseline;
        padding: 8px 0;
        padding-left: 0;
        margin-left: 72px;
        flex-wrap: wrap;
      }
      
      .doc-name {
        font-family: 'Helvetica', 'Arial', sans-serif;
        font-size: 0.9rem;
        font-weight: 600;
        color: #2c3e50;
        min-width: 200px;
        flex-shrink: 0;
        word-break: break-word;
      }
      
      .doc-name .required-star {
        color: #c0392b;
        font-weight: 700;
        margin-left: 4px;
      }
      
      .doc-detail {
        font-family: 'Helvetica', 'Arial', sans-serif;
        font-size: 0.9rem;
        font-weight: 400;
        color: rgba(44, 62, 80, 0.5);
        word-break: break-word;
      }
      
      .doc-detail-placeholder {
        font-family: 'Helvetica', 'Arial', sans-serif;
        font-size: 0.9rem;
        font-weight: 400;
        color: rgba(44, 62, 80, 0.4);
        word-break: break-word;
      }
      
      .experience-table-wrapper {
        margin-left: 72px;
        padding-left: 0;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }
      
      .experience-table {
        width: 100%;
        border-collapse: collapse;
        font-family: 'Helvetica', 'Arial', sans-serif;
        font-size: 0.82rem;
        min-width: 680px;
      }
      
      .experience-table thead th {
        text-align: left;
        padding: 10px 12px 10px 0;
        font-size: 0.6rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(44, 62, 80, 0.35);
        border-bottom: 2px solid rgba(192, 57, 43, 0.1);
        white-space: nowrap;
      }
      
      .experience-table thead th:first-child {
        min-width: 100px;
      }
      
      .experience-table tbody td {
        padding: 10px 12px 10px 0;
        color: #2c3e50;
        border-bottom: 1px solid rgba(44, 62, 80, 0.04);
        font-weight: 400;
        vertical-align: middle;
        word-break: break-word;
      }
      
      .experience-table tbody tr:last-child td {
        border-bottom: none;
      }
      
      .experience-table .placeholder {
        color: rgba(44, 62, 80, 0.4);
        font-weight: 400;
      }
      
      .gst-details {
        margin-top: 0;
        padding-top: 0;
      }
      
      .btn-bauhaus {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        padding: 14px 40px;
        background: #c0392b;
        color: #ffffff;
        border: none;
        font-family: 'Helvetica', 'Arial', sans-serif;
        font-size: 0.85rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        transition: all 0.3s ease;
        cursor: pointer;
        text-decoration: none;
        position: relative;
        box-shadow: 0 4px 20px rgba(192, 57, 43, 0.15);
        -webkit-tap-highlight-color: transparent;
      }
      
      .btn-bauhaus::after {
        content: '';
        position: absolute;
        top: 4px;
        left: 4px;
        right: -4px;
        bottom: -4px;
        border: 2px solid rgba(241, 196, 15, 0.2);
        z-index: -1;
        transition: all 0.3s ease;
      }
      
      .btn-bauhaus:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 30px rgba(192, 57, 43, 0.25);
      }
      
      .btn-bauhaus:hover::after {
        top: 6px;
        left: 6px;
        right: -6px;
        bottom: -6px;
      }
      
      .btn-bauhaus:active {
        transform: translateY(0px);
      }
      
      .btn-bauhaus svg {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
      }
      
      .nav-link {
        font-family: 'Helvetica', 'Arial', sans-serif;
        font-size: 0.75rem;
        font-weight: 400;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: rgba(44, 62, 80, 0.3);
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: all 0.2s ease;
        border-bottom: 2px solid transparent;
        -webkit-tap-highlight-color: transparent;
      }
      
      .nav-link:hover {
        color: rgba(44, 62, 80, 0.7);
        border-bottom-color: rgba(241, 196, 15, 0.2);
      }
      
      .nav-link svg {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
      }
      
      .submit-section {
        text-align: center;
        padding: 36px 0 20px;
        border-top: 2px solid rgba(192, 57, 43, 0.05);
        position: relative;
      }
      
      .submit-instruction {
        font-family: 'Helvetica', 'Arial', sans-serif;
        font-size: 0.95rem;
        font-weight: 400;
        color: #2c3e50;
        max-width: 560px;
        margin: 0 auto 36px;
        line-height: 1.8;
        text-align: center;
        padding: 0 16px;
        word-break: break-word;
      }
      
      .submit-instruction strong {
        font-weight: 700;
        color: #c0392b;
        word-break: break-word;
      }
      
      .info-badge {
        display: inline-block;
        font-family: 'Helvetica', 'Arial', sans-serif;
        font-size: 0.6rem;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        padding: 2px 12px;
        border-radius: 2px;
        background: rgba(192, 57, 43, 0.06);
        color: #c0392b;
        border: 1px solid rgba(192, 57, 43, 0.06);
        margin-left: 12px;
        vertical-align: middle;
      }
      
      @media (max-width: 1024px) {
        .page-container {
          padding: 0 20px;
        }
        .hero-title {
          font-size: 3rem;
        }
        .section-heading {
          font-size: 1.3rem;
        }
        .gradient-title {
          font-size: 1.3rem;
        }
      }
      
      @media (max-width: 900px) {
        .page-container {
          padding: 0 18px;
        }
        .hero-title {
          font-size: 2.8rem;
        }
        .section-number {
          font-size: 1.6rem;
          min-width: 50px;
        }
        .section-heading {
          font-size: 1.2rem;
        }
        .gradient-title {
          font-size: 1.2rem;
        }
        .section-description {
          margin-left: 62px;
        }
        .content-row {
          margin-left: 62px;
        }
        .personnel-role {
          margin-left: 62px;
          font-size: 0.95rem;
        }
        .doc-item {
          margin-left: 62px;
        }
        .experience-table-wrapper {
          margin-left: 62px;
        }
        .gst-details .doc-item {
          margin-left: 62px;
        }
        .tabs-container {
          margin-left: 62px;
        }
        .tab-button {
          font-size: 0.65rem;
          padding: 8px 14px;
        }
      }
      
      @media (max-width: 768px) {
        .page-container {
          padding: 0 16px;
        }
        .hero-section {
          padding: 32px 0 24px;
        }
        .hero-title {
          font-size: 2.2rem;
          letter-spacing: 0.01em;
        }
        .hero-subtitle {
          font-size: 0.85rem;
          letter-spacing: 0.1em;
        }
        .bauhaus-divider {
          width: 80px;
        }
        .intro-text {
          font-size: 0.9rem;
          padding: 0 12px;
        }
        .section-block, .section-block-info {
          padding: 28px 0;
        }
        .section-number {
          font-size: 1.3rem;
          min-width: 38px;
        }
        .section-heading {
          font-size: 1.05rem;
          letter-spacing: 0.03em;
        }
        .gradient-title {
          font-size: 1.05rem;
        }
        .section-description {
          margin-left: 50px;
          font-size: 0.78rem;
          margin-bottom: 16px;
        }
        .content-row {
          flex-direction: column;
          align-items: flex-start;
          padding: 5px 0;
          margin-left: 50px;
        }
        .content-label {
          min-width: auto;
          font-size: 0.75rem;
          margin-bottom: 2px;
        }
        .content-value {
          font-size: 0.85rem;
        }
        .content-value-placeholder {
          font-size: 0.85rem;
        }
        .personnel-role {
          margin-left: 50px;
          font-size: 0.85rem;
          margin-top: 12px;
        }
        .doc-item {
          flex-direction: column;
          align-items: flex-start;
          padding: 6px 0;
          margin-left: 50px;
        }
        .doc-name {
          min-width: auto;
          font-size: 0.82rem;
          margin-bottom: 2px;
        }
        .doc-detail {
          font-size: 0.82rem;
        }
        .doc-detail-placeholder {
          font-size: 0.82rem;
        }
        .experience-table-wrapper {
          margin-left: 50px;
          padding-left: 0;
        }
        .experience-table {
          font-size: 0.72rem;
          min-width: 520px;
        }
        .experience-table thead th,
        .experience-table tbody td {
          padding: 8px 8px 8px 0;
        }
        .experience-table thead th {
          font-size: 0.55rem;
        }
        .btn-bauhaus {
          width: 100%;
          justify-content: center;
          padding: 14px 20px;
          font-size: 0.78rem;
        }
        .disclaimer {
          font-size: 0.72rem;
          padding: 10px 14px;
          margin: 12px auto 0;
        }
        .submit-instruction {
          font-size: 0.82rem;
          padding: 0 12px;
          margin-bottom: 28px;
        }
        .gst-details .doc-item {
          margin-left: 50px;
        }
        .submit-section {
          padding: 28px 0 16px;
        }
        .tabs-container {
          margin-left: 50px;
          padding-left: 0;
        }
        .tabs-header {
          flex-wrap: wrap;
          gap: 2px;
        }
        .tab-button {
          font-size: 0.6rem;
          padding: 6px 12px;
        }
        .tab-content {
          font-size: 0.82rem;
          padding: 16px 4px 4px 4px;
          padding-left: 12px;
        }
        .info-badge {
          font-size: 0.5rem;
          padding: 1px 8px;
          margin-left: 8px;
        }
      }
      
      @media (max-width: 600px) {
        .page-container {
          padding: 0 14px;
        }
        .hero-title {
          font-size: 1.8rem;
        }
        .hero-subtitle {
          font-size: 0.75rem;
          letter-spacing: 0.08em;
        }
        .section-number {
          font-size: 1.1rem;
          min-width: 32px;
        }
        .section-heading {
          font-size: 0.9rem;
          letter-spacing: 0.02em;
        }
        .gradient-title {
          font-size: 0.9rem;
        }
        .section-description {
          margin-left: 40px;
          font-size: 0.72rem;
          margin-bottom: 12px;
        }
        .content-row {
          margin-left: 40px;
          padding: 4px 0;
        }
        .content-label {
          font-size: 0.7rem;
        }
        .content-value {
          font-size: 0.78rem;
        }
        .content-value-placeholder {
          font-size: 0.78rem;
        }
        .personnel-role {
          margin-left: 40px;
          font-size: 0.78rem;
          margin-top: 10px;
          padding-bottom: 3px;
        }
        .doc-item {
          margin-left: 40px;
          padding: 5px 0;
        }
        .doc-name {
          font-size: 0.75rem;
        }
        .doc-detail {
          font-size: 0.75rem;
        }
        .doc-detail-placeholder {
          font-size: 0.75rem;
        }
        .experience-table-wrapper {
          margin-left: 40px;
        }
        .experience-table {
          font-size: 0.65rem;
          min-width: 420px;
        }
        .experience-table thead th,
        .experience-table tbody td {
          padding: 6px 6px 6px 0;
        }
        .experience-table thead th {
          font-size: 0.5rem;
        }
        .btn-bauhaus {
          font-size: 0.7rem;
          padding: 12px 16px;
          gap: 8px;
        }
        .btn-bauhaus svg {
          width: 16px;
          height: 16px;
        }
        .submit-instruction {
          font-size: 0.75rem;
          padding: 0 8px;
          margin-bottom: 24px;
        }
        .gst-details .doc-item {
          margin-left: 40px;
        }
        .disclaimer {
          font-size: 0.68rem;
          padding: 8px 12px;
          margin: 10px auto 0;
        }
        .submit-section {
          padding: 24px 0 12px;
        }
        .nav-link {
          font-size: 0.65rem;
        }
        .bauhaus-divider {
          width: 60px;
          margin: 12px auto 0;
        }
        .hero-section {
          padding: 24px 0 20px;
        }
        .intro-section {
          padding: 20px 0 12px;
        }
        .intro-text {
          font-size: 0.82rem;
          padding: 0 8px;
        }
        .section-block, .section-block-info {
          padding: 20px 0;
        }
        .tabs-container {
          margin-left: 40px;
        }
        .tab-button {
          font-size: 0.55rem;
          padding: 5px 10px;
        }
        .tab-content {
          font-size: 0.78rem;
          padding: 12px 2px 2px 2px;
          padding-left: 10px;
        }
        .info-badge {
          font-size: 0.45rem;
          padding: 1px 6px;
          margin-left: 6px;
        }
      }
      
      @media (max-width: 400px) {
        .page-container {
          padding: 0 10px;
        }
        .hero-title {
          font-size: 1.5rem;
        }
        .hero-subtitle {
          font-size: 0.65rem;
          letter-spacing: 0.06em;
        }
        .section-number {
          font-size: 0.9rem;
          min-width: 28px;
        }
        .section-heading {
          font-size: 0.78rem;
        }
        .gradient-title {
          font-size: 0.78rem;
        }
        .section-description {
          margin-left: 32px;
          font-size: 0.65rem;
        }
        .content-row {
          margin-left: 32px;
        }
        .content-label {
          font-size: 0.62rem;
        }
        .content-value {
          font-size: 0.72rem;
        }
        .content-value-placeholder {
          font-size: 0.72rem;
        }
        .personnel-role {
          margin-left: 32px;
          font-size: 0.7rem;
        }
        .doc-item {
          margin-left: 32px;
        }
        .doc-name {
          font-size: 0.68rem;
        }
        .doc-detail {
          font-size: 0.68rem;
        }
        .doc-detail-placeholder {
          font-size: 0.68rem;
        }
        .experience-table-wrapper {
          margin-left: 32px;
        }
        .experience-table {
          font-size: 0.58rem;
          min-width: 340px;
        }
        .experience-table thead th,
        .experience-table tbody td {
          padding: 5px 4px 5px 0;
        }
        .btn-bauhaus {
          font-size: 0.62rem;
          padding: 10px 14px;
          gap: 6px;
        }
        .btn-bauhaus svg {
          width: 14px;
          height: 14px;
        }
        .submit-instruction {
          font-size: 0.68rem;
          padding: 0 4px;
          margin-bottom: 20px;
        }
        .gst-details .doc-item {
          margin-left: 32px;
        }
        .disclaimer {
          font-size: 0.6rem;
          padding: 6px 10px;
        }
        .submit-section {
          padding: 20px 0 10px;
        }
        .nav-link {
          font-size: 0.58rem;
        }
        .bauhaus-divider {
          width: 48px;
        }
        .hero-section {
          padding: 16px 0 14px;
        }
        .intro-text {
          font-size: 0.72rem;
        }
        .section-block, .section-block-info {
          padding: 16px 0;
        }
        .tabs-container {
          margin-left: 32px;
        }
        .tab-button {
          font-size: 0.5rem;
          padding: 4px 8px;
        }
        .tab-content {
          font-size: 0.72rem;
          padding: 10px 2px 2px 2px;
          padding-left: 8px;
        }
      }
      
      @media (hover: none) {
        .btn-bauhaus:hover {
          transform: none;
          box-shadow: 0 4px 20px rgba(192, 57, 43, 0.15);
        }
        .btn-bauhaus:hover::after {
          top: 4px;
          left: 4px;
          right: -4px;
          bottom: -4px;
        }
        .btn-bauhaus:active {
          transform: scale(0.98);
        }
        .nav-link:hover {
          color: rgba(44, 62, 80, 0.3);
          border-bottom-color: transparent;
        }
        .nav-link:active {
          color: rgba(44, 62, 80, 0.6);
        }
        .tab-button:hover {
          background: transparent;
        }
        .tab-button:active {
          opacity: 0.7;
        }
      }
      
      @media print {
        .nav-link {
          display: none;
        }
        .btn-bauhaus {
          background: #c0392b;
          color: white;
          box-shadow: none;
        }
        .btn-bauhaus::after {
          display: none;
        }
        .section-block, .section-block-info {
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .hero-section {
          break-inside: avoid;
        }
        .page-container {
          max-width: 100%;
        }
        .tabs-header {
          break-inside: avoid;
        }
        .tab-content {
          break-inside: avoid;
        }
        .gradient-title {
          -webkit-text-fill-color: #2c3e50;
          background: none;
          color: #2c3e50;
        }
      }
      
      @media (prefers-reduced-motion: reduce) {
        .animate-fade-in {
          animation: none;
          opacity: 1;
        }
        .btn-bauhaus {
          transition: none;
        }
        .btn-bauhaus:hover {
          transform: none;
        }
        .tab-button {
          transition: none;
        }
        .gradient-title {
          animation: none;
          background-size: 100% 100%;
        }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, [activeTab, theme]);

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <div className={`page-container py-6 sm:py-10 transition-opacity duration-700 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
        
        <div className="bauhaus-line animate-fade-in" style={{ animationDelay: '0ms' }} />

        <div className="animate-fade-in" style={{ animationDelay: '50ms', paddingTop: '20px' }}>
          <Link href="/" className="nav-link">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Return to Home
          </Link>
        </div>

        <div className="hero-section animate-fade-in" style={{ animationDelay: '100ms' }}>
          <h1 className="hero-title">
            Expression of <span className="highlight">Interest</span>
          </h1>
          <p className="hero-subtitle">Renovation Contract</p>
          <div className="bauhaus-divider" />
        </div>

        <div className="intro-section animate-fade-in" style={{ animationDelay: '150ms' }}>
          <p className="intro-text">
            Our commitment to transparency and fairness ensures that every applicant receives equal consideration 
            based on merit and capability. Please review the requirements below and submit the requested information 
            and documents via email to our Facilities Management team.
          </p>
          <div className="disclaimer">
            <span className="asterisk">*</span> Indicates required information that must be provided
          </div>
        </div>

        <div className="section-block-info animate-fade-in" style={{ animationDelay: '180ms' }}>
          <div className="section-header">
            <span className="section-number">01</span>
            <h2 className="gradient-title">Contract Information</h2>
          </div>
          <p className="section-description">
            Review the following documents before submitting your interest
            <span className="info-badge">For Reference</span>
          </p>
          
          <div className="tabs-container">
            <div className="tabs-header">
              {tabs.map((tab, index) => (
                <button
                  key={index}
                  className={`tab-button ${activeTab === index ? 'active' : ''}`}
                  data-color={index}
                  onClick={() => setActiveTab(index)}
                  style={activeTab === index ? { color: tab.color, borderBottomColor: tab.color } : {}}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="tab-content" style={{ borderLeftColor: tabs[activeTab].color }}>
              {tabs[activeTab].content}
            </div>
          </div>
        </div>

        <div className="section-block animate-fade-in" style={{ animationDelay: '200ms' }}>
          <div className="section-header">
            <span className="section-number">02</span>
            <h2 className="section-heading">Company <span className="accent">Details</span></h2>
          </div>
          <p className="section-description">Company information, capabilities, and organizational structure</p>
          
          <div className="content-grid">
            <div className="content-row">
              <span className="content-label">Company Name <span className="required-star">*</span></span>
              <span className="content-value content-value-placeholder">[Your Company Name]</span>
            </div>
            <div className="content-row">
              <span className="content-label">Company Strength <span className="required-star">*</span></span>
              <span className="content-value content-value-placeholder">[Core competencies, key personnel, operational capabilities]</span>
            </div>
            <div className="content-row">
              <span className="content-label">Organisation Chart <span className="required-star">*</span></span>
              <span className="content-value doc-detail">Organisation Chart — PDF or Image (Max 10MB)</span>
            </div>
          </div>
        </div>

        <div className="section-block animate-fade-in" style={{ animationDelay: '250ms' }}>
          <div className="section-header">
            <span className="section-number">03</span>
            <h2 className="section-heading">Authorized <span className="accent">Personnel</span></h2>
          </div>
          <p className="section-description">Primary contacts from your company</p>
          
          <div className="personnel-role">Director — Primary Authority</div>
          <div className="content-grid">
            <div className="content-row">
              <span className="content-label">Full Name <span className="required-star">*</span></span>
              <span className="content-value content-value-placeholder">[Director Name]</span>
            </div>
            <div className="content-row">
              <span className="content-label">Official Email <span className="required-star">*</span></span>
              <span className="content-value content-value-placeholder">[director@company.com]</span>
            </div>
            <div className="content-row">
              <span className="content-label">Phone Number <span className="required-star">*</span></span>
              <span className="content-value content-value-placeholder">[+65 XXXX XXXX]</span>
            </div>
          </div>
          
          <div className="personnel-role" style={{ marginTop: '18px' }}>Project Manager — Operational Lead</div>
          <div className="content-grid">
            <div className="content-row">
              <span className="content-label">Full Name <span className="required-star">*</span></span>
              <span className="content-value content-value-placeholder">[Project Manager Name]</span>
            </div>
            <div className="content-row">
              <span className="content-label">Official Email <span className="required-star">*</span></span>
              <span className="content-value content-value-placeholder">[pm@company.com]</span>
            </div>
            <div className="content-row">
              <span className="content-label">Phone Number <span className="required-star">*</span></span>
              <span className="content-value content-value-placeholder">[+65 XXXX XXXX]</span>
            </div>
          </div>
        </div>

        <div className="section-block animate-fade-in" style={{ animationDelay: '300ms' }}>
          <div className="section-header">
            <span className="section-number">04</span>
            <h2 className="section-heading">Financial &amp; <span className="accent">Legal</span> Verification</h2>
          </div>
          <p className="section-description">Required documentation for compliance and evaluation</p>
          
          <div className="doc-item">
            <span className="doc-name">BIZ File <span className="required-star">*</span></span>
            <span className="doc-detail">Business Registration — PDF, Image, or ZIP (Max 10MB)</span>
          </div>
          <div className="doc-item">
            <span className="doc-name">BIZ Safe Certificate <span className="required-star">*</span></span>
            <span className="doc-detail">BIZ Safe Certificate — PDF, Image, or ZIP (Max 10MB)</span>
          </div>
          <div className="doc-item">
            <span className="doc-name">Financial Audit <span className="required-star">*</span></span>
            <span className="doc-detail">Most Recent — PDF or Image (Max 10MB)</span>
          </div>
          <div className="doc-item">
            <span className="doc-name">Bank Record Letter</span>
            <span className="doc-detail">Bank Record Letter — PDF or Image (Max 10MB)</span>
          </div>
          <div className="doc-item">
            <span className="doc-name">Bank Records <span className="required-star">*</span></span>
            <span className="doc-detail">Past 2 Years Bank Records — PDF or Image (Max 10MB)</span>
          </div>
          <div className="doc-item">
            <span className="doc-name">Risk Verification</span>
            <span className="doc-detail">Credit reports, solvency letters, insurance — PDF or Image (Max 10MB)</span>
          </div>
        </div>

        <div className="section-block animate-fade-in" style={{ animationDelay: '350ms' }}>
          <div className="section-header">
            <span className="section-number">05</span>
            <h2 className="section-heading">GST <span className="accent">Registration</span></h2>
          </div>
          <p className="section-description">If your company is GST-registered, please provide the following</p>
          
          <div className="gst-details">
            <div className="doc-item" style={{ marginLeft: '72px' }}>
              <span className="doc-name">GST Registration Number</span>
              <span className="doc-detail doc-detail-placeholder">[GST Registration Number]</span>
            </div>
            <div className="doc-item" style={{ marginLeft: '72px' }}>
              <span className="doc-name">GST Certificate</span>
              <span className="doc-detail">GST Certificate — PDF or Image (Max 10MB)</span>
            </div>
          </div>
        </div>

        <div className="section-block animate-fade-in" style={{ animationDelay: '400ms' }}>
          <div className="section-header">
            <span className="section-number">06</span>
            <h2 className="section-heading">Corporate <span className="accent">Experience</span></h2>
          </div>
          <p className="section-description">Please provide details of at least two current and two past projects <span className="required-star">*</span></p>
          
          <div className="experience-table-wrapper">
            <table className="experience-table">
              <thead>
                <tr>
                  <th>Project Name</th>
                  <th>Contract Period</th>
                  <th>Site Description</th>
                  <th>Contract Sum (SGD)</th>
                  <th>Client / Developer</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="placeholder">[Current Project 1 Name]</td>
                  <td className="placeholder">[Start – End Date]</td>
                  <td className="placeholder">[Location, Size]</td>
                  <td className="placeholder">[1,250,000]</td>
                  <td className="placeholder">[Client Name]</td>
                </tr>
                <tr>
                  <td className="placeholder">[Current Project 2 Name]</td>
                  <td className="placeholder">[Start – End Date]</td>
                  <td className="placeholder">[Location, Size]</td>
                  <td className="placeholder">[1,250,000]</td>
                  <td className="placeholder">[Client Name]</td>
                </tr>
                <tr>
                  <td className="placeholder">[Past Project 1 Name]</td>
                  <td className="placeholder">[Start – End Date]</td>
                  <td className="placeholder">[Location, Size]</td>
                  <td className="placeholder">[1,250,000]</td>
                  <td className="placeholder">[Client Name]</td>
                </tr>
                <tr>
                  <td className="placeholder">[Past Project 2 Name]</td>
                  <td className="placeholder">[Start – End Date]</td>
                  <td className="placeholder">[Location, Size]</td>
                  <td className="placeholder">[1,250,000]</td>
                  <td className="placeholder">[Client Name]</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="submit-section animate-fade-in" style={{ animationDelay: '450ms' }}>
          <div className="section-header" style={{ justifyContent: 'center', marginBottom: '8px' }}>
            <h2 className="section-heading" style={{ textAlign: 'center' }}>
              Submit <span className="accent">Your Interest</span>
            </h2>
          </div>
          <div className="bauhaus-divider" style={{ margin: '12px auto 28px' }} />
          
          <p className="submit-instruction">
            Please compile all required information and supporting documents into a single email 
            and forward your submission to <strong>tender_enquiries@beautyone.com.sg</strong>
          </p>

          <div>
            <a
              href="mailto:tender_enquiries@beautyone.com.sg
              
              
              
              
              
              
              
              
              
              
              
              
              
              
              
              
              
              
              
              
              
              ?subject=Expression%20of%20Interest%20-%20Renovation%20Contract"
              className="btn-bauhaus"
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Submit Interest via Email
            </a>
          </div>
        </div>

        <div className="bauhaus-line animate-fade-in" style={{ animationDelay: '500ms', marginTop: '16px' }} />

      </div>
    </div>
  );
}