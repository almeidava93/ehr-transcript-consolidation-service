import { NextResponse } from "next/server";

// Server-side proxy to the FastAPI service. Keeping this call on the server
// avoids CORS (the browser only ever talks to this Next.js origin) and keeps
// the API base URL out of the client bundle.
const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8080";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${API_BASE_URL}/v1/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    // Pass the API's response through verbatim (status + JSON payload).
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Could not reach the API at ${API_BASE_URL}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 502 },
    );
  }
}
