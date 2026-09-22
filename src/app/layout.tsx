import type { Metadata, Viewport } from "next";
// v0.9.14 — FONTES SELF-HOSTED: next/font/google baixa as fontes de
// fonts.googleapis.com DURANTE o build. Se o builder do deployment não
// alcançar o Google Fonts, o build falha. Com next/font/local os .woff2
// (subset latin, baixados uma única vez) viajam DENTRO do pacote — build
// 100% offline. As variáveis CSS (--font-*) são idênticas às de antes.
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { PwaBootstrap } from "@/components/PwaBootstrap";

const geistSans = localFont({
  src: "../fonts/Geist-Variable.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
});

const geistMono = localFont({
  src: "../fonts/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

const bangers = localFont({
  src: "../fonts/Bangers-Regular.woff2",
  variable: "--font-bangers",
  weight: "400",
  display: "swap",
});

const russoOne = localFont({
  src: "../fonts/RussoOne-Regular.woff2",
  variable: "--font-russo",
  weight: "400",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://guerreiros-misticos.exemplo.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Myst Ki Warriors — RPG Online Grátis no Navegador",
    template: "%s — Myst Ki Warriors",
  },
  description:
    "Crie seu guerreiro místico, treine atributos, aprenda técnicas lendárias com mestres, cumpra missões, funde guildas, enfrente chefes mundiais e colete as 7 Esferas do Dragão neste RPG de gerenciamento estilo browser game clássico.",
  keywords: [
    "RPG online",
    "browser game",
    "jogo de gerenciamento",
    "guerreiros místicos",
    "jogo grátis",
    "RPG no navegador",
    "browser game brasileiro",
  ],
  authors: [{ name: "Myst Ki Warriors" }],
  applicationName: "Myst Ki Warriors",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: SITE_URL,
    siteName: "Myst Ki Warriors",
    title: "Myst Ki Warriors — RPG Online Grátis",
    description:
      "Treine. Lute. Trabalhe. Colete as 7 Esferas do Dragão e domine o universo — RPG de gerenciamento no navegador, grátis.",
    images: [
      {
        url: "/images/banner.png",
        width: 1024,
        height: 576,
        alt: "Myst Ki Warriors carregando energia ao pôr do sol",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Myst Ki Warriors — RPG Online Grátis",
    description:
      "Treine. Lute. Trabalhe. Colete as 7 Esferas do Dragão e domine o universo.",
    images: ["/images/banner.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#1a1208",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${bangers.variable} ${russoOne.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
        <PwaBootstrap />
      </body>
    </html>
  );
}
