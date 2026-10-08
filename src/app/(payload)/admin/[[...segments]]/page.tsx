import config from "@payload-config";
import { RootPage, generatePageMetadata } from "@payloadcms/next/views";
import { importMap } from "../importMap";
type Props = {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] }>;
};
export const generateMetadata = ({ params, searchParams }: Props) =>
  generatePageMetadata({ config, params, searchParams });
export default function Page({ params, searchParams }: Props) {
  return RootPage({ config, params, searchParams, importMap });
}
