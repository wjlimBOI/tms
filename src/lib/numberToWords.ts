// lib/numberToWords.ts

/**
 * Convert a currency amount to its English words form, e.g. 1234.5 -> "One Thousand Two Hundred Thirty Four and Fifty Cents".
 */
export const numberToWords = (num: number): string => {
  if (num === 0) return "Zero";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const thousands = ["", "Thousand", "Million", "Billion"];
  const convertChunk = (n: number): string => {
    if (n === 0) return "";
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + ones[n % 10] : "");
    return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 !== 0 ? " " + convertChunk(n % 100) : "");
  };
  let remaining = Math.floor(num);
  let result = "";
  let group = 0;
  while (remaining > 0) {
    const chunk = remaining % 1000;
    if (chunk !== 0) {
      result = convertChunk(chunk) + (thousands[group] ? " " + thousands[group] : "") + (result ? " " + result : "");
    }
    remaining = Math.floor(remaining / 1000);
    group++;
  }
  const cents = Math.round((num - Math.floor(num)) * 100);
  if (cents > 0) result += " and " + convertChunk(cents) + " Cents";
  return result.trim();
};
