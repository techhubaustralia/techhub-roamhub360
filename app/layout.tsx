import type { Metadata, Viewport } from "next";
import { Sora, Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { brand } from "@/lib/brand";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/app-shell";
import { LocationProvider } from "@/components/location-context";
import { LiveProvider } from "@/components/live-provider";
import { PwaRegister } from "@/components/pwa-register";
import { CookieConsent } from "@/components/cookie-consent";
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
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: brand.productName },
};

export const viewport: Viewport = {
  themeColor: "#0a1830",
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
            <AppShell>{children}</AppShell>
            <LiveProvider />
            <PwaRegister />
            <CookieConsent />
            <Toaster position="bottom-right" />
          </TooltipProvider>
          </LocationProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
