// components/PrintDateCleanup.tsx
"use client";

import { useEffect } from "react";

export default function PrintDateCleanup() {
  useEffect(() => {
    const beforePrint = () => {
      const dateInputs = document.querySelectorAll('input[type="date"]');
      dateInputs.forEach((input) => {
        const dateInput = input as HTMLInputElement;
        if (!dateInput.value) {
          dateInput.classList.add("date-empty");
        } else {
          dateInput.classList.remove("date-empty");
        }
      });
    };

    const afterPrint = () => {
      const dateInputs = document.querySelectorAll('input[type="date"]');
      dateInputs.forEach((input) => {
        input.classList.remove("date-empty");
      });
    };

    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);

    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, []);

  return null;
}