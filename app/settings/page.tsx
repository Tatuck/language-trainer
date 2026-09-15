import type { Metadata } from "next";
import { SettingsForm } from "./SettingsForm";

export const metadata: Metadata = { title: "Settings · LanguageTrainer" };

export default function SettingsPage() {
  return <SettingsForm />;
}
