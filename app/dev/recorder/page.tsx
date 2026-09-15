import { notFound } from "next/navigation";
import { RecorderDev } from "./RecorderDev";

/** Dev-only harness for the recorder; a production build serves a 404 here. */
export default function RecorderDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <RecorderDev />;
}
