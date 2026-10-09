import { notFound } from "next/navigation";
// Unknown /en/... addresses get the English "not found" page.
export default function Missing() {
  notFound();
}
