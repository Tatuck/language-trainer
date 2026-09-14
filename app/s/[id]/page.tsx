"use client";

import { use } from "react";
import { SessionView } from "./SessionView";

export default function SessionPage({ params }: PageProps<"/s/[id]">) {
  const { id } = use(params);
  return <SessionView id={id} />;
}
