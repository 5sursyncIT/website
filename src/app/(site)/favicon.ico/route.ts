// Compatibility for clients that request the conventional favicon URL.
export function GET() {
  return new Response(null, {status:308,headers:{Location:'/favicon-5.png?v=20261007','Cache-Control':'public, max-age=3600'}});
}
