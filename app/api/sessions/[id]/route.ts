import { NextResponse } from "next/server";
import { deleteSession, getSession, putSession } from "@/lib/db";
import { requestTooLarge } from "@/lib/llm/body-limit";
import { SessionSchema } from "@/lib/session-normalise";
import type { Session } from "@/lib/types";
import { badRequest, noContent, notFound, parseJsonBody, serverError } from "../../responses";

type Context = RouteContext<"/api/sessions/[id]">;

export async function GET(_request: Request, ctx: Context): Promise<Response> {
  const { id } = await ctx.params;
  try {
    const session = getSession(id);
    if (!session) return notFound();
    return NextResponse.json<Session>(session);
  } catch (err) {
    return serverError("GET /api/sessions/[id]", err);
  }
}

/** Upsert the whole session; the body's id must match the URL. */
export async function PUT(request: Request, ctx: Context): Promise<Response> {
  const tooLarge = requestTooLarge(request);
  if (tooLarge) return tooLarge;
  const { id } = await ctx.params;

  const parsedBody = await parseJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = SessionSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (!issue) return badRequest("Invalid session");
    const at = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    return badRequest(`${at}${issue.message}`);
  }
  if (parsed.data.id !== id) return badRequest("Session id in the body must match the URL");

  try {
    putSession(parsed.data);
  } catch (err) {
    return serverError("PUT /api/sessions/[id]", err);
  }
  return noContent();
}

export async function DELETE(_request: Request, ctx: Context): Promise<Response> {
  const { id } = await ctx.params;
  try {
    return deleteSession(id) ? noContent() : notFound();
  } catch (err) {
    return serverError("DELETE /api/sessions/[id]", err);
  }
}
