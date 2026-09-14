import { SessionView } from "./SessionView";

export default async function SessionPage({ params }: PageProps<"/s/[id]">) {
  const { id } = await params;
  return <SessionView id={id} />;
}
