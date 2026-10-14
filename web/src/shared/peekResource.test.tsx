import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@solidjs/testing-library";
import { Suspense, createResource } from "solid-js";
import { peekResource } from "./peekResource";

describe("peekResource", () => {
  it("keeps the page visible while the list is loading, then shows the rows", async () => {
    let resolveRows: (rows: { rows: string[] }) => void = () => {};
    const pending = new Promise<{ rows: string[] }>((resolve) => {
      resolveRows = resolve;
    });

    function Page() {
      const [data] = createResource(() => pending);
      const rows = () => peekResource(data)?.rows ?? [];
      return (
        <Suspense fallback={<p>Loading page…</p>}>
          <p>Purchase Receive</p>
          <p>{rows().length ? rows().join(", ") : "waiting"}</p>
        </Suspense>
      );
    }

    render(() => <Page />);
    expect(screen.getByText("Purchase Receive")).toBeInTheDocument();
    expect(screen.queryByText("Loading page…")).not.toBeInTheDocument();

    resolveRows({ rows: ["PO-1"] });
    await waitFor(() => expect(screen.getByText("PO-1")).toBeInTheDocument());
    expect(screen.queryByText("Loading page…")).not.toBeInTheDocument();
  });

  it("keeps the page visible when the list request fails", async () => {
    function Page() {
      const [data] = createResource(() => Promise.reject(new Error("Failed to read PO lines.")));
      return (
        <Suspense fallback={<p>Loading page…</p>}>
          <p>Purchase Receive</p>
          <p>{data.error ? String(data.error) : "waiting"}</p>
        </Suspense>
      );
    }

    render(() => <Page />);
    expect(screen.getByText("Purchase Receive")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Error: Failed to read PO lines.")).toBeInTheDocument());
    expect(screen.queryByText("Loading page…")).not.toBeInTheDocument();
  });
});
