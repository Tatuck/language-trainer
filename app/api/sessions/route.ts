import { NextResponse } from "next/server";
import { listSessions, type SessionSummary } from "@/lib/db";
import { serverError } from "./responses";

/** Summaries of every session, newest first. */
export async function GET(): Promise<Response> {
  try {
    return NextResponse.json<SessionSummary[]>(listSessions());
  } catch (err) {
    return serverError("GET /api/sessions", err);
  }
}
