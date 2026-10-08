export const PHONE = "77 097 29 08";
// Senegal numbers: the CMS stores the local display form, the link needs +221.
export function telHref(display: string) {
  const digits = display.replace(/\D/g, "");
  return "tel:+" + (digits.startsWith("221") ? digits : "221" + digits);
}
