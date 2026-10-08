import config from "@payload-config";
import { NotFoundPage } from "@payloadcms/next/views";
import { importMap } from "../importMap";
export default function NotFound() {
  return NotFoundPage({
    config,
    params: Promise.resolve({ segments: [] }),
    searchParams: Promise.resolve({}),
    importMap,
  });
}
