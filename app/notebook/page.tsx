import type { Metadata } from "next";
import { NotebookView } from "./NotebookView";

export const metadata: Metadata = { title: "Notebook · LanguageTrainer" };

export default function NotebookPage() {
  return <NotebookView />;
}
