import type { Metadata, Viewport } from "next";
import { ThemeSync } from "@/components/ThemeSync";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const description = "Practise spoken English: talk about a topic, get corrections sentence by sentence.";

export const metadata: Metadata = {
  // Origin only: Next prepends the basePath to file-convention images (opengraph-image.png) itself.
  metadataBase: new URL("https://tatuck.github.io"),
  title: "LanguageTrainer",
  description,
  openGraph: { title: "LanguageTrainer", description, type: "website", url: "https://tatuck.github.io/language-trainer/" },
  twitter: { card: "summary_large_image", title: "LanguageTrainer", description },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the inline script stamps data-theme before React hydrates.
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-white font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
