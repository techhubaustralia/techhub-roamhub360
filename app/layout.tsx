import type { Metadata } from "next";
import { Sora, Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { brand } from "@/lib/brand";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { LocationProvider } from "@/components/location-context";
import { currentTenantId } from "@/lib/server/tenant";
import { getTenantBranding } from "@/lib/server/tenants";

// A hex accent → override the primary CSS token for the whole app (both themes). !important so it
// wins over the `.dark` declaration. --primary resolves to --orange, so overriding --orange + its
// hover variant recolours every primary surface with zero component changes (G3 white-label).
function accentStyle(accent: string | null): string | null {
  if (!accent || !/^#[0-9a-fA-F]{6}$/.test(accent)) return null;
  return `:root{--orange:${accent} !important;--orange-soft:${accent} !important;--primary:${accent} !important}`;
}

// RoamHub360 typefaces (shared with the TechHub Australia brand): Sora for display/
// headings, Plus Jakarta Sans for body/UI, Space Grotesk for data/meta.
const display = Sora({ variable: "--font-display", subsets: ["latin"], weight: ["600", "700", "800"] });
const body = Plus_Jakarta_Sans({ variable: "--font-body", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const mono = Space_Grotesk({ variable: "--font-space", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: `${brand.productName} · ${brand.company}`,
  description: brand.descriptor,
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const accent = accentStyle((await getTenantBranding(await currentTenantId())).accent); // null on default tenant

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      {accent && <head><style>{accent}</style></head>}
      <body className="h-full overflow-hidden">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <LocationProvider>
          <TooltipProvider delay={150}>
            <div className="grid h-screen grid-cols-1 md:grid-cols-[244px_1fr]">
              <Sidebar />
              <div className="flex min-w-0 flex-col overflow-hidden">
                <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-[10px] focus:bg-primary focus:px-4 focus:py-2 focus:text-[13px] focus:font-semibold focus:text-primary-foreground">
                  Skip to content
                </a>
                <Topbar />
                <main id="main" className="flex-1 overflow-auto px-6 py-6">{children}</main>
              </div>
            </div>
            <Toaster position="bottom-right" />
          </TooltipProvider>
          </LocationProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
